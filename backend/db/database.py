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
        # DuckDB python connections are NOT safe for concurrent execute from
        # multiple threads (FastAPI threadpool). Serialize all access so
        # concurrent requests (observations+calendar+coverage from the same
        # page load, or two tabs) cannot hit "connection is busy".
        import threading

        # A regular Lock can be released by a different thread. FastAPI runs
        # sync dependency setup/teardown on worker threads that may differ,
        # while an RLock raises "cannot release un-acquired lock" there.
        self._lock = threading.Lock()

    def _locked(self, fn, *args, **kwargs):
        with self._lock:
            return fn(*args, **kwargs)

    def close(self) -> None:
        self.conn.close()

    def migrate(self) -> None:
        self.conn.execute(SCHEMA)

    # -- writes ---------------------------------------------------------
    def insert_snapshot(self, row: dict[str, Any]) -> None:
        cols = list(row)
        ph = ",".join("?" for _ in cols)
        updates = ",".join(f"{c}=excluded.{c}" for c in cols if c != "source_snapshot_id")
        self.conn.execute(
            f"INSERT INTO source_snapshot ({','.join(cols)}) VALUES ({ph}) "
            f"ON CONFLICT (source_snapshot_id) DO UPDATE SET {updates}",
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

    def query_observations(self, *, sensors=None, platforms=None, products=None, aoi_geometry=None,
                           start=None, end=None, page=1, page_size=100,
                           include_native: bool = False, min_frp_native=None,
                           daynight=None, min_modis_confidence=None,
                           viirs_confidence_classes=None) -> tuple[list[dict[str, Any]], int]:
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
        if min_frp_native is not None:
            where.append("frp_native >= ?")
            params.append(min_frp_native)
        if daynight:
            where.append("upper(trim(daynight_native)) = ?")
            params.append(daynight.upper())
        if min_modis_confidence is not None:
            where.append("(sensor <> 'MODIS' OR try_cast(confidence_raw AS DOUBLE) >= ?)")
            params.append(min_modis_confidence)
        if viirs_confidence_classes:
            where.append(f"(sensor <> 'VIIRS' OR upper(trim(confidence_class_native)) IN ({','.join('?' for _ in viirs_confidence_classes)}))")
            params.extend([value.upper() for value in viirs_confidence_classes])
        # Active prototype AOI is an explicitly registered rectangle/bbox.
        # Applying its bounds in SQL keeps feed and export counts spatially
        # consistent with the calendar without materializing the full table.
        if aoi_geometry is not None:
            min_lon, min_lat, max_lon, max_lat = aoi_geometry.bounds
            where.extend(("longitude >= ?", "longitude <= ?", "latitude >= ?", "latitude <= ?"))
            params.extend((min_lon, max_lon, min_lat, max_lat))
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

    def query_map_density(self, *, aoi_geometry, start, end, grid_degrees=0.08,
                          sensors=None, platforms=None, products=None,
                          min_frp_native=None, daynight=None, min_modis_confidence=None,
                          viirs_confidence_classes=None) -> list[dict[str, Any]]:
        """Aggregate source rows into geographic cells, retaining each series separately."""
        if not 0.02 <= grid_degrees <= 0.5:
            raise ValueError("grid_degrees must be between 0.02 and 0.5")
        where, params = [], []
        if sensors:
            where.append(f"sensor IN ({','.join('?' for _ in sensors)})")
            params.extend(sensors)
        if platforms:
            where.append(f"platform IN ({','.join('?' for _ in platforms)})")
            params.extend(platforms)
        if products:
            where.append(f"product_id IN ({','.join('?' for _ in products)})")
            params.extend(products)
        if start:
            where.append("acquired_at_utc >= ?")
            params.append(start)
        if end:
            where.append("acquired_at_utc < ?")
            params.append(end)
        if min_frp_native is not None:
            where.append("frp_native >= ?")
            params.append(min_frp_native)
        if daynight:
            where.append("upper(trim(daynight_native)) = ?")
            params.append(daynight.upper())
        if min_modis_confidence is not None:
            where.append("(sensor <> 'MODIS' OR try_cast(confidence_raw AS DOUBLE) >= ?)")
            params.append(min_modis_confidence)
        if viirs_confidence_classes:
            where.append(f"(sensor <> 'VIIRS' OR upper(trim(confidence_class_native)) IN ({','.join('?' for _ in viirs_confidence_classes)}))")
            params.extend([value.upper() for value in viirs_confidence_classes])
        if aoi_geometry is not None:
            min_lon, min_lat, max_lon, max_lat = aoi_geometry.bounds
            where.extend(("longitude >= ?", "longitude <= ?", "latitude >= ?", "latitude <= ?"))
            params.extend((min_lon, max_lon, min_lat, max_lat))
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        lat_cell = "floor(latitude / ?) * ? + ? / 2"
        lon_cell = "floor(longitude / ?) * ? + ? / 2"
        grid_params = [grid_degrees, grid_degrees, grid_degrees,
                       grid_degrees, grid_degrees, grid_degrees]
        rows = self.conn.execute(
            f"SELECT {lat_cell} AS cell_latitude, {lon_cell} AS cell_longitude, "
            f"sensor, platform, product_id, count(*) AS observation_count "
            f"FROM fire_observation {clause} "
            "GROUP BY cell_latitude, cell_longitude, sensor, platform, product_id "
            "ORDER BY cell_latitude, cell_longitude, sensor, platform, product_id",
            grid_params + params,
        ).fetchall()
        cells: dict[tuple[float, float], dict[str, Any]] = {}
        for lat, lon, sensor, platform, product_id, count in rows:
            key = (round(float(lat), 6), round(float(lon), 6))
            cell = cells.setdefault(key, {"latitude": key[0], "longitude": key[1], "series": [], "max_series_count": 0})
            cell["series"].append({
                "sensor": sensor, "platform": platform, "product_id": product_id,
                "observation_count": count,
            })
            cell["max_series_count"] = max(cell["max_series_count"], count)
        return list(cells.values())

    def get_observation(self, observation_id: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM fire_observation WHERE observation_id=?", [observation_id]).fetchone()
        if not row:
            return None
        cols = [d[0] for d in self.conn.description]
        return dict(zip(cols, row))

    def observations_for_calendar(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT sensor, platform, product_id, latitude, longitude, acquired_at_utc, source_snapshot_id,"
            " frp_native, frp_mw, confidence_raw, confidence_class_native, daynight_native"
            " FROM fire_observation ORDER BY acquired_at_utc"
        ).fetchall()
        cols = [d[0] for d in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def query_observation_month_counts(
        self, *, aoi_geometry, start, end, sensors=None, platforms=None, products=None,
        min_frp_native=None, daynight=None, min_modis_confidence=None,
        viirs_confidence_classes=None,
    ) -> list[dict[str, Any]]:
        """Count rows in DuckDB for a rectangular AOI, retaining series provenance.

        This avoids materializing the national observation table in Python for
        the common calendar query. Non-rectangular AOIs use the exact Shapely
        fallback in the calendar service.
        """
        where, params = [], []
        for column, values in (("sensor", sensors), ("platform", platforms), ("product_id", products)):
            if values:
                where.append(f"{column} IN ({','.join('?' for _ in values)})")
                params.extend(values)
        if start is not None:
            where.append("acquired_at_utc >= ?")
            params.append(start)
        if end is not None:
            where.append("acquired_at_utc < ?")
            params.append(end)
        if min_frp_native is not None:
            where.append("frp_native >= ?")
            params.append(min_frp_native)
        if daynight:
            where.append("upper(trim(daynight_native)) = ?")
            params.append(daynight.upper())
        if min_modis_confidence is not None:
            where.append("(sensor <> 'MODIS' OR try_cast(confidence_raw AS DOUBLE) >= ?)")
            params.append(min_modis_confidence)
        if viirs_confidence_classes:
            where.append(
                f"(sensor <> 'VIIRS' OR upper(trim(confidence_class_native)) IN "
                f"({','.join('?' for _ in viirs_confidence_classes)}))"
            )
            params.extend(value.upper() for value in viirs_confidence_classes)
        min_lon, min_lat, max_lon, max_lat = aoi_geometry.bounds
        where.extend(("longitude >= ?", "longitude <= ?", "latitude >= ?", "latitude <= ?"))
        params.extend((min_lon, max_lon, min_lat, max_lat))
        rows = self.conn.execute(
            "SELECT sensor, platform, product_id, date_trunc('month', acquired_at_utc) AS period_start_utc, "
            "count(*) AS observation_count, list(DISTINCT source_snapshot_id) AS source_snapshot_ids "
            "FROM fire_observation WHERE " + " AND ".join(where) + " "
            "GROUP BY sensor, platform, product_id, period_start_utc "
            "ORDER BY sensor, platform, product_id, period_start_utc",
            params,
        ).fetchall()
        return [
            {
                "sensor": sensor,
                "platform": platform,
                "product_id": product_id,
                "period_start_utc": period_start,
                "observation_count": count,
                "source_snapshot_ids": snapshots or [],
            }
            for sensor, platform, product_id, period_start, count, snapshots in rows
        ]

    def list_calendar(
        self,
        aoi_id: str,
        start: Any | None = None,
        end: Any | None = None,
        sensors: list[str] | None = None,
        platforms: list[str] | None = None,
        products: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        # D-08 fix: SQL-side filtering so exports honor the requested window
        # and sensor/platform/product scope instead of leaking all aggregates.
        q = "SELECT * FROM calendar_aggregate WHERE aoi_id=?"
        args: list[Any] = [aoi_id]
        if start is not None:
            q += " AND period_start_utc >= ?"
            args.append(start)
        if end is not None:
            q += " AND period_start_utc < ?"
            args.append(end)
        if sensors:
            q += f" AND sensor IN ({','.join('?' for _ in sensors)})"
            args.extend(sensors)
        if platforms:
            q += f" AND platform IN ({','.join('?' for _ in platforms)})"
            args.extend(platforms)
        if products:
            q += f" AND product_id IN ({','.join('?' for _ in products)})"
            args.extend(products)
        q += " ORDER BY sensor, platform, period_start_utc"
        rows = self.conn.execute(q, args).fetchall()
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
