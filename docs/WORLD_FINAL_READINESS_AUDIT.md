# World Final Readiness Audit

Evidence-based readiness for the NASA Space Apps presentation. A claim is **Verified complete** only with an observed result in this tree; anything else is labelled partial/not-verified, not completed.

## Verified complete

| Claim | Evidence |
|---|---|
| National snapshot loaded: 668,485 obs (MODIS_SP 147,536 / VIIRS_SNPP_SP 520,949) | `backend/emberlens-bangladesh.duckdb` query; manifests `ingest-20261106T083508Z-4379f4` / `cfe10f`, SHA-256 `5a1fd42b902c…` / `460a271eedb5…`, `validation_status: passed` |
| Date bounds + availability | MODIS records 2010-01-01–2026-07-25; VIIRS 2012-01-20–2026-07-28; `data_availability` = 120 rows (2 broad `available` intervals + 118 `missing` dates) in DB |
| Calendar 199 bins / series | Prior live `/api/v1/calendar?aoi_id=bangladesh-bd&start=2010-01-01&end=2026-08-01` returned 199 bins per series; months with a matching FIRMS missing day marked `partial_source_data` (this step did not re-query; see Partially verified) |
| Sensor separation | `/api/v1/calendar` + `sensors=MODIS` / `sensors=VIIRS` returned isolated series; `products=MODIS_SP` returned Terra 17,979 + Aqua 129,557 = 147,536; VIIRS 520,947 in-bbox (2 outside bbox) |
| Map → calendar → drilldown → export (prior browser verification) | BrowserOS on isolated QA container (2026-11-08): map 3,174 cells, VIIRS-only 520,947, month drilldown (Mar 2020 MODIS Aqua 5,995 / VIIRS 22,008), hotspot-group exports (18 obs, 2 groups), CSV/JSON/GeoJSON manifests verified. Not re-run live in Step 3 due to no running servers at audit start (see Partially verified) |
| Backend suite | `pytest` **73 passed** (1 Starlette/httpx warning), Ruff **clean** (re-run in Step 3) |
| Frontend production build | `npm run build` **passes** (1.07 MB MapLibre chunk warning only); `npm audit` **0 vulnerabilities** (prior to Step 3; not re-run in Step 3 build gate) |
| Native launcher (Steps 1–2) | `.\start_emberlens.ps1` → backend healthy at `http://127.0.0.1:8000/api/v1/health` + frontend `http://127.0.0.1:5173`; duplicate start refused; `.\stop_emberlens.ps1` stops only EMBERLENS PIDs; restart test passes; DB/manifest SHA-256 unchanged |
| Docker retired from active workflow | `Dockerfile`/`compose.yaml`/`.dockerignore`/`container_start.py` archived under `archive/future-cloud-deployment/docker/`; `.env.example`, `README.md`, `infrastructure/README.md` document native-only; not invoked by the launcher |
| Documentation accuracy (Step 3) | This audit; stale Sundarbans/legacy refs removed from active docs (see below); factual numbers rechecked against manifests/DB |

## Partially verified

| Claim | Status |
|---|---|
| Full live happy-path on current working tree | Backend/frontend build and health verified in Step 2; Steps 1–2 also verified map/calendar/filter/export via prior live API calls, but the *current* uncommitted working tree (12 modified files) has not had a fresh browser journey. Re-run `docs/DEMO_RUNBOOK.md` after committing. |
| Desktop resolutions (1366×768 / 1440×900 / 1920×1080) | Prior screenshot checks at ~1242–1258 px found no page-level horizontal overflow; the three presentation sizes have not been re-verified in Step 3. |
| Calendar 199 bins on current tree | Last live 199-bin response predates the current working tree (`backend/api/routes.py` +64 lines uncommitted). Should be re-queried after restart. |
| `npm audit` 0 vulns on current tree | Last full audit was pre-Step-3; Step 3 re-ran build but not audit. |
| Git hygiene | 12 modified + 2 deleted + 2 untracked scripts are uncommitted; Step 3 preserved them by instruction. |

## Not verified

- Desktop-resolution rendering, full browser map→calendar→drilldown→export journey, and `npm audit` on the current working tree (no servers running at audit start; browserclaw live-test was attempted but the agent browser was unavailable — see Step 3 report).
- Fresh-install reproducibility from a clean environment (clone → venv → `npm ci` → start) — not attempted in this step.
- Authoritative boundary correctness (bbox is task-specified, not an official boundary; geoBoundaries outline is display-only).
- Any post-2026 VIIRS continuation after Suomi-NPP cessation (2026-11-02).

## Known scientific limitations (do not soften)

- FIRMS detections are thermal-anomaly/active-fire observations, not confirmed wildfires.
- MODIS (1 km, numeric 0–100 confidence) and VIIRS (375 m, categorical low/nominal/high) have different characteristics and confidence semantics; counts are never summed.
- Missing source records ≠ zero fire activity. Availability/missing-day data describe the source service, not valid-pixel or clear-sky opportunity over the AOI. `partial_source_data` only flags months containing a global FIRMS missing day.
- `bangladesh-bd` is a task-specified bounding box, not an authoritative national boundary; it over-includes adjacent India/Myanmar.
- No validated anomaly detector or forecast exists; seasonal comparison is descriptive (sample median/IQR, n≥5) only.
- Hotspot groups are experimental algorithmic centroid clusters, not fire perimeters or confirmed incidents. Distance parameter sensitivity was observed (2 vs 3 groups on the same 18 VIIRS detections).
- Standard Products only; no NRT backfill was used to extend the window. MODIS-only Aug 2026 is excluded by design (common ceiling 2026-07-31).

## Known technical limitations

- MapLibre vendor chunk: 1.07 MB minified (~290 KB gzip) — desktop startup cost, not a correctness issue.
- Backend holds DuckDB in-memory via a process-wide lock (`locked_db`); queries serialize. Acceptable for the national snapshot; not a scale-out design.
- `backend/emberlens-bangladesh.duckdb.wal` accumulates until checkpoint/close.
- Calendar GeoJSON export is rejected by design (bins have no point geometry); raw API CSV carries a manifest comment that breaks strict parsers (UI sidecar is the presentation path).
- No public deployment exists; container assets are archived and require re-verification before any cloud use.

## Remaining competition risks

1. Uncommitted working tree (12 files) + unstaged Step 3 doc changes vs. the demo on stage — commit before presenting or demo from the exact HEAD + working tree and say so.
2. No verified live run after the latest edits — run `docs/DEMO_RUNBOOK.md` end-to-end on the actual laptop/ARIA before stage.
3. Demo-window staleness: snapshot ends 2026-07-31;VIIRS S-NPP ceased 2026-11-02 — frame as “historical snapshot,” not live monitoring.
4. Judge questions on “why Darjeeling/Chittagong-area density is high” — every map/calendar number must be quoted with its sensor, count unit, and “no source records returned; observation coverage unknown” caveat where relevant.
