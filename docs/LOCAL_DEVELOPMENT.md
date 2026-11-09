# Local Development

Native Windows setup for EMBERLENS. Docker is not required for development or the competition presentation. Container assets are archived under `archive/future-cloud-deployment/docker/` for a future cloud deployment (see `archive/future-cloud-deployment/README.md`); they are not invoked by the native launcher.

## Prerequisites

| Tool | Minimum | Verify |
|---|---|---|
| Windows | 10/11 (PowerShell 7+) | `$PSVersionTable.PSVersion` |
| Python | 3.12+ | `python --version` |
| Node.js | 20+ with npm | `node --version`, `npm --version` |
| National DuckDB | `backend/emberlens-bangladesh.duckdb` present | see below |

The backend venv (`backend/.venv`) and `frontend/node_modules/` must exist. The launcher checks both and prints first-time setup instructions if either is missing; it never installs dependencies for you.

## First-time Python setup

Run from the project root (modules assume the repo root is on `sys.path`):

```powershell
cd "W:\Pipeline\Nasa Space App Challenge"
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-prod.txt
.venv\Scripts\python -m pip install pytest==9.2.0 ruff==0.17.4
cd ..
```

Pinned runtime deps live in `backend/requirements-prod.txt` (mirrored in `backend/pyproject.toml`).

## First-time frontend setup

```powershell
cd "W:\Pipeline\Nasa Space App Challenge"
cd frontend
npm ci
cd ..
```

Production verification commands are:

```powershell
cd backend
.venv\Scripts\python -m pytest -q    # 73 passed (synthetic fixtures; :memory: DB)
.venv\Scripts\python -m ruff check .
cd ..\frontend
npm run build    # tsc + vite build -> dist/
npm audit --omit=dev   # expected: 0 vulnerabilities
```

## Environment configuration

Copy the example and adjust only if needed; never commit a real `.env` (it is gitignored). The launcher reads the process environment (it does not read `.env` automatically).

| Variable | Required | Default (backend) | Notes |
|---|---|---|---|
| `EMBERLENS_DB` | no | `backend/emberlens-bangladesh.duckdb` | DuckDB path; relative paths resolve from the project root in the launcher |
| `DATA_ROOT` | no | `data/` | Project data directory |
| `FRONTEND_ORIGINS` | no | `http://localhost:5173,http://127.0.0.1:5173` | CORS allowlist; legacy `FRONTEND_ORIGIN` also accepted |
| `EMBERLENS_AOI_IDS` | no | `bangladesh-bd` | AOI allowlist |
| `NASA_FIRMS_MAP_KEY` | only for ingestion scripts | — | Free key from `https://firms.modaps.eosdis.nasa.gov/api/map_key/`; never printed, logged, or committed |
| `VITE_API_PROXY_TARGET` | no | `http://127.0.0.1:8000` | Vite dev proxy target for `/api` |

Copy the template before setting a key:

```powershell
Copy-Item .env.example .env   # then edit locally; .env stays ignored
```

`.env.example` intentionally carries no secrets — it only documents names and safe placeholders.

## Startup

```powershell
.\start_emberlens.ps1
```

The launcher:

1. Checks Python/venv, Node, npm, `backend/`, `frontend/`, `frontend/node_modules/`, and the DuckDB file (exit 1 with setup instructions if missing).
2. Refuses to start if `.runtime/*.pid.json` already tracks running EMBERLENS processes (duplicate protection), or if the chosen ports are occupied (it never kills strangers).
3. Starts FastAPI (`backend/.venv/Scripts/python.exe -m uvicorn backend.app:app`) from the project root, then Vite (`npm run dev -- --port 5173 --host 127.0.0.1 --strictPort`) from `frontend/`.
4. Waits for `GET http://127.0.0.1:8000/api/v1/health` (60 s) and for the frontend root to respond (45 s); on failure it stops only the processes it started and removes its PID files.
5. Records PIDs + ports in `.runtime/*.pid.json` (no secrets) and logs in `.runtime/logs/`.

