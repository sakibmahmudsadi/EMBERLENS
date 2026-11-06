"""CSV / GeoJSON / JSON exports + metadata manifest (API_SPECIFICATION §8)."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

LIMITATIONS = [
    "Hotspot observations are active-fire / thermal-anomaly detections, not confirmed wildfires or incidents.",
    "MODIS and VIIRS counts are not summed and are not physically equivalent measurements.",
    "Confidence values are source-native and are not comparable across sensors; no universal confidence_0_100 is provided.",
    "An empty period means no source records were returned; it does not mean no fires occurred and observation coverage is unknown.",
    "FIRMS date availability describes source-service coverage, not clear-sky or valid-pixel observation opportunity.",
    "A point coordinate is the hotspot pixel's nominal centre, not a fire perimeter or ignition point.",
]

CATALOG_NOTE = (
    "Source: NASA FIRMS active-fire data (https://firms.modaps.eosdis.nasa.gov). "
    "Cite the source snapshots listed in the manifest."
)


def build_manifest(
    *,
    dataset_type: str,
    aoi: dict[str, Any] | None,
    date_range: dict[str, Any],
    filters: dict[str, Any],
    snapshots: list[dict[str, Any]] | None = None,
    row_count: int = 0,
    count_unit: str | None = None,
    method_version: str = "calendar-v0",
    normalization_version: str = "canonical-v1",
    schema_version: str = "1.0",
) -> dict[str, Any]:
    return {
        "project": "EMBERLENS",
        "schema_version": schema_version,
        "dataset_type": dataset_type,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "aoi": aoi,
        "date_range": date_range,
        "time_zone": "UTC",
        "filters": filters,
        "row_count": row_count,
        "count_unit": count_unit,
        "source_snapshots": snapshots or [],
        "method_version": method_version,
        "normalization_version": normalization_version,
        "crs": "EPSG:4326",
        "units": {
            "coordinates": "decimal degrees (longitude, latitude)",
            "frp_native": "as supplied by source; see frp_unit_native",
            "counts": count_unit or "source observation rows",
        },
        "coverage_method": (
            "Coverage status is derived from source-service data availability "
            "plus record presence; it is not valid-observation/clear-sky coverage."
        ),
        "source_attribution": CATALOG_NOTE,
        "limitations": LIMITATIONS,
    }


def _jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return value


def to_csv(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    for r in rows:
        writer.writerow({k: _jsonable(v) for k, v in r.items()})
    return buf.getvalue()


def to_geojson(rows: list[dict[str, Any]]) -> dict[str, Any]:
    features = []
    for r in rows:
        # Keep lat/lon in properties too so exporters can round-trip them.
        props = {k: _jsonable(v) for k, v in r.items()}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def to_json(rows: list[dict[str, Any]]) -> str:
    return json.dumps([{k: _jsonable(v) for k, v in r.items()} for r in rows], indent=2, default=str)
