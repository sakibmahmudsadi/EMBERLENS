"""FastAPI routes per API_SPECIFICATION.md. Scientific logic lives in services."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from backend.calendar_agg import COUNT_UNIT, METHOD_VERSION, SPATIAL_RULE
from backend.calendar_agg.aggregation import aggregate_calendar
from backend.config import Settings, get_settings
from backend.db.database import Database, init_db
from backend.exports.exporter import build_manifest, to_csv, to_geojson

router = APIRouter(prefix="/api/v1")

# Process-wide DB handle, initialized on app startup.
_db: Database | None = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = init_db(get_settings().db_path)
    return _db


def startup_db(settings: Settings) -> None:
    global _db
    _db = init_db(settings.db_path)


def error(status: int, code: str, message: str, details: dict[str, Any] | None = None) -> HTTPException:
    return HTTPException(
        status_code=status,
        detail={"error": {"code": code, "message": message, "details": details or {}}},
    )


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in row.items():
        out[k] = v.isoformat() if isinstance(v, datetime) else v
    return out


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "EMBERLENS", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/data-sources")
def data_sources(db: Database = Depends(get_db)) -> dict[str, Any]:
    snaps = db.list_snapshots()
    availability = db.list_availability()
    return {
        "snapshots": [_serialize(s) for s in snaps],
        "availability": [_serialize(a) for a in availability],
        "note": (
            "FIRMS date availability describes source-service coverage, not "
            "clear-sky or valid-pixel observation opportunity."
        ),
    }


@router.get("/aois")
def list_aois(db: Database = Depends(get_db)) -> list[dict[str, Any]]:
    return [_serialize(a) for a in db.list_aois()]


@router.get("/coverage")
def coverage(
    aoi_id: str | None = None,
    sensor: str | None = None,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    rows = db.list_availability()
    if sensor:
        rows = [r for r in rows if r.get("product_id", "").lower().startswith(sensor.lower())]
    return {
        "aoi_id": aoi_id,
        "availability": [_serialize(r) for r in rows],
        "observations": db.count_observations(),
        "note": "No source records returned means observation coverage unknown, not zero activity.",
    }


def _parse_dt(value: str | None, param: str) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise error(422, "INVALID_DATE_RANGE", f"{param} must be ISO-8601.")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/observations")
def observations(
    aoi_id: str | None = None,
    sensors: str | None = Query(default=None),
    platforms: str | None = Query(default=None),
    products: str | None = Query(default=None),
    start: str | None = None,
    end: str | None = None,
    page: int = 1,
    page_size: int = 100,
    include_native_fields: bool = False,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if start_dt and end_dt and end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "The end date must be later than the start date.")
    rows, total = db.query_observations(
        sensors=[s.strip() for s in sensors.split(",")] if sensors else None,
        platforms=[p.strip() for p in platforms.split(",")] if platforms else None,
        products=[p.strip() for p in products.split(",")] if products else None,
        start=start_dt,
        end=end_dt,
        page=page,
        page_size=page_size,
        include_native=include_native_fields,
    )
    return {
        "data": [_serialize(r) for r in rows],
        "pagination": {"page": page, "page_size": page_size, "total": total},
        "count_unit_note": "One row = one source observation, not one fire.",
    }


@router.get("/observations/{observation_id}")
def observation_detail(observation_id: str, db: Database = Depends(get_db)) -> dict[str, Any]:
    row = db.get_observation(observation_id)
    if row is None:
        raise error(404, "OBSERVATION_NOT_FOUND", "No observation with that ID.")
    return _serialize(row)


@router.get("/calendar")
def calendar(
    aoi_id: str,
    start: str,
    end: str,
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    aoi = db.get_aoi(aoi_id)
    if aoi is None:
        raise error(404, "AOI_NOT_FOUND", "AOI not found.")
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if not start_dt or not end_dt or end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "A valid start/end range is required.")
    month_span = (end_dt.year - start_dt.year) * 12 + (end_dt.month - start_dt.month) + 1
    if month_span > 24:
        raise error(422, "WINDOW_TOO_LARGE", "Prototype window is at most 24 months.")
    # Recompute live so the response always reflects current observations.
    rows = aggregate_calendar(
        db.observations_for_calendar(),
        aoi_id=aoi_id,
        aoi_geometry=aoi["geometry"],
        start=start_dt,
        end=end_dt,
    )
    for r in rows:
        db.insert_calendar_agg(r)
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for r in rows:
        grouped.setdefault((r["sensor"], r.get("platform") or "", r.get("product_id") or ""), []).append(r)
    return {
        "aoi": {"aoi_id": aoi_id, "name": aoi["name"], "crs": aoi["crs"]},
        "period": {"start": start_dt.isoformat(), "end": end_dt.isoformat(), "time_zone": "UTC"},
        "time_bin": "month",
        "count_unit": COUNT_UNIT,
        "spatial_rule": SPATIAL_RULE,
        "confidence_filter": None,
        "method_version": METHOD_VERSION,
        "series": [
            {
                "sensor": sensor,
                "platform": platform,
                "product_id": product,
                "values": [
                    {
                        "period_start": r["period_start_utc"].isoformat(),
                        "period_end": r["period_end_utc"].isoformat(),
                        "observation_count": r["observation_count"],
                        "coverage_status": r["coverage_status"],
                    }
                    for r in sorted(values, key=lambda x: x["period_start_utc"])
                ],
            }
            for (sensor, platform, product), values in grouped.items()
        ],
        "provenance": {
            "source_snapshot_ids": sorted({s["source_snapshot_id"] for s in db.list_snapshots()}),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "limitations": [
            "Counts are sensor-specific; MODIS and VIIRS are never summed.",
            "An empty bin means no source records returned; observation coverage unknown.",
        ],
    }


class ExportRequest(BaseModel):
    dataset_type: str = Field(default="observations", pattern="^(observations|calendar)$")
    format: str = Field(default="csv", pattern="^(csv|json|geojson)$")
    aoi_id: str | None = None
    start: str | None = None
    end: str | None = None
    sensors: list[str] | None = None
    platforms: list[str] | None = None
    products: list[str] | None = None


@router.post("/exports")
def export(req: ExportRequest, db: Database = Depends(get_db)) -> Response:
    start_dt, end_dt = _parse_dt(req.start, "start"), _parse_dt(req.end, "end")
    if start_dt and end_dt and end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "The end date must be later than the start date.")
    if req.dataset_type == "observations":
        rows, _ = db.query_observations(
            sensors=req.sensors, platforms=req.platforms, products=req.products,
            start=start_dt, end=end_dt, page_size=1000, include_native=True,
        )
    else:
        if not req.aoi_id:
            raise error(422, "AOI_REQUIRED", "aoi_id is required for calendar exports.")
        rows = db.list_calendar(req.aoi_id)
    aoi = db.get_aoi(req.aoi_id) if req.aoi_id else None
    manifest = build_manifest(
        dataset_type=req.dataset_type,
        aoi=({"aoi_id": aoi["aoi_id"], "name": aoi["name"], "crs": aoi["crs"]} if aoi else None),
        date_range={"start": (start_dt.isoformat() if start_dt else None),
                    "end": (end_dt.isoformat() if end_dt else None)},
        filters={"sensors": req.sensors, "platforms": req.platforms, "products": req.products},
        snapshots=[_serialize(s) for s in db.list_snapshots()],
        row_count=len(rows),
        count_unit=COUNT_UNIT if req.dataset_type == "calendar" else None,
        method_version=METHOD_VERSION,
    )
    ser_rows = [_serialize(r) for r in rows]
    if req.format == "geojson":
        payload = json.dumps({**to_geojson(ser_rows), "metadata_manifest": manifest})
        media = "application/geo+json"
    elif req.format == "json":
        payload = json.dumps({"data": ser_rows, "metadata_manifest": manifest}, indent=2)
        media = "application/json"
    else:
        payload = to_csv(ser_rows)
        if payload:
            payload += "\n# metadata_manifest: " + json.dumps(manifest) + "\n"
        media = "text/csv"
    fname = f"emberlens-{req.dataset_type}.{req.format}"
    return Response(
        content=payload,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