Overrides:

```powershell
.\start_emberlens.ps1 -BackendPort 8000 -FrontendPort 5173 -BackendHost 127.0.0.1
```

Defaults are taken from `frontend/vite.config.ts` (proxy `http://127.0.0.1:8000`, Vite default 5173) and `backend/config.py` (CORS default 5173) — not assumed.

URLs after a successful start:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- Health: `http://127.0.0.1:8000/api/v1/health`

## Shutdown

```powershell
.\stop_emberlens.ps1
```

Reads `.runtime/*.pid.json`, verifies each PID still belongs to an EMBERLENS process (executable + command-line check), stops only those, and removes the runtime files. Logs under `.runtime/logs/` are kept. The database, manifests, and exports are never touched.

## Database and data

- **Runtime database:** `backend/emberlens-bangladesh.duckdb` (gitignored via `*.duckdb`). Only `bangladesh-bd` is registered. `668,485` observations: `MODIS_SP` 147,536 + `VIIRS_SNPP_SP` 520,949.
- **Raw CSVs:** `data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` (147,536 rows, 2010-01-01–2026-07-25) and `data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` (520,949 rows, 2012-01-20–2026-07-28). Both are gitignored (`data/raw/**`) and are never modified by the launcher.
- **Manifests:** `data/processed/manifests/ingest-20261106T083508Z-4379f4_MODIS_SP_…json` and `ingest-20261106T091350Z-cfe10f_VIIRS_SNPP_SP_…json` (SHA-256 `5a1fd42b902c…` / `460a271eedb5…`, `validation_status: passed`).
- **Availability:** `data_availability` = 120 rows (2 broad `available` intervals + 118 `missing` date entries); broad intervals are source-service ceilings, not per-month proof.
- Ingestion (`scripts/ingest.py --download`, `scripts/load_national_data.py`) is a separate, keyed workflow — not part of startup. Do not re-run it for the presentation.

## Runtime logs

- `.runtime/logs/backend.log` / `backend.err.log` — uvicorn output
- `.runtime/logs/frontend.log` / `frontend.err.log` — Vite output

These survive `stop_emberlens.ps1` for post-demo diagnosis; they are not committed (`.runtime/` is gitignored).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "EMBERLENS is already running" | Stale or live `.runtime/*.pid.json` | `.\stop_emberlens.ps1`; if still held, check the PID in `.runtime/` manually (stop only verifies EMBERLENS-owned processes) |
| "port 8000/5173 is already in use" | Another app owns the port | Pick other ports: `.\start_emberlens.ps1 -BackendPort 8001 -FrontendPort 5174`; or stop the owner |
| "National DuckDB not found" | `EMBERLENS_DB` points elsewhere or file missing | Restore `backend/emberlens-bangladesh.duckdb` or set `$env:EMBERLENS_DB`; the launcher will not create it |
| Frontend blank, backend `ok` | Stale Vite dev client on the port, or proxy mis-target | Restart both via `.\stop_emberlens.ps1` then `.\start_emberlens.ps1`; confirm the launcher ports match the browser URL |
| `/api/v1/health` 404 on `/health` | Wrong path (health is `/api/v1/health`) | Use `http://127.0.0.1:8000/api/v1/health` |
| Calendar/calendar exports wrong counts | Old backend process | `.\stop_emberlens.ps1` then `.\start_emberlens.ps1` (restart clears stale code) |
| `NASA_FIRMS_MAP_KEY` missing | Only needed for ingestion scripts, not startup | Register at `https://firms.modaps.eosdis.nasa.gov/api/map_key/` and set in `.env` (never commit) |

## What the launcher will not do

- Install packages, create the venv, or `npm ci` (prints the commands instead)
- Create, overwrite, checkpoint into, or delete the DuckDB file beyond normal API operation
- Kill processes it did not start, or delete manifests, raw CSVs, or exports
- Store API keys in `.runtime/` metadata
- Depend on any Docker path, image, or volume
