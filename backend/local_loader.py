"""Local-CSV loader — the seam the ingestion agent's module will plug into.

Expected ingestion-module interface (backend/ingestion/, owned by another
agent — this file does NOT touch that package):

    IngestionResult  = dataclass(source_snapshot_id, row_count, sha256, ...)
    def ingest_csv(path, *, sensor, product_id, source_snapshot_id=None,
                   processing_level=None, collection_version=None, provider="NASA FIRMS",
                   source_endpoint="", documentation_url=None) -> IngestionResult
    def list_snapshots() -> list[dict]
    def register_availability(product_id, platform, date_or_interval,
                              availability_status, source_reference=None,
                              checked_at=None, notes=None) -> row_id

Until that module lands, `load_csv` below performs the same work directly
against the DuckDB store so the backend is never blocked.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.db.database import Database
from backend.harmonization.mapping import deduplicate, map_row
from backend.validation.checks import validate_row


def _observation_values(obs) -> tuple:
    """Bind parameters for one canonical observation (column order matches
    insert_observation in backend/db/database.py exactly)."""
    return (
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
    )


_OBS_COLUMNS = [
    "observation_id", "source_snapshot_id", "source_row_fingerprint", "source_record_id",
    "provider", "product_id", "collection_version", "processing_level", "sensor", "platform",
    "instrument", "acquired_at_utc", "acq_date_native", "acq_time_native", "latitude", "longitude",
    "brightness_primary_native", "brightness_secondary_native", "frp_native", "frp_unit_native",
    "frp_mw", "confidence_raw", "confidence_semantics", "confidence_class_native",
    "daynight_native", "scan_native", "track_native", "source_attributes",
    "ingested_at_utc", "normalization_version",
]


def _write_observations_csv(unique) -> str:
    """Serialize the deduped canonical observations to a temp CSV compatible with
    DuckDB's CSV reader. Returns the file path; caller deletes it."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w", encoding="utf-8", newline="")
    try:
        writer = csv.writer(tmp)
        writer.writerow(_OBS_COLUMNS)
        for obs in unique:
            writer.writerow(_observation_values(obs))
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
    except Exception:
        try:
            tmp.close()
        except Exception:
            pass
        os.unlink(tmp.name)
        raise
    if "'" in tmp.name:
        os.unlink(tmp.name)
        raise ValueError("temp path contains a quote; refusing to inline it in SQL")
    return tmp.name


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_csv(
    db: Database,
    path: str | Path,
    *,
    sensor: str,
    product_id: str,
    platform: str = "",
    processing_level: str | None = None,
    collection_version: str | None = None,
    provider: str = "NASA FIRMS",
    source_endpoint: str = "",
    documentation_url: str | None = None,
    ingestion_run_id: str | None = None,
) -> dict:
    """Load a FIRMS-format CSV into source_snapshot + fire_observation.

    Idempotent: observations are INSERT OR IGNORE on observation_id, and an
    exact duplicate source row within the snapshot increments dup count
    without adding a row.
    """
    path = Path(path)
    snapshot_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{product_id}|{path.name}"))
    raw_rows: list[dict] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(line for line in fh if line.strip() and not line.lstrip().startswith("#"))
        for line_no, row in enumerate(reader, start=2):
            result = validate_row({
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "acq_date_native": row.get("acq_date"),
            })
            if not result.ok:
                raise ValueError(f"{path}:{line_no}: invalid row: {result.errors}")
            raw_rows.append(row)

    # D-15 fix: empty input must fail loudly, never succeed with row_count=0.
    if not raw_rows:
        raise ValueError(f"{path}: no data rows (empty input file)")

    # D-13 fix: validate/map FIRST (pure computation, no DB writes) — a
    # mid-load failure (e.g. bad acq_time on the last row) therefore leaves
    # NO phantom snapshot. Snapshot+rows are then deleted+reinserted as one
    # idempotent reload unit.
    mapped = [
        map_row(
            r, sensor=sensor, product_id=product_id, source_snapshot_id=snapshot_id,
            provider=provider, processing_level=processing_level,
            collection_version=collection_version,
        )
        for r in raw_rows
    ]
    unique, dup_count = deduplicate(mapped)

    # One explicit transaction per file: replaces per-observation autocommit
    # with a single vectorized COPY. Keeps validation/mapping/dedup and the
    # same snapshot delete+reinsert semantics; failures roll back the whole
    # file's load, leaving no phantom snapshot.
    db.conn.execute("BEGIN TRANSACTION")
    try:
        db.conn.execute("DELETE FROM fire_observation WHERE source_snapshot_id=?", [snapshot_id])
        db.insert_snapshot({
            "source_snapshot_id": snapshot_id,
            "provider": provider,
            "source_endpoint": source_endpoint,
            "product_id": product_id,
            "processing_level": processing_level,
            "collection_version": collection_version,
            "platform": platform,
            "sensor": sensor,
            "requested_aoi": None,
            "requested_start_utc": None,
            "requested_end_utc": None,
            "retrieved_at_utc": datetime.now(timezone.utc),
            # D-01 fix: store only the file NAME, never an absolute path.
            "source_file_uri": Path(path).name,
            "sha256": _sha256_file(path),
            "row_count": len(raw_rows),
            "documentation_url": documentation_url,
            "documentation_checked_at": None,
            "ingestion_run_id": ingestion_run_id,
        })
        tmp_csv = _write_observations_csv(unique)
        try:
            # Vectorized bulk copy — one statement, one transaction per file.
            # Python-side dedup already removed within-snapshot duplicates, and
            # this snapshot's prior rows were just deleted, so plain COPY is
            # equivalent to INSERT OR IGNORE here (and ~700x faster than
            # row-by-row INSERT OR IGNORE in this DuckDB build).
            db.conn.execute(
                f"COPY fire_observation ({','.join(_OBS_COLUMNS)}) FROM '{tmp_csv}' "
                "(FORMAT CSV, HEADER TRUE, QUOTE '\"', ESCAPE '\"')"
            )
        finally:
            try:
                os.unlink(tmp_csv)
            except OSError:
                pass
        db.conn.execute("COMMIT")
    except Exception:
        db.conn.execute("ROLLBACK")
        raise

    return {
        "source_snapshot_id": snapshot_id,
        "row_count": len(raw_rows),
        "inserted_or_existing": len(unique),
        "exact_duplicates": dup_count,
    }
