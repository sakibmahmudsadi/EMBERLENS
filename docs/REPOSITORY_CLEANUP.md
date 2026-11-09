# Repository Cleanup

What was removed, what was archived, and what remains — so the cleanup is auditable.

## Removed (2026-11-09, desktop-only + Bangladesh-only steps)

| Path | What it was | Why removed |
|---|---|---|
| `backend/emberlens.duckdb` (+ `.wal`) | 7.1 MB Sundarbans prototype DB (2,053 obs, `sundarbans-bd`) | Superseded by the national DB; Sundarbans area is inside `bangladesh-bd` and already covered by 15,156 national obs in that bbox (2010–2026) |
| `backend/calendar-fastpath-qa.duckdb` | 195 MB QA scratch DB | Disposable benchmark copy; not part of the demo |
| `backend/container-static-smoke.duckdb`, `backend/test-calendar-fast-path.duckdb` | 268 KB each smoke/test DBs | Disposable |
| `data/raw/_archive_2024-2025/` | Archived Sundarbans CSVs (MODIS 5.9 KB, VIIRS 153 KB) | Retired scope; national CSVs supersede them |
| `frontend/public/aoi/sundarbans-demo.geojson` | 346 B demo AOI asset (inactive) | Single-AOI presentation uses `bangladesh-national.geojson` + `bangladesh-country-outline.geojson` |
| `scripts/load_demo_data.py` | Legacy Sundarbans/2024–2025 loader into the legacy DB | Dead path; active loaders are `load_national_data.py`, `register_availability.py`, `register_missing_days.py` |

Still ignored by git but intentionally kept: `backend/emberlens-bangladesh.duckdb` (194 MB, WAL sidecar), `data/raw/*_bangladesh-bd.csv`, `data/processed/manifests/*.json`, `.runtime/` (launcher PIDs/logs).

## Archived (not deleted) — future cloud deployment

Preserved under `archive/future-cloud-deployment/` (see `archive/future-cloud-deployment/README.md`):

| Original | Archived as |
|---|---|
| `Dockerfile` | `archive/future-cloud-deployment/docker/Dockerfile` |
| `compose.yaml` | `archive/future-cloud-deployment/docker/compose.yaml` |
| `.dockerignore` | `archive/future-cloud-deployment/docker/.dockerignore` |
| `backend/container_start.py` | `archive/future-cloud-deployment/docker/backend/container_start.py` |

Container start was Docker-only (the archived `CMD`); the native launcher (`start_emberlens.ps1`) invokes `backend.app:app` via uvicorn directly and never used it. Files were moved byte-identical; relative paths inside the archived `Dockerfile` still reference the repo root and must be re-verified before any future cloud build.

## Remaining obsolete references (known, left intentionally)

- `docs/STATUS.md` — dated 2026-11-08 evidence narrative (isolated container on 18002, stale 8000 listener, 70 vs 71 test counts). Retained as dated history; superseded by this cleanup and the Step 1/2 verifications recorded in `docs/STATUS.md` headers and `WORLD_FINAL_READINESS_AUDIT.md`.
- `docs/ARCHITECTURE.md` — §3 table row “Docker Compose for database/services.” Historical recommendation; the active local path is now the native scripts (see `README.md`). Left as history with a Step 3 note.
- `docs/DECISIONS.md` ADR-008/009/010/011 — proposed 24-month work; ADR-012 (accepted, national bbox) supersedes them for active scope; kept as decision history with explicit supersession labels.
- `testcase/backend/` cases referencing ENV-3 Sundarbans expectations — see the retired markers below; kept for traceability with corrected environment notes.

## Cleanup decisions

- **Deleted, not archived, the Sundarbans DB:** re-creating it would require re-downloading and re-loading; its 2,053 rows are contained within the national snapshot's Sundarbans-bbox subset (15,156 rows), so no unique information was lost. Recovery path, if ever needed, is `scripts/ingest.py --download` + `scripts/load_national_data.py`.
- **Kept the 24-month ADR-008–011 history:** deleting decision records would erase the evidence trail for why the national scope was chosen.
- **Did not touch** `backend.config.py` behavior (only a stale comment), API routes, schemas, or manifests. Docs-only changes in Step 3 except comment fixes.
