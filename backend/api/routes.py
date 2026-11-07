"""FastAPI routes per API_SPECIFICATION.md. Scientific logic lives in services."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from backend.calendar_agg import COUNT_UNIT, METHOD_VERSION, SPATIAL_RULE
from backend.calendar_agg.aggregation import (
    aggregate_calendar,
    aggregate_calendar_from_month_counts,
)
from backend.config import Settings, get_settings
from backend.db.database import Database, init_db
from backend.event_detection.clustering import (
    DEFAULT_DISTANCE_M,
    cluster_observations,
)
from backend.event_detection.clustering import (
    METHOD_VERSION as GROUP_METHOD_VERSION,
)
from backend.exports.exporter import build_manifest, to_csv, to_geojson

router = APIRouter(prefix="/api/v1")

# Process-wide DB handle, initialized on app startup.
_db: Database | None = None


def get_db() -> Database:
    global _db
    if _db is None:
        _db = init_db(get_settings().db_path)
    return _db


def locked_db(db: Database = Depends(get_db)):
    """Serialize DuckDB access across FastAPI threadpool threads.

    DuckDB python connections raise 'connection is busy' on concurrent
    execute. Sync-dependency lock is held in the threadpool thread for the
    full endpoint execution, so mixed observations/calendar/coverage
    requests from one page load cannot interleave.
    """
    with db._lock:
        yield db


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


def _file_basename(value: Any) -> str:
    # Dataset manifests may have been created on a different OS; normalize both
    # separator styles before removing private local directory information.
    return Path(str(value).replace("\\", "/")).name


def _public_source_endpoint(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    value = re.sub(r"(?i)(/csv/)[a-f0-9]{32}(?=/)", r"\1<MAP_KEY>", value)
    return re.sub(r"(?i)([?&]MAP_KEY=)[^&#]+", r"\1<MAP_KEY>", value)


def _get_configured_aoi(db: Database, aoi_id: str) -> dict[str, Any]:
    if aoi_id not in get_settings().aoi_ids:
        raise error(404, "AOI_NOT_FOUND", "AOI not found.")
    aoi = db.get_aoi(aoi_id)
    if aoi is None:
        raise error(404, "AOI_NOT_FOUND", "AOI not found.")
    return aoi


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "EMBERLENS", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/data-sources")
def data_sources(db: Database = Depends(locked_db)) -> dict[str, Any]:
    snaps = db.list_snapshots()
    # D-01 fix (defense in depth): never expose absolute filesystem paths,
    # even for legacy snapshots written before the basename-only loader.
    for s in snaps:
        if s.get("source_file_uri"):
            s["source_file_uri"] = _file_basename(s["source_file_uri"])
        if s.get("source_endpoint"):
            s["source_endpoint"] = _public_source_endpoint(s["source_endpoint"])
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
def list_aois(db: Database = Depends(locked_db)) -> list[dict[str, Any]]:
    allowed = set(get_settings().aoi_ids)
    return [_serialize(a) for a in db.list_aois() if a["aoi_id"] in allowed]


@router.get("/coverage")
def coverage(
    aoi_id: str | None = None,
    sensor: str | None = None,
    platform: str | None = None,
    product_id: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Database = Depends(locked_db),
) -> dict[str, Any]:
    if aoi_id is not None:
        _get_configured_aoi(db, aoi_id)
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if start_dt and end_dt and end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "The end date must be later than the start date.")
    rows = db.list_availability()
    if sensor:
        rows = [r for r in rows if r.get("product_id", "").lower().startswith(sensor.lower())]
    if platform:
        selected = {value.strip() for value in platform.split(",") if value.strip()}
        rows = [r for r in rows if r.get("platform") in selected]
    if product_id:
        selected = {value.strip() for value in product_id.split(",") if value.strip()}
        rows = [r for r in rows if r.get("product_id") in selected]
    if start_dt or end_dt:
        query_start = start_dt.astimezone(timezone.utc) if start_dt else None
        query_end = end_dt.astimezone(timezone.utc) if end_dt else None  # end is exclusive

        def overlaps_query(item: dict[str, Any]) -> bool:
            raw_interval = item.get("date_or_interval", "")
            parts = raw_interval.split("..", maxsplit=1)
            try:
                record_start_date = datetime.fromisoformat(parts[0]).date()
                record_end_date = datetime.fromisoformat(parts[-1]).date()
            except (TypeError, ValueError):
                return False
            record_start = datetime.combine(record_start_date, datetime.min.time(), tzinfo=timezone.utc)
            record_end = datetime.combine(record_end_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
            return (query_start is None or record_end > query_start) and (
                query_end is None or record_start < query_end
            )

        rows = [r for r in rows if overlaps_query(r)]
    return {
        "aoi_id": aoi_id,
        "availability": [_serialize(r) for r in rows],
        "observations": db.count_observations(),
        "note": (
            "Availability and missing-day rows describe FIRMS source-service dates globally, "
            "not observation opportunities inside this AOI. No source records returned means "
            "observation coverage unknown, not zero activity."
        ),
    }


def _parse_dt(value: str | None, param: str) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise error(422, "INVALID_DATE_RANGE", f"{param} must be ISO-8601.")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _declared_calendar_series(
    db: Database,
    *,
    start: datetime,
    end: datetime,
    sensors: list[str] | None = None,
    platforms: list[str] | None = None,
    products: list[str] | None = None,
) -> set[tuple[str, str, str]]:
    """Return source series registered for this window, including empty results."""

    def snapshot_datetime(value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        if not isinstance(value, datetime):
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    query_start, query_end = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    series: set[tuple[str, str, str]] = set()
    for snapshot in db.list_snapshots():
        sensor, platform, product = snapshot["sensor"], snapshot["platform"], snapshot["product_id"]
        if not sensor or not platform or not product:
            continue
        if sensors and sensor not in sensors:
            continue
        # The national MODIS snapshot is retrieved as one combined source file,
        # but its rows retain their native Terra/Aqua platform identities. Never
        # invent a third calendar series from that file-level label.
        declared_platforms = (
            ["Terra", "Aqua"]
            if sensor == "MODIS" and platform.strip().casefold() == "terra+aqua"
            else [platform]
        )
        if platforms and not any(value in platforms for value in declared_platforms):
            continue
        if products and product not in products:
            continue
        snapshot_start = snapshot_datetime(snapshot.get("requested_start_utc"))
        snapshot_end = snapshot_datetime(snapshot.get("requested_end_utc"))
        if snapshot_start is not None and snapshot_start >= query_end:
            continue
        if snapshot_end is not None and snapshot_end < query_start:
            continue
        series.update(
            (sensor, value, product)
            for value in declared_platforms
            if not platforms or value in platforms
        )
    return series


def _build_calendar_rows(
    db: Database,
    *,
    aoi_id: str,
    aoi_geometry,
    start: datetime,
    end: datetime,
    sensors: list[str] | None = None,
    platforms: list[str] | None = None,
    products: list[str] | None = None,
    min_frp_native: float | None = None,
    daynight: str | None = None,
    min_modis_confidence: float | None = None,
    viirs_confidence_classes: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Compute calendar rows from the source DB without mutating it."""
    availability: dict[tuple[str, str, str], str] = {}
    for item in db.list_availability():
        day = item.get("date_or_interval", "")
        if item.get("availability_status") == "missing" and len(day) == 10:
            availability[(item["product_id"], item["platform"], day[:7])] = "missing"
    declared_series = _declared_calendar_series(
        db, start=start, end=end, sensors=sensors, platforms=platforms, products=products,
    )
    rectangular = aoi_geometry.geom_type == "Polygon" and aoi_geometry.equals(aoi_geometry.envelope)
    if rectangular:
        month_counts = db.query_observation_month_counts(
            aoi_geometry=aoi_geometry, start=start, end=end,
            sensors=sensors, platforms=platforms, products=products,
            min_frp_native=min_frp_native, daynight=daynight,
            min_modis_confidence=min_modis_confidence,
            viirs_confidence_classes=sorted(viirs_confidence_classes) if viirs_confidence_classes else None,
        )
        return aggregate_calendar_from_month_counts(
            month_counts, aoi_id=aoi_id, start=start, end=end,
            availability=availability, declared_series=declared_series,
        )

    observations = db.observations_for_calendar()
    for key, selected in (("sensor", sensors), ("platform", platforms), ("product_id", products)):
        if selected:
            observations = [row for row in observations if row[key] in selected]
    if min_frp_native is not None:
        observations = [row for row in observations if row.get("frp_native") is not None and row["frp_native"] >= min_frp_native]
    if daynight:
        observations = [row for row in observations if (row.get("daynight_native") or "").strip().upper() == daynight.upper()]
    if min_modis_confidence is not None:
        filtered = []
        for row in observations:
            if row["sensor"] != "MODIS":
                filtered.append(row)
                continue
            try:
                if float(row.get("confidence_raw")) >= min_modis_confidence:
                    filtered.append(row)
            except (TypeError, ValueError):
                pass
        observations = filtered
    if viirs_confidence_classes:
        observations = [row for row in observations if row["sensor"] != "VIIRS" or
                        (row.get("confidence_class_native") or "").strip().upper() in viirs_confidence_classes]
    return aggregate_calendar(
        observations, aoi_id=aoi_id, aoi_geometry=aoi_geometry,
        start=start, end=end, availability=availability,
        declared_series=declared_series,
    )


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
    min_frp_native: float | None = Query(default=None, ge=0),
    daynight: str | None = Query(default=None, pattern="^(D|N|d|n)$"),
    min_modis_confidence: float | None = Query(default=None, ge=0, le=100),
    viirs_confidence_classes: str | None = Query(default=None),
    db: Database = Depends(locked_db),
) -> dict[str, Any]:
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if start_dt and end_dt and end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "The end date must be later than the start date.")
    confidence_classes = [value.strip().upper() for value in viirs_confidence_classes.split(",") if value.strip()] if viirs_confidence_classes else None
    if confidence_classes and set(confidence_classes) - {"L", "N", "H"}:
        raise error(422, "INVALID_CONFIDENCE_CLASS", "VIIRS confidence classes must be L, N, or H.")
    aoi_geometry = None
    if aoi_id:
        aoi = _get_configured_aoi(db, aoi_id)
        aoi_geometry = aoi["geometry"]
    rows, total = db.query_observations(
        sensors=[s.strip() for s in sensors.split(",")] if sensors else None,
        platforms=[p.strip() for p in platforms.split(",")] if platforms else None,
        products=[p.strip() for p in products.split(",")] if products else None,
        start=start_dt,
        end=end_dt,
        aoi_geometry=aoi_geometry,
        page=page,
        page_size=page_size,
        include_native=include_native_fields,
        min_frp_native=min_frp_native,
        daynight=daynight,
        min_modis_confidence=min_modis_confidence,
        viirs_confidence_classes=confidence_classes,
    )
    return {
        "data": [_serialize(r) for r in rows],
        "pagination": {"page": page, "page_size": page_size, "total": total},
        "count_unit_note": "One row = one source observation, not one fire.",
    }


