"""Experimental sensor-specific grouping of nearby FIRMS observations.

These output groups are algorithmic constructs, not confirmed fire incidents.
The defaults are scale-informed candidates (two nominal pixel widths) and must
be subjected to sensitivity/evaluation work before stronger interpretation.
"""
from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

METHOD_VERSION = "hotspot-groups-grid-0.1"
EARTH_KM = 6371.0088
DEFAULT_DISTANCE_M = {"MODIS": 2000.0, "VIIRS": 750.0}


def _timestamp(value: datetime | str) -> float:
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def cluster_observations(
    observations: list[dict[str, Any]],
    *,
    distance_m: float | None = None,
    max_gap_hours: float = 24.0,
    max_duration_hours: float = 72.0,
    min_observations: int = 2,
) -> list[dict[str, Any]]:
    """Return deterministic connected groups within each sensor/product series.

    Spatial buckets use a local equirectangular projection centered on the
    query's mean latitude. Edges connect pairs within the distance and time
    thresholds. Component duration is capped to prevent unlimited temporal
    chaining. Small datasets are suitable for the prototype endpoint; see API
    limits for its request cap.
    """
    if max_gap_hours <= 0 or max_duration_hours < max_gap_hours:
        raise ValueError("time gap must be positive and component duration >= time gap")
    if min_observations < 2:
        raise ValueError("min_observations must be at least 2")
    by_series: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for obs in observations:
        by_series[(obs["sensor"], obs["platform"], obs["product_id"])].append(obs)
    output: list[dict[str, Any]] = []
    for (sensor, platform, product_id), rows in sorted(by_series.items()):
        radius = distance_m or DEFAULT_DISTANCE_M.get(sensor, 1000.0)
        if radius <= 0:
            raise ValueError("distance_m must be positive")
        rows = sorted(rows, key=lambda r: (_timestamp(r["acquired_at_utc"]), r["observation_id"]))
        mean_lat = sum(float(r["latitude"]) for r in rows) / len(rows)
        cos_lat = max(0.01, math.cos(math.radians(mean_lat)))
        # Local metric projection; adequate for the prototype's single-country bbox.
        def xy(row):
            lon, lat = math.radians(float(row["longitude"])), math.radians(float(row["latitude"]))
            return EARTH_KM * 1000 * lon * cos_lat, EARTH_KM * 1000 * lat

        times = [_timestamp(row["acquired_at_utc"]) for row in rows]
        coords = [xy(row) for row in rows]
        parent = list(range(len(rows)))
        sizes = [1] * len(rows)
        mins, maxs = times[:], times[:]

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra == rb or max(maxs[ra], maxs[rb]) - min(mins[ra], mins[rb]) > max_duration_hours * 3600:
                return
            if sizes[ra] < sizes[rb]:
                ra, rb = rb, ra
            parent[rb] = ra
            sizes[ra] += sizes[rb]
            mins[ra], maxs[ra] = min(mins[ra], mins[rb]), max(maxs[ra], maxs[rb])

        buckets: dict[tuple[int, int, int], list[int]] = defaultdict(list)
        time_span_days = math.ceil(max_gap_hours / 24) + 1
        for i, row in enumerate(rows):
            x, y = coords[i]
            cx, cy = math.floor(x / radius), math.floor(y / radius)
            day = math.floor(times[i] / 86400)
            for dd in range(-time_span_days, 1):
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for j in buckets.get((cx + dx, cy + dy, day + dd), ()):
                            if times[i] - times[j] > max_gap_hours * 3600:
                                continue
                            xj, yj = coords[j]
                            if math.hypot(x - xj, y - yj) <= radius:
                                union(i, j)
            buckets[(cx, cy, day)].append(i)

        components: dict[int, list[int]] = defaultdict(list)
        for i in range(len(rows)):
            components[find(i)].append(i)
        for indices in components.values():
            if len(indices) < min_observations:
                continue
            members = [rows[i] for i in indices]
            obs_ids = sorted(r["observation_id"] for r in members)
            latitudes = [float(r["latitude"]) for r in members]
            longitudes = [float(r["longitude"]) for r in members]
            start_ts, end_ts = min(times[i] for i in indices), max(times[i] for i in indices)
            output.append({
                "group_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{METHOD_VERSION}|{product_id}|{'|'.join(obs_ids)}")),
                "label": "algorithmic hotspot group",
                "sensor": sensor, "platform": platform, "product_id": product_id,
                "observation_count": len(members),
                "start_utc": datetime.fromtimestamp(start_ts, timezone.utc).isoformat(),
                "end_utc": datetime.fromtimestamp(end_ts, timezone.utc).isoformat(),
                "duration_hours": round((end_ts - start_ts) / 3600, 3),
                "centroid": {"latitude": sum(latitudes) / len(latitudes), "longitude": sum(longitudes) / len(longitudes)},
                "bbox": [min(longitudes), min(latitudes), max(longitudes), max(latitudes)],
                "observation_ids": obs_ids,
                "source_snapshot_ids": sorted({r["source_snapshot_id"] for r in members}),
            })
    return sorted(output, key=lambda e: (e["start_utc"], e["product_id"], e["group_id"]))
