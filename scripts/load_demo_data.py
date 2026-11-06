"""Load the frozen demo snapshot (real FIRMS CSVs) into the EMBERLENS DuckDB.

Reads data/raw/*.csv (produced by scripts/ingest.py --download), loads them via
backend.local_loader.load_csv (validate -> map -> dedup -> insert), registers
the demo AOI, and prints a summary backed by SELECT counts.

Idempotent: load_csv deletes + reinserts per snapshot.

Usage (from project root, using the backend venv):
    backend/.venv/Scripts/python.exe scripts/load_demo_data.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db.database import init_db  # noqa: E402
from backend.local_loader import load_csv  # noqa: E402
from shapely.geometry import box  # noqa: E402

AOI = {
    "aoi_id": "sundarbans-bd",
    "name": "Sundarbans (Bangladesh/India border mangrove forest)",
    "bbox": (88.0, 21.5, 90.0, 22.7),  # west, south, east, north
    "source": "Task-specified demo bbox (no public boundary source reachable 2026-11-06)",
}

FILES = [
    ("data/raw/MODIS_SP_2024-01-01_2025-12-31_sundarbans-bd.csv",
     "MODIS", "MODIS_SP", "Terra+Aqua", "Collection 6.1 (MCD14IM / MCD14DL)"),
    ("data/raw/VIIRS_SNPP_SP_2024-01-01_2025-12-31_sundarbans-bd.csv",
     "VIIRS", "VIIRS_SNPP_SP", "Suomi-NPP", "VNP14IMGTDL_SP (375 m)"),
]

DB_PATH = ROOT / "backend" / "emberlens.duckdb"


def main() -> None:
    db = init_db(DB_PATH)

    for rel, sensor, product_id, platform, version in FILES:
        p = ROOT / rel
        if not p.exists():
            raise SystemExit(f"Missing {p} — run python scripts/ingest.py --download first.")
        res = load_csv(
            db, p, sensor=sensor, product_id=product_id, platform=platform,
            processing_level="Standard (science quality, SP)",
            collection_version=version,
            source_endpoint="https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/",
            documentation_url="https://firms.modaps.eosdis.nasa.gov/api/data_availability/",
            ingestion_run_id="load_demo_data-20261106",
        )
        print("loaded:", p.name, "->", res)

    w, s, e, n = AOI["bbox"]
    db.upsert_aoi(
        aoi_id=AOI["aoi_id"], name=AOI["name"], geometry=box(w, s, e, n),
        crs="EPSG:4326", source=AOI["source"],
    )

    # Summary backed by real SELECTs.
    total = db.count_observations()
    snaps = db.conn.execute("SELECT product_id, sensor, platform, row_count FROM source_snapshot").fetchall()
    months = db.conn.execute(
        "SELECT substr(CAST(acquired_at_utc AS VARCHAR), 1, 7) AS m, sensor, COUNT(*) "
        "FROM fire_observation GROUP BY m, sensor ORDER BY m, sensor"
    ).fetchall()
    print(f"\nSnapshots: {len(snaps)}")
    for row in snaps:
        print(" ", row)
    print(f"Total canonical observations: {total}")
    print(f"Months with observations: {len(months)}  (sensor x month)")
    for m, sensor, c in months[:12]:
        print(f"  {m} {sensor}: {c}")
    if len(months) > 12:
        print(f"  ... ({len(months) - 12} more sensor-month combos)")
    db.close()


if __name__ == "__main__":
    main()
