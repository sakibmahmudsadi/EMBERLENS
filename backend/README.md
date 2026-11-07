# EMBERLENS Backend

Modular monolith (Phases 2–3): canonical observations, DuckDB store, UTC-month
calendar aggregation, and the FastAPI surface per `docs/API_SPECIFICATION.md`.

Scientific rules enforced: MODIS and VIIRS are never summed; there is no
universal `confidence_0_100`; a hotspot is never called a confirmed wildfire;
an empty calendar bin means "no source records returned; observation coverage
unknown", never "no fires".

## Setup

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-prod.txt
.venv/Scripts/python -m pip install pytest==9.2.0 ruff==0.17.4
```

Runtime dependencies are pinned in `requirements-prod.txt` and mirrored in
`pyproject.toml`. The backend directory contains multiple import packages, so
run modules from the repository root rather than installing it as one package.

## Run

```bash
cd "W:/Pipeline/Nasa Space App Challenge"   # project root, PowerShell
$env:EMBERLENS_DB = "backend/emberlens-bangladesh.duckdb"
backend/.venv/Scripts/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

The frontend dev server proxies `/api` to `http://127.0.0.1:8000` by default.
Set `VITE_API_PROXY_TARGET` if the API is on another port. Env: `FRONTEND_ORIGINS`
(CORS allowlist), `DATA_ROOT` (default `data/`), `EMBERLENS_DB` (DuckDB path),
and `EMBERLENS_AOI_IDS` (comma-separated AOI allowlist; defaults to `bangladesh-bd`).

## Seed from local CSVs

The FIRMS acquisition module (`backend/ingestion/`, owned by the data agent)
is not yet present. Until it lands, use the equivalent local loader:

```python
from backend.db.database import init_db
from backend.local_loader import load_csv

db = init_db("backend/emberlens.duckdb")
load_csv(db, "data/raw/modis_2024.csv", sensor="MODIS", product_id="MODIS_NRT")
load_csv(db, "data/raw/viirs_2024.csv", sensor="VIIRS", product_id="VNP14IM")
```

`load_csv` validates rows, maps them to the canonical schema
(`backend/harmonization/mapping.py`, v1), deduplicates exact source rows
within the product snapshot, and is idempotent on rerun.

Expected ingestion-module interface (documented for the data agent):

```
ingest_csv(path, *, sensor, product_id, source_snapshot_id=None,
           processing_level=None, collection_version=None, provider="NASA FIRMS",
           source_endpoint="", documentation_url=None) -> IngestionResult
register_availability(product_id, platform, date_or_interval, availability_status,
                      source_reference=None, checked_at=None, notes=None)
```

When that module lands, `load_csv` can be deleted and the ingestion package
should call the same canonical mapping + store functions.

## Tests

```bash
cd backend
.venv/Scripts/python -m pytest -q    # all tests use synthetic fixtures
.venv/Scripts/python -m ruff check .
```

All fixtures under `tests/fixtures/SYNTHETIC_NOT_NASA_DATA/` are hand-made —
**not NASA data**. The test configuration sets the import-time app database to
`:memory:` by default so the suite can run while a local API has the national
DuckDB open. Set `EMBERLENS_DB` explicitly only when you intend the import-time
app to use a separate test database.

## Calendar contract

- UTC month bins, start-inclusive / end-exclusive.
- Point-in-polygon via shapely `covers` (boundary included).
- Count unit: `source_observation_rows_after_exact_deduplication_within_product_snapshot`.
- `coverage_status ∈ {records_present, no_records_returned_coverage_unverified,
  source_data_gap, product_unavailable, partial_source_data, coverage_unknown,
  zero_detections_with_valid_observation_coverage}`.
- UI label for the unverified case: “No source records returned; observation
  coverage unknown”.
