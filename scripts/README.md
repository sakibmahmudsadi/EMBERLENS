- `ingest.py` — download/validate the reserved Bangladesh national 2010–2026 Standard Product CSVs (`bangladesh-bd` bbox) via the FIRMS Area API.
- `load_national_data.py` — load those validated CSVs into a **separate** DuckDB (default `backend/emberlens-bangladesh.duckdb`); does not modify the legacy demo DB.
- `load_demo_data.py` — legacy Sundarbans/2024–2025 demo loader retained for reproducibility; not the active scope.

# Scripts

Place reproducible command-line entry points here only when they do not belong naturally inside the backend package. Every script must have documented inputs, outputs, configuration, safe retry behavior, and an example invocation. Do not commit one-off notebooks or temporary scripts as production pipeline steps without review.