@router.get("/map-density")
def map_density(
    aoi_id: str,
    start: str,
    end: str,
    sensors: str | None = Query(default=None),
    platforms: str | None = Query(default=None),
    products: str | None = Query(default=None),
    min_frp_native: float | None = Query(default=None, ge=0),
    daynight: str | None = Query(default=None, pattern="^(D|N|d|n)$"),
    min_modis_confidence: float | None = Query(default=None, ge=0, le=100),
    viirs_confidence_classes: str | None = Query(default=None),
    grid_degrees: float = Query(default=0.08, ge=0.02, le=0.5),
    db: Database = Depends(locked_db),
) -> dict[str, Any]:
    aoi = _get_configured_aoi(db, aoi_id)
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if not start_dt or not end_dt or end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "A valid start/end range is required.")
    if (end_dt.year - start_dt.year) * 12 + end_dt.month - start_dt.month > 240:
        raise error(422, "WINDOW_TOO_LARGE", "Map-density window cannot exceed 240 months.")
    classes = [value.strip().upper() for value in viirs_confidence_classes.split(",") if value.strip()] if viirs_confidence_classes else None
    if classes and set(classes) - {"L", "N", "H"}:
        raise error(422, "INVALID_CONFIDENCE_CLASS", "VIIRS confidence classes must be L, N, or H.")
    cells = db.query_map_density(
        aoi_geometry=aoi["geometry"], start=start_dt, end=end_dt, grid_degrees=grid_degrees,
        sensors=[value.strip() for value in sensors.split(",") if value.strip()] if sensors else None,
        platforms=[value.strip() for value in platforms.split(",") if value.strip()] if platforms else None,
        products=[value.strip() for value in products.split(",") if value.strip()] if products else None,
        min_frp_native=min_frp_native, daynight=daynight,
        min_modis_confidence=min_modis_confidence, viirs_confidence_classes=classes,
    )
    return {
        "aoi_id": aoi_id,
        "period": {"start": start_dt.isoformat(), "end": end_dt.isoformat(), "time_zone": "UTC"},
        "cell_size_degrees": grid_degrees,
        "cells": cells,
        "cell_count": len(cells),
        "count_semantics": "Each cell preserves sensor/platform/product counts separately; marker size uses the largest single-series count, never a cross-sensor sum.",
        "limitations": [
            "Map markers are geographic grid cells, not individual observations or fire perimeters.",
            "A cell centre is a display location; counts include source observation coordinates falling inside that cell.",
            "No source records in a cell do not prove absence of fire activity.",
        ],
    }


