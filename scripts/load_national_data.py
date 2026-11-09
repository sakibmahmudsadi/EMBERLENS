"""Load the national Bangladesh FIRMS snapshot into an EMBERLENS DuckDB.

Reads data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv and
data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv, validates,
maps, deduplicates, registers the bangladesh-bd AOI, and prints real SELECT
counts.

Usage (from project root, using the backend venv):
    backend/.venv/Scripts/python.exe scripts/load_national_data.py
    backend/.venv/Scripts/python.exe scripts/load_national_data.py --db data/processed/bangladesh-bd.duckdb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db.database import init_db  # noqa: E402
from backend.local_loader import load_csv  # noqa: E402
from shapely.geometry import box  # noqa: E402

AOI = {
    "aoi_id": "bangladesh-bd",
    "name": "Bangladesh (national bounding box; includes small out-of-country overhang)",
    "bbox": (88.0, 20.5, 92.7, 26.7),  # west, south, east, north
    "source": "Task-specified national bounding box (user-approved 2026-11-06); not an authoritative boundary",
}

FILES = [
    ("data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv",
     "MODIS", "MODIS_SP", "Terra+Aqua", "Collection 6.1 (MCD14IM / MCD14DL)"),
    ("data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv",
     "VIIRS", "VIIRS_SNPP_SP", "Suomi-NPP", "VNP14IMGTDL_SP (375 m)"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(ROOT / "backend" / "emberlens-bangladesh.duckdb"),
                        help="DuckDB path (default: backend/emberlens-bangladesh.duckdb)")
    args = parser.parse_args()

    db = init_db(Path(args.db))
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
            ingestion_run_id="load_national_data-20261106",
        )
        print("loaded:", p.name, "->", res)

    w, s, e, n = AOI["bbox"]
    db.upsert_aoi(
        aoi_id=AOI["aoi_id"], name=AOI["name"], geometry=box(w, s, e, n),
        crs="EPSG:4326", source=AOI["source"],
    )

    total = db.count_observations()
    snaps = db.conn.execute(
        "SELECT product_id, sensor, platform, row_count FROM source_snapshot ORDER BY product_id"
    ).fetchall()
    months = db.conn.execute(
        "SELECT substr(CAST(acquired_at_utc AS VARCHAR), 1, 7) AS m, sensor, COUNT(*) "
        "FROM fire_observation GROUP BY m, sensor ORDER BY m, sensor"
    ).fetchall()
    print(f"\nDB: {args.db}")
    print(f"Snapshots: {len(snaps)}")
    for row in snaps:
        print(" ", row)
    print(f"Total canonical observations: {total}")
    print(f"Months with observations: {len(months)}  (sensor x month)")
    for m, sensor, c in months[:24]:
        print(f"  {m} {sensor}: {c}")
    if len(months) > 24:
        print(f"  ... ({len(months) - 24} more sensor-month combos)")
    db.close()


if __name__ == "__main__":
    main()
