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
    declared_series: set[tuple[str, str, str]] | None = None,
    method_version: str = METHOD_VERSION,
) -> list[dict[str, Any]]:
    """Build one calendar_aggregate row per (sensor, platform, product, month).

    ``availability`` maps (product_id, platform, "YYYY-MM") -> status string.
    A `missing` status means at least one global Standard-product source date in
    that month was explicitly listed missing by FIRMS; it is not AOI coverage.
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

    # Keep a sensor/platform/product series visible when its registered source
    # snapshot covers this interval but returns no observations in the AOI.
    series_keys = set(groups) | set(declared_series or ())
    rows: list[dict[str, Any]] = []
    generated = datetime.now(timezone.utc)
    for (sensor, platform, product_id) in sorted(series_keys):
        obs_list = groups.get((sensor, platform, product_id), [])
        monthly_counts: dict[datetime, int] = {}
        monthly_snapshots: dict[datetime, set[str]] = {}
        for obs in obs_list:
            acquired = obs["acquired_at_utc"]
            month = datetime(acquired.year, acquired.month, 1, tzinfo=timezone.utc)
            monthly_counts[month] = monthly_counts.get(month, 0) + 1
            monthly_snapshots.setdefault(month, set()).add(obs["source_snapshot_id"])
        for (period_start, period_end) in bins:
            count = monthly_counts.get(period_start, 0)
            avail = availability.get((product_id, platform, period_start.strftime("%Y-%m")))
            status = "partial_source_data" if avail == "missing" else resolve_coverage_status(count, avail)
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
                "coverage_evidence": json.dumps({"source_missing_day_in_month": avail == "missing", "status": status}),
                "source_snapshot_ids": json.dumps(sorted(monthly_snapshots.get(period_start, set()))),
                "method_version": method_version,
                "generated_at_utc": generated,
            })
    return rows


def aggregate_calendar_from_month_counts(
    month_counts: list[dict[str, Any]],
    *,
    aoi_id: str,
    start: datetime,
    end: datetime,
    availability: dict[tuple[str, str, str], str] | None = None,
    declared_series: set[tuple[str, str, str]] | None = None,
    method_version: str = METHOD_VERSION,
) -> list[dict[str, Any]]:
    """Build the same calendar rows from pre-aggregated DuckDB month counts."""
    availability = availability or {}
    bins = month_bins(start, end)
    series: dict[tuple[str, str, str], dict[datetime, dict[str, Any]]] = {}
    for item in month_counts:
        key = (item["sensor"], item["platform"], item["product_id"])
        period = item["period_start_utc"]
        if isinstance(period, str):
            period = datetime.fromisoformat(period)
        if period.tzinfo is None:
            period = period.replace(tzinfo=timezone.utc)
        period = datetime(period.year, period.month, 1, tzinfo=timezone.utc)
        series.setdefault(key, {})[period] = item

    for key in declared_series or ():
        series.setdefault(key, {})

    rows: list[dict[str, Any]] = []
    generated = datetime.now(timezone.utc)
    for (sensor, platform, product_id), counts in sorted(series.items()):
        for period_start, period_end in bins:
            item = counts.get(period_start)
            count = int(item["observation_count"]) if item else 0
            snapshots = sorted(item.get("source_snapshot_ids") or []) if item else []
            avail = availability.get((product_id, platform, period_start.strftime("%Y-%m")))
            status = "partial_source_data" if avail == "missing" else resolve_coverage_status(count, avail)
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
                "coverage_evidence": json.dumps({"source_missing_day_in_month": avail == "missing", "status": status}),
                "source_snapshot_ids": json.dumps(snapshots),
                "method_version": method_version,
                "generated_at_utc": generated,
            })
    return rows