@router.get("/observations/{observation_id}")
def observation_detail(observation_id: str, db: Database = Depends(locked_db)) -> dict[str, Any]:
    row = db.get_observation(observation_id)
    if row is None:
        raise error(404, "OBSERVATION_NOT_FOUND", "No observation with that ID.")
    return _serialize(row)


@router.get("/hotspot-groups")
def hotspot_groups(
    aoi_id: str,
    start: str,
    end: str,
    sensor: str | None = None,
    platform: str | None = None,
    product_id: str | None = None,
    distance_m: float | None = Query(default=None, gt=0, le=10000),
    max_gap_hours: float = Query(default=24, gt=0, le=72),
    db: Database = Depends(locked_db),
) -> dict[str, Any]:
    aoi = _get_configured_aoi(db, aoi_id)
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if not start_dt or not end_dt or end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "A valid start/end range is required.")
    if (end_dt - start_dt).total_seconds() > 90 * 86400:
        raise error(422, "WINDOW_TOO_LARGE", "Hotspot grouping requests are limited to 90 days; query shorter periods.")
    filters = {
        "aoi_geometry": aoi["geometry"],
        "start": start_dt,
        "end": end_dt,
        "sensors": [sensor] if sensor else None,
        "platforms": [platform] if platform else None,
        "products": [product_id] if product_id else None,
        "page_size": 1000,
    }
    rows, total = db.query_observations(**filters, page=1)
    if total > 50000:
        raise error(413, "GROUPING_LIMIT_EXCEEDED", "This request contains more than 50,000 observations; narrow its dates or sensor/product filter.", {"matching_observations": total})
    for page in range(2, (total + 999) // 1000 + 1):
        batch, _ = db.query_observations(**filters, page=page)
        rows.extend(batch)
    groups = cluster_observations(rows, distance_m=distance_m, max_gap_hours=max_gap_hours)
    return {
        "aoi": {"aoi_id": aoi_id, "name": aoi["name"]},
        "period": {"start": start_dt.isoformat(), "end": end_dt.isoformat(), "time_zone": "UTC"},
        "filters": {
            "sensor": sensor,
            "platform": platform,
            "product_id": product_id,
            "max_gap_hours": max_gap_hours,
            "distance_m": distance_m,
        },
        "source_snapshot_ids": sorted({
            str(row["source_snapshot_id"])
            for row in rows
            if row.get("source_snapshot_id")
        }),
        "method": {
            "id": GROUP_METHOD_VERSION,
            "status": "experimental_unvalidated",
            "candidate_distance_m": distance_m or "sensor default (MODIS 2000; VIIRS 750)",
            "default_distance_m": DEFAULT_DISTANCE_M,
            "max_pair_time_gap_hours": max_gap_hours,
            "max_component_duration_hours": 72,
            "minimum_observations": 2,
        },
        "matching_observations": total,
        "group_count": len(groups),
        "groups": groups,
        "limitations": [
            "Groups are algorithmic proximity clusters, not confirmed fire incidents or perimeters.",
            "Clustering is sensor/platform/product separated; cross-sensor matches are not merged.",
            "Candidate distance defaults are scale-informed and unvalidated; results are sensitive to parameters and chained detections.",
            "FIRMS source missing-day evidence does not establish valid observation opportunity over the AOI.",
        ],
    }


@router.get("/calendar")
def calendar(
    aoi_id: str,
    start: str,
    end: str,
    sensors: str | None = Query(default=None),
    platforms: str | None = Query(default=None),
    products: str | None = Query(default=None),
    min_frp_native: float | None = Query(default=None, ge=0),
    daynight: str | None = Query(default=None, pattern="^(D|N|d|n)$"),
    min_modis_confidence: float | None = Query(default=None, ge=0, le=100),
    viirs_confidence_classes: str | None = Query(default=None),
    db: Database = Depends(locked_db),
) -> dict[str, Any]:
    aoi = _get_configured_aoi(db, aoi_id)
    start_dt, end_dt = _parse_dt(start, "start"), _parse_dt(end, "end")
    if not start_dt or not end_dt or end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "A valid start/end range is required.")
    # D-02 fix: count real month bins ([start,end) snapped outward). Cap is 240
    # months so the national Bangladesh history (2010-01..2026-07) remains queryable.
    from backend.calendar_agg.aggregation import month_bins

    n_bins = len(month_bins(start_dt, end_dt))
    if n_bins > 240:
        raise error(422, "WINDOW_TOO_LARGE", "Maximum window is 240 months (20 years of national history).")
    confidence_classes = {value.strip().upper() for value in viirs_confidence_classes.split(",") if value.strip()} if viirs_confidence_classes else None
    if confidence_classes and confidence_classes - {"L", "N", "H"}:
        raise error(422, "INVALID_CONFIDENCE_CLASS", "VIIRS confidence classes must be L, N, or H.")
    selected_sensors = [value.strip() for value in sensors.split(",") if value.strip()] if sensors else None
    selected_platforms = [value.strip() for value in platforms.split(",") if value.strip()] if platforms else None
    selected_products = [value.strip() for value in products.split(",") if value.strip()] if products else None
    geometry = aoi["geometry"]
    rows = _build_calendar_rows(
        db, aoi_id=aoi_id, aoi_geometry=geometry, start=start_dt, end=end_dt,
        sensors=selected_sensors, platforms=selected_platforms, products=selected_products,
        min_frp_native=min_frp_native, daynight=daynight,
        min_modis_confidence=min_modis_confidence,
        viirs_confidence_classes=confidence_classes,
    )
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for r in rows:
        grouped.setdefault((r["sensor"], r.get("platform") or "", r.get("product_id") or ""), []).append(r)
    return {
        "aoi": {"aoi_id": aoi_id, "name": aoi["name"], "crs": aoi["crs"]},
        "period": {"start": start_dt.isoformat(), "end": end_dt.isoformat(), "time_zone": "UTC"},
        "time_bin": "month",
        "count_unit": COUNT_UNIT,
        "spatial_rule": SPATIAL_RULE,
        "confidence_filter": {"min_modis_confidence": min_modis_confidence,
                              "viirs_confidence_classes": sorted(confidence_classes) if confidence_classes else []},
        "observation_filters": {"min_frp_native": min_frp_native, "daynight": daynight,
                                "min_modis_confidence": min_modis_confidence,
                                "viirs_confidence_classes": sorted(confidence_classes) if confidence_classes else []},
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
                        "source_snapshot_ids": json.loads(r["source_snapshot_ids"])
                        if isinstance(r["source_snapshot_ids"], str)
                        else r["source_snapshot_ids"],
                    }
                    for r in sorted(values, key=lambda x: x["period_start_utc"])
                ],
            }
            for (sensor, platform, product), values in grouped.items()
        ],
        "provenance": {
            "source_snapshot_ids": sorted({
                snapshot_id
                for row in rows
                for snapshot_id in (
                    json.loads(row["source_snapshot_ids"])
                    if isinstance(row["source_snapshot_ids"], str)
                    else row["source_snapshot_ids"]
                )
            }),
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
    min_frp_native: float | None = Field(default=None, ge=0)
    daynight: str | None = Field(default=None, pattern="^(D|N|d|n)$")
    min_modis_confidence: float | None = Field(default=None, ge=0, le=100)
    viirs_confidence_classes: list[str] | None = None


OBSERVATION_EXPORT_FIELDS = [
    "observation_id", "source_snapshot_id", "source_row_fingerprint", "source_record_id",
    "provider", "product_id", "collection_version", "processing_level", "sensor", "platform",
    "instrument", "acquired_at_utc", "acq_date_native", "acq_time_native", "latitude", "longitude",
    "brightness_primary_native", "brightness_secondary_native", "frp_native", "frp_unit_native",
    "frp_mw", "confidence_raw", "confidence_semantics", "confidence_class_native", "daynight_native",
    "scan_native", "track_native", "source_attributes", "ingested_at_utc", "normalization_version",
]
CALENDAR_EXPORT_FIELDS = [
    "aggregate_id", "aoi_id", "period_start_utc", "period_end_utc", "time_bin", "sensor", "platform",
    "product_id", "observation_count", "count_unit", "coverage_status", "source_data_availability_fraction",
    "coverage_evidence", "source_snapshot_ids", "method_version", "generated_at_utc",
]


def _all_filtered_observations(req: ExportRequest, db: Database, aoi: dict[str, Any] | None,
                               start_dt: datetime | None, end_dt: datetime | None) -> list[dict[str, Any]]:
    filters = {
        "sensors": req.sensors, "platforms": req.platforms, "products": req.products,
        "start": start_dt, "end": end_dt,
        "aoi_geometry": aoi["geometry"] if aoi else None,
        "include_native": True, "min_frp_native": req.min_frp_native,
        "daynight": req.daynight, "min_modis_confidence": req.min_modis_confidence,
        "viirs_confidence_classes": req.viirs_confidence_classes,
    }
    rows, total = db.query_observations(**filters, page=1, page_size=1000)
    for page in range(2, (total + 999) // 1000 + 1):
        batch, _ = db.query_observations(**filters, page=page, page_size=1000)
        rows.extend(batch)
    return rows


def _snapshot_ids_in_rows(rows: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for row in rows:
        single_id = row.get("source_snapshot_id")
        if single_id:
            ids.add(str(single_id))
        raw_ids = row.get("source_snapshot_ids")
        if isinstance(raw_ids, str):
            try:
                raw_ids = json.loads(raw_ids)
            except json.JSONDecodeError:
                raw_ids = []
        if isinstance(raw_ids, list):
            ids.update(str(value) for value in raw_ids if value)
    return ids


def _export_source_snapshots(db: Database, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    used_ids = _snapshot_ids_in_rows(rows)
    snapshots = []
    for snapshot in db.list_snapshots():
        if snapshot.get("source_snapshot_id") not in used_ids:
            continue
        public = _serialize(snapshot)
        source_file = public.get("source_file_uri")
        if source_file:
            public["source_file_uri"] = _file_basename(source_file)
        endpoint = public.get("source_endpoint")
        if endpoint:
            public["source_endpoint"] = _public_source_endpoint(endpoint)
        snapshots.append(public)
    return snapshots


@router.post("/exports")
def export(req: ExportRequest, db: Database = Depends(locked_db)) -> Response:
    start_dt, end_dt = _parse_dt(req.start, "start"), _parse_dt(req.end, "end")
    if start_dt and end_dt and end_dt <= start_dt:
        raise error(422, "INVALID_DATE_RANGE", "The end date must be later than the start date.")
    # D-09 fix: calendar aggregates have no coordinates — GeoJSON is spatial
    # and would 500 (KeyError on longitude). Reject with a documented 422.
    if req.dataset_type == "calendar" and req.format == "geojson":
        raise error(422, "UNSUPPORTED_COMBINATION", "GeoJSON export is spatial; calendar aggregates have no coordinates. Use observations+GeoJSON for points, or calendar+CSV/JSON for bins.")
    if req.viirs_confidence_classes and set(value.strip().upper() for value in req.viirs_confidence_classes) - {"L", "N", "H"}:
        raise error(422, "INVALID_CONFIDENCE_CLASS", "VIIRS confidence classes must be L, N, or H.")
    aoi = _get_configured_aoi(db, req.aoi_id) if req.aoi_id else None
    if req.dataset_type == "observations":
        rows = _all_filtered_observations(req, db, aoi, start_dt, end_dt)
    else:
        if not req.aoi_id:
            raise error(422, "AOI_REQUIRED", "aoi_id is required for calendar exports.")
        if not start_dt or not end_dt:
            raise error(422, "DATE_RANGE_REQUIRED", "Calendar exports require both start and end dates.")
        rows = _build_calendar_rows(
            db, aoi_id=req.aoi_id, aoi_geometry=aoi["geometry"], start=start_dt, end=end_dt,
            sensors=req.sensors, platforms=req.platforms, products=req.products,
            min_frp_native=req.min_frp_native, daynight=req.daynight,
            min_modis_confidence=req.min_modis_confidence,
            viirs_confidence_classes={value.strip().upper() for value in req.viirs_confidence_classes}
            if req.viirs_confidence_classes else None,
        )
    aoi_manifest = None
    if aoi:
        geometry = aoi["geometry"]
        aoi_manifest = {
            "aoi_id": aoi["aoi_id"],
            "name": aoi["name"],
            "crs": aoi["crs"],
            "geometry_type": geometry.geom_type,
            "bbox_wsen": list(geometry.bounds),
            "geometry_source": aoi.get("source"),
            "geometry_source_version": aoi.get("source_version"),
        }
    manifest = build_manifest(
        dataset_type=req.dataset_type,
        aoi=aoi_manifest,
        date_range={"start": (start_dt.isoformat() if start_dt else None),
                    "end": (end_dt.isoformat() if end_dt else None)},
        filters={"sensors": req.sensors, "platforms": req.platforms, "products": req.products,
                 "min_frp_native": req.min_frp_native, "daynight": req.daynight,
                 "min_modis_confidence": req.min_modis_confidence,
                 "viirs_confidence_classes": req.viirs_confidence_classes},
        snapshots=_export_source_snapshots(db, rows),
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
        fieldnames = list(ser_rows[0]) if ser_rows else (
            OBSERVATION_EXPORT_FIELDS if req.dataset_type == "observations" else CALENDAR_EXPORT_FIELDS
        )
        payload = to_csv(ser_rows, fieldnames=fieldnames)
        # Manifest always ships, even for empty sets (D-06).
        payload += "\n# metadata_manifest: " + json.dumps(manifest) + "\n"
        media = "text/csv"
    fname = f"emberlens-{req.dataset_type}.{req.format}"
    return Response(
        content=payload,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
