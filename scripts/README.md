- `ingest.py` — download/validate the Bangladesh national 2010–2026 Standard Product CSVs (`bangladesh-bd` bbox) via the FIRMS Area API.
- `load_national_data.py` — load those validated CSVs into the national DuckDB (default `backend/emberlens-bangladesh.duckdb`).
- `register_availability.py` — register FIRMS source-service availability intervals for `MODIS_SP` and `VIIRS_SNPP_SP`.
- `register_missing_days.py` — register FIRMS Standard missing-day evidence (global source-service dates, not AOI opportunity) for the frozen window.
- `download_viirs_parallel.py` — sharded VIIRS continuation downloader (checkpointed, quota-aware); see its module docstring for shard syntax.

# Scripts

Place reproducible command-line entry points here only when they do not belong naturally inside the backend package. Every script must have documented inputs, outputs, configuration, safe retry behavior, and an example invocation. Do not commit one-off notebooks or temporary scripts as production pipeline steps without review.
