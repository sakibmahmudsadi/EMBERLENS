#!/usr/bin/env python3
"""Register NASA FIRMS source-service availability for the loaded national products.

Fetches /api/data_availability/csv/<MAP_KEY>/<SOURCE>/ for MODIS_SP and VIIRS_SNPP_SP
(the only registered national products — no NOAA-20/21, no NRT) and stores one
`data_availability` row per product in the national DuckDB, so `/api/v1/coverage`
can show the source-service date ceiling with its mandatory caveat.

Not an observation source and not clear-sky proof: availability describes the
source service's date coverage only. Credentials stay in the environment; the
stored source_reference uses the documented <MAP_KEY> placeholder, never the key.

Usage (from project root, after scripts/load_national_data.py):
    backend/.venv/Scripts/python.exe scripts/register_availability.py
    backend/.venv/Scripts/python.exe scripts/register_availability.py --db data/processed/bangladesh-bd.duckdb
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import importlib.util

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

spec = importlib.util.spec_from_file_location("firms_ingest", ROOT / "scripts" / "ingest.py")
INGEST = importlib.util.module_from_spec(spec)
spec.loader.exec_module(INGEST)  # loads project .env, defines PRODUCTS

from backend.db.database import init_db  # noqa: E402

SOURCE_REF = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/<MAP_KEY>/{pid}"
NOTES = ("FIRMS source-service date availability from /api/data_availability/csv on {day}; "
         "describes the source service's date coverage, not clear-sky or valid-pixel "
         "observation opportunity.")


def fetch_availability(key: str, product_id: str) -> tuple[str, str]:
    url = f"{INGEST.FIRMS_BASE}/api/data_availability/csv/{key}/{product_id}/"
    import urllib.request
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read().decode("utf-8", "replace")
    dates = sorted(set(re.findall(r"20\d\d-\d\d-\d\d", body)))
    if not dates or "invalid map_key" in body.lower():
        raise RuntimeError("FIRMS did not return valid availability dates for this product")
    return dates[0], dates[-1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=str(ROOT / "backend" / "emberlens-bangladesh.duckdb"),
                    help="DuckDB path (default keeps the locked/demo backend DB untouched)")
    args = ap.parse_args()

    key = __import__("os").environ.get("NASA_FIRMS_MAP_KEY", "")
    if not key:
        print("ERROR: NASA_FIRMS_MAP_KEY not configured in env or project .env", file=sys.stderr)
        return 2

    registered = {p["product_id"]: p for p in INGEST.PRODUCTS}
    wanted = ["MODIS_SP", "VIIRS_SNPP_SP"]
    missing = [p for p in wanted if p not in registered]
    if missing:
        print(f"ERROR: products not registered in scripts/ingest.py: {missing}", file=sys.stderr)
        return 2

    db = init_db(Path(args.db))
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        rows_written = 0
        db.conn.execute("BEGIN TRANSACTION")
        try:
            for pid in wanted:
                prod = registered[pid]
                try:
                    lo, hi = fetch_availability(key, pid)
                except Exception as exc:  # noqa: BLE001
                    print(f"ERROR {pid}: availability fetch failed ({type(exc).__name__})", file=sys.stderr)
                    db.conn.execute("ROLLBACK")
                    return 3
                source_reference = SOURCE_REF.format(pid=pid)
                db.conn.execute(
                    "DELETE FROM data_availability WHERE product_id = ? AND source_reference = ?",
                    [pid, source_reference],
                )
                db.insert_availability({
                    "availability_id": uuid.uuid4().hex,
                    "product_id": pid,
                    "platform": prod["platform"],
                    "date_or_interval": f"{lo}..{hi}",
                    "availability_status": "available",
                    "source_reference": source_reference,
                    "checked_at_utc": datetime.now(timezone.utc),
                    "notes": NOTES.format(day=today),
                })
                rows_written += 1
                print(f"registered {pid}: {lo}..{hi} (status=available)", flush=True)
            db.conn.execute("COMMIT")
        except Exception:
            db.conn.execute("ROLLBACK")
            raise
        rows = db.conn.execute(
            "SELECT product_id, platform, date_or_interval, availability_status FROM data_availability ORDER BY product_id"
        ).fetchall()
        print(f"data_availability rows in DB: {len(rows)}")
        for r in rows:
            print(" ", r)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
