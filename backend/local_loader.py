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
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.db.database import Database
from backend.harmonization.mapping import deduplicate, map_row
from backend.validation.checks import validate_row


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

    db.conn.execute("DELETE FROM fire_observation WHERE source_snapshot_id=?", [snapshot_id])
    db.conn.execute("DELETE FROM source_snapshot WHERE source_snapshot_id=?", [snapshot_id])
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
        "source_file_uri": str(path),
        "sha256": _sha256_file(path),
        "row_count": len(raw_rows),
        "documentation_url": documentation_url,
        "documentation_checked_at": None,
        "ingestion_run_id": ingestion_run_id,
    })

    mapped = [
        map_row(
            r, sensor=sensor, product_id=product_id, source_snapshot_id=snapshot_id,
            provider=provider, processing_level=processing_level,
            collection_version=collection_version,
        )
        for r in raw_rows
    ]
    unique, dup_count = deduplicate(mapped)
    for obs in unique:
        db.insert_observation(obs)

    return {
        "source_snapshot_id": snapshot_id,
        "row_count": len(raw_rows),
        "inserted_or_existing": len(unique),
        "exact_duplicates": dup_count,
    }
