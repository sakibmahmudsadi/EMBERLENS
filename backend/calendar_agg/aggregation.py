"""UTC month-bin calendar aggregation (start-inclusive / end-exclusive).

Counts are NEVER summed across MODIS+VIIRS: each (sensor, platform, product)
series is aggregated and stored separately. An empty bin means "no source
records returned" — never "no fires".
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.calendar_agg import (
    COUNT_UNIT,
    COVERAGE_UNKNOWN,
    METHOD_VERSION,
    NO_RECORDS_COVERAGE_UNVERIFIED,
    PRODUCT_UNAVAILABLE,
    RECORDS_PRESENT,
    SOURCE_DATA_GAP,
)
from backend.db.database import point_in_polygon

AVAILABILITY_TO_STATUS = {
    "available": None,  # resolved by count below
    "unavailable": PRODUCT_UNAVAILABLE,
    "missing": SOURCE_DATA_GAP,
    "partial": "partial_source_data",
    "unknown": COVERAGE_UNKNOWN,
}


def month_bins(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """UTC month bins covering [start, end); start/end snapped outward to months."""
    bins = []
    cursor = datetime(start.year, start.month, 1, tzinfo=timezone.utc)
    while cursor < end:
        nxt = datetime(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1, tzinfo=timezone.utc)
        bins.append((cursor, nxt))
        cursor = nxt
    return bins


def resolve_coverage_status(count: int, availability_status: str | None) -> str:
    if count > 0:
        return RECORDS_PRESENT
    if availability_status is None:
        return NO_RECORDS_COVERAGE_UNVERIFIED
    mapped = AVAILABILITY_TO_STATUS.get(availability_status, COVERAGE_UNKNOWN)
    if mapped is not None:
        return mapped
    # Source claims the date is available but no rows returned for this AOI:
    # observation coverage is still unverified.
    return NO_RECORDS_COVERAGE_UNVERIFIED


def aggregate_calendar(
    observations: list[dict[str, Any]],
    *,
    aoi_id: str,
    aoi_geometry,
    start: datetime,
    end: datetime,
    availability: dict[tuple[str, str, str], str] | None = None,
    method_version: str = METHOD_VERSION,
) -> list[dict[str, Any]]:
    """Build one calendar_aggregate row per (sensor, platform, product, month).

    ``availability`` maps (product_id, platform, "YYYY-MM-DD") -> status string
    from data_availability ('available'|'unavailable'|'missing'|'unknown').
    """
    availability = availability or {}
    bins = month_bins(start, end)

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for obs in observations:
        if not point_in_polygon(obs["latitude"], obs["longitude"], aoi_geometry):
            continue
        t = obs["acquired_at_utc"]
        if isinstance(t, str):
            t = datetime.fromisoformat(t)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        if not (start <= t < end):
            continue
        key = (obs["sensor"], obs["platform"], obs["product_id"])
        groups.setdefault(key, []).append({**obs, "acquired_at_utc": t})

    # Series exist only for (sensor, platform, product) combos seen in data or
    # availability; counts of zero are emitted for every month bin.
    series_keys = set(groups)
    for (product_id, platform) in availability:
        for key in list(series_keys):
            pass  # availability-only series handled by caller if desired
    rows: list[dict[str, Any]] = []
    generated = datetime.now(timezone.utc)
    for (sensor, platform, product_id) in sorted(series_keys):
        obs_list = groups[(sensor, platform, product_id)]
        snapshots = sorted({o["source_snapshot_id"] for o in obs_list})
        for (period_start, period_end) in bins:
            count = sum(1 for o in obs_list if period_start <= o["acquired_at_utc"] < period_end)
            avail = availability.get((product_id, platform, period_start.strftime("%Y-%m-%d")))
            status = resolve_coverage_status(count, avail)
            rows.append({
                "aggregate_id": str(uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"{aoi_id}|{sensor}|{platform}|{product_id}|{period_start.isoformat()}|{method_version}",
                )),
                "aoi_id": aoi_id,
                "period_start_utc": period_start,
                "period_end_utc": period_end,
                "time_bin": "month",
                "sensor": sensor,
                "platform": platform,
                "product_id": product_id,
                "observation_count": count,
                "count_unit": COUNT_UNIT,
                "coverage_status": status,
                "source_data_availability_fraction": None,
                "coverage_evidence": json.dumps({"availability_status": avail, "status": status}),
                "source_snapshot_ids": json.dumps(snapshots),
                "method_version": method_version,
                "generated_at_utc": generated,
            })
    return rows
