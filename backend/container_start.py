"""Fail-fast data check followed by the single-worker production API process."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import duckdb

from backend.config import get_settings


def validate_database() -> int:
    database_path = Path(get_settings().db_path)
    if not database_path.is_file():
        raise SystemExit(
            f"National DuckDB file is missing: {database_path}. "
            "Mount the validated database directory at /var/lib/emberlens."
        )

    try:
        connection = duckdb.connect(str(database_path), read_only=True)
        tables = {row[0] for row in connection.execute("SHOW TABLES").fetchall()}
        required_tables = {"fire_observation", "source_snapshot", "aoi"}
        missing_tables = required_tables - tables
        if missing_tables:
            raise SystemExit(f"National database is missing tables: {', '.join(sorted(missing_tables))}.")

        observation_count = connection.execute("SELECT count(*) FROM fire_observation").fetchone()[0]
        aoi_exists = connection.execute("SELECT count(*) FROM aoi WHERE aoi_id='bangladesh-bd'").fetchone()[0]
        products = {
            row[0]
            for row in connection.execute(
                "SELECT DISTINCT product_id FROM source_snapshot "
                "WHERE product_id IN ('MODIS_SP', 'VIIRS_SNPP_SP')"
            ).fetchall()
        }
    except duckdb.Error as exc:
        raise SystemExit(f"National database cannot be opened or validated: {exc}") from exc
    finally:
        if "connection" in locals():
            connection.close()

    missing_products = {"MODIS_SP", "VIIRS_SNPP_SP"} - products
    if observation_count <= 0 or not aoi_exists or missing_products:
        raise SystemExit(
            "National database is incomplete: "
            f"observations={observation_count}, bangladesh-bd={bool(aoi_exists)}, "
            f"missing_products={','.join(sorted(missing_products)) or 'none'}."
        )
    return observation_count


def main() -> None:
    observation_count = validate_database()
    port = os.environ.get("PORT", "8000")
    print(f"Validated national database: {observation_count:,} observations; products=MODIS_SP,VIIRS_SNPP_SP.")
    os.execv(sys.executable, [
        sys.executable, "-m", "uvicorn", "backend.app:app",
        "--host", "0.0.0.0", "--port", port, "--workers", "1",
    ])


if __name__ == "__main__":
    main()
