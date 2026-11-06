"""DuckDB schema (exactly per DATA_DICTIONARY.md) + thin repositories."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from shapely import from_wkt, to_wkt
from shapely.geometry import Point, mapping, shape

SCHEMA = """
CREATE TABLE IF NOT EXISTS source_snapshot (
    source_snapshot_id VARCHAR PRIMARY KEY,
    provider VARCHAR NOT NULL,
    source_endpoint VARCHAR NOT NULL,
    product_id VARCHAR NOT NULL,
    processing_level VARCHAR,
    collection_version VARCHAR,
    platform VARCHAR NOT NULL,
    sensor VARCHAR NOT NULL,
    requested_aoi VARCHAR,
    requested_start_utc TIMESTAMP,
    requested_end_utc TIMESTAMP,
    retrieved_at_utc TIMESTAMP NOT NULL,
    source_file_uri VARCHAR NOT NULL,
    sha256 VARCHAR,
    row_count INTEGER,
    documentation_url VARCHAR,
    documentation_checked_at TIMESTAMP,
    ingestion_run_id VARCHAR
);

CREATE TABLE IF NOT EXISTS fire_observation (
    observation_id VARCHAR PRIMARY KEY,
    source_snapshot_id VARCHAR NOT NULL REFERENCES source_snapshot(source_snapshot_id),
    source_row_fingerprint VARCHAR NOT NULL,
    source_record_id VARCHAR,
    provider VARCHAR NOT NULL,
    product_id VARCHAR NOT NULL,
    collection_version VARCHAR,
    processing_level VARCHAR,
    sensor VARCHAR NOT NULL,
    platform VARCHAR NOT NULL,
    instrument VARCHAR,
    acquired_at_utc TIMESTAMP NOT NULL,
    acq_date_native VARCHAR NOT NULL,
    acq_time_native VARCHAR,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    brightness_primary_native DOUBLE,
    brightness_secondary_native DOUBLE,
    frp_native DOUBLE,
    frp_unit_native VARCHAR,
    frp_mw DOUBLE,
    confidence_raw VARCHAR,
    confidence_semantics VARCHAR NOT NULL,
    confidence_class_native VARCHAR,
    daynight_native VARCHAR,
    scan_native DOUBLE,
    track_native DOUBLE,
    source_attributes JSON,
    ingested_at_utc TIMESTAMP NOT NULL,
    normalization_version VARCHAR NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_sensor_platform_time
    ON fire_observation (sensor, platform, acquired_at_utc);
CREATE INDEX IF NOT EXISTS idx_obs_snapshot ON fire_observation (source_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_obs_fingerprint ON fire_observation (source_row_fingerprint);

CREATE TABLE IF NOT EXISTS data_availability (
    availability_id VARCHAR PRIMARY KEY,
    product_id VARCHAR NOT NULL,
    platform VARCHAR NOT NULL,
    date_or_interval VARCHAR NOT NULL,
    availability_status VARCHAR NOT NULL,
    source_reference VARCHAR,
    checked_at_utc TIMESTAMP NOT NULL,
    notes VARCHAR
);

CREATE TABLE IF NOT EXISTS aoi (
    aoi_id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    geometry_wkt VARCHAR NOT NULL,
    crs VARCHAR NOT NULL DEFAULT 'EPSG:4326',
    source VARCHAR NOT NULL,
    source_version VARCHAR,
    created_at_utc TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_aggregate (
    aggregate_id VARCHAR PRIMARY KEY,
    aoi_id VARCHAR NOT NULL,
    period_start_utc TIMESTAMP NOT NULL,
    period_end_utc TIMESTAMP NOT NULL,
    time_bin VARCHAR NOT NULL,
    sensor VARCHAR NOT NULL,
    platform VARCHAR,
    product_id VARCHAR,
    observation_count INTEGER NOT NULL,
    count_unit VARCHAR NOT NULL,
    coverage_status VARCHAR NOT NULL,
    source_data_availability_fraction DOUBLE,
    coverage_evidence VARCHAR,
    source_snapshot_ids VARCHAR,
    method_version VARCHAR NOT NULL,
    generated_at_utc TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cal_aoi_period ON calendar_aggregate (aoi_id, period_start_utc, sensor);
"""


class Database:
    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        self.conn = duckdb.connect(self.path)

    def close(self) -> None:
        self.conn.close()

    def migrate(self) -> None:
        self.conn.execute(SCHEMA)

    # -- writes ---------------------------------------------------------
    def insert_snapshot(self, row: dict[str, Any]) -> None:
        cols = list(row)
        ph = ",".join("?" for _ in cols)
        self.conn.execute(
            f"INSERT INTO source_snapshot ({','.join(cols)}) VALUES ({ph})",
            [row[c] for c in cols],
        )

    def insert_observation(self, obs) -> None:
        self.conn.execute(
            """
            INSERT OR IGNORE INTO fire_observation (
                observation_id, source_snapshot_id, source_row_fingerprint, source_record_id,
                provider, product_id, collection_version, processing_level, sensor, platform,
                instrument, acquired_at_utc, acq_date_native, acq_time_native, latitude, longitude,
                brightness_primary_native, brightness_secondary_native, frp_native, frp_unit_native,
                frp_mw, confidence_raw, confidence_semantics, confidence_class_native,
                daynight_native, scan_native, track_native, source_attributes,
                ingested_at_utc, normalization_version
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
                obs.observation_id, obs.source_snapshot_id, obs.source_row_fingerprint,
                obs.source_record_id, obs.provider, obs.product_id, obs.collection_version,
                obs.processing_level, obs.sensor, obs.platform, obs.instrument,
                obs.acquired_at_utc, obs.acq_date_native, obs.acq_time_native,
                obs.latitude, obs.longitude, obs.brightness_primary_native,
                obs.brightness_secondary_native, obs.frp_native, obs.frp_unit_native,
                obs.frp_mw, None if obs.confidence_raw is None else str(obs.confidence_raw),
                obs.confidence_semantics, obs.confidence_class_native,
                obs.daynight_native, obs.scan_native, obs.track_native,
                json.dumps(obs.source_attributes), obs.ingested_at_utc, obs.normalization_version,
            ],
        )

    def insert_availability(self, row: dict[str, Any]) -> None:
        cols = list(row)
        ph = ",".join("?" for _ in cols)
        self.conn.execute(
            f"INSERT INTO data_availability ({','.join(cols)}) VALUES ({ph})",
            [row[c] for c in cols],
        )

    def upsert_aoi(self, *, aoi_id: str, name: str, geometry, crs: str = "EPSG:4326",
                   source: str, source_version: str | None = None) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO aoi (aoi_id, name, geometry_wkt, crs, source, source_version, created_at_utc)"
            " VALUES (?,?,?,?,?,?,?)",
            [aoi_id, name, to_wkt(geometry), crs, source, source_version, datetime.now(timezone.utc)],
        )

    def insert_calendar_agg(self, row: dict[str, Any]) -> None:
        cols = list(row)
        ph = ",".join("?" for _ in cols)
        self.conn.execute(
            f"INSERT OR REPLACE INTO calendar_aggregate ({','.join(cols)}) VALUES ({ph})",
            [row[c] for c in cols],
        )

    # -- reads ----------------------------------------------------------
    def list_aois(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM aoi").fetchall()
        cols = [d[0] for d in self.conn.description]
        out = []
        for r in rows:
            d = dict(zip(cols, r))
            d["geometry"] = mapping(from_wkt(d.pop("geometry_wkt")))
            out.append(d)
        return out

    def get_aoi(self, aoi_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM aoi WHERE aoi_id=?", [aoi_id]).fetchone()
        if not row:
            return None
        cols = [d[0] for d in self.conn.description]
        d = dict(zip(cols, row))
        d["geometry"] = from_wkt(d.pop("geometry_wkt"))
        return d

    def list_snapshots(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM source_snapshot").fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def list_availability(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM data_availability ORDER BY date_or_interval").fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def query_observations(self, *, sensors=None, platforms=None, products=None,
                           start=None, end=None, page=1, page_size=100,
                           include_native: bool = False) -> tuple[list[dict[str, Any]], int]:
        where, params = [], []
        if sensors:
            where.append(f"sensor IN ({','.join('?' for _ in sensors)})")
            params += list(sensors)
        if platforms:
            where.append(f"platform IN ({','.join('?' for _ in platforms)})")
            params += list(platforms)
        if products:
            where.append(f"product_id IN ({','.join('?' for _ in products)})")
            params += list(products)
        if start:
            where.append("acquired_at_utc >= ?")
            params.append(start)
        if end:
            where.append("acquired_at_utc < ?")
            params.append(end)
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = self.conn.execute(f"SELECT count(*) FROM fire_observation {clause}", params).fetchone()[0]
        page = max(1, page)
        page_size = min(max(1, page_size), 1000)
        rows = self.conn.execute(
            f"SELECT * FROM fire_observation {clause} ORDER BY acquired_at_utc, observation_id"
            f" LIMIT ? OFFSET ?",
            params + [page_size, (page - 1) * page_size],
        ).fetchall()
        cols = [d[0] for d in self.conn.description]
        out = []
        for r in rows:
            d = dict(zip(cols, r))
            if not include_native:
                d.pop("source_attributes", None)
            out.append(d)
        return out, total

    def get_observation(self, observation_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM fire_observation WHERE observation_id=?", [observation_id]).fetchone()
        if not row:
            return None
        cols = [d[0] for d in self.conn.description]
        return dict(zip(cols, row))

    def observations_for_calendar(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT sensor, platform, product_id, latitude, longitude, acquired_at_utc, source_snapshot_id"
            " FROM fire_observation ORDER BY acquired_at_utc"
        ).fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def list_calendar(self, aoi_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM calendar_aggregate WHERE aoi_id=? ORDER BY sensor, platform, period_start_utc",
            [aoi_id],
        ).fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def count_observations(self) -> int:
        return self.conn.execute("SELECT count(*) FROM fire_observation").fetchone()[0]


def init_db(path: str | Path = ":memory:") -> Database:
    db = Database(path)
    db.migrate()
    return db


def point_in_polygon(lat: float, lon: float, polygon) -> bool:
    """Boundary-inclusive point-in-polygon (shapely covers)."""
    return polygon.covers(Point(lon, lat))


def geometry_from_geojson(geojson: dict) -> Any:
    return shape(geojson)
