# 12 — Non-functional and reproducibility

---

## BE-TC-146 — Byte-identical input ⇒ identical derived output (modulo timestamps)
- **Type / Priority:** NonFunctional / P0 · **Refs:** METH §14; PIPE §5; VAL §12; PRD §9
- **Pre:** scratch ENV-1; frozen synthetic fixtures; fixed method_version
- **Steps:** full run twice into two fresh DBs: load fixtures → `GET /calendar` → capture `series` (excluding `generated_at`) and `calendar_aggregate` rows; compare hashes/JSON
- **Expected:** identical counts, bins, statuses, snapshot ids, fingerprints; `aggregate_id` stable; only `generated_at_utc` differs.
- **Status:** Not executed

## BE-TC-147 — Checksum verification path for raw files
- **Type / Priority:** NonFunctional / P0 · **Refs:** PIPE §2, §4; VAL §3
- **Steps:** after load, recompute SHA-256 of source file; compare to manifest/`source_snapshot.sha256`; corrupt one byte of a copy and reload (scratch)
- **Expected:** match on intact file; corrupted file rejected or reported as new snapshot with different hash; never "verified" without reading the bytes.
- **Status:** Not executed

## BE-TC-148 — Ingestion is resumable / restartable without duplication
- **Type / Priority:** NonFunctional / P1 · **Refs:** PIPE §5, §11; PRD §9
- **Steps:** kill process mid-load (simulate: raise in `map_row` on row k); restart; reload same file; inspect counts and snapshots
- **Expected:** no duplicate observations; failed run recorded `failed` (ideally); rerun converges to same state as clean run; no orphan WAL growth.
- **Actual (code review):** partial write leaves phantom snapshot (BE-TC-075); rerun after fix **does** converge (delete+reload) but counts previously "succeeded" misleadingly.
- **Status:** Partially covered — D-13

## BE-TC-149 — App start from clean checkout is documented and works
- **Type / Priority:** NonFunctional / P0 · **Refs:** README §5; DEFINITION_OF_DONE §6; VAL §12
- **Steps:** fresh terminal, clean venv per README; set `EMBERLENS_DB` scratch; `pytest`; `uvicorn backend.app:app`; `GET /health`
- **Expected:** copy-paste instructions succeed; no hidden global state; failure modes (locked DB, missing dir) give actionable errors.
- **Actual (observed 2026-11-06):** plain `pytest` fails importing `backend.app` because `backend/emberlens.duckdb` is locked by another process; documented workaround (scratch `EMBERLENS_DB`) yields 38/38 pass. **The default documented start path is currently broken on this machine.**
- **Status:** Executed — FAIL on default path (D-20)

## BE-TC-150 — Structured logging with run ids and counts; no secrets
- **Type / Priority:** NonFunctional / P1 · **Refs:** PRD §9 (Observability); PIPE §9; CLAUDE.md §5
- **Steps:** run app with `logging.DEBUG`; trigger load + calendar + export; collect logs; grep for MAP_KEY/`C:\` usernames
- **Expected:** each run logs `run_id`, inputs, counts, duration, warnings; zero secrets; log level configurable.
- **Actual (code review):** no application logging at all (only Uvicorn access logs).
- **Status:** Code-review finding — D-33

## BE-TC-151 — Query performance on demo-scale data is measured, not invented
- **Type / Priority:** NonFunctional / P2 · **Refs:** PRD §9; VALIDATION_PLAN §2 (rule: measure then set targets)
- **Steps:** time `/calendar`, `/observations?page_size=100`, export creation on ENV-3 copy; record ms; set target AFTER measurement; document in STATUS
- **Expected:** measurements recorded; no made-up "<100 ms" claims; regressions flagged when >2× baseline.
- **Status:** Not executed

## BE-TC-152 — Time-zone sanity across server/UTC boundaries
- **Type / Priority:** NonFunctional / P1 · **Refs:** ARCHITECTURE §6
- **Steps:** DST change days (2024-10-27) irrelevant to UTC bins; verify response times always `Z` or `+00:00`; naive local midnight insertion is impossible via API (none accepted), only via loader — loader uses `datetime.now(timezone.utc)` (good)
- **Expected:** all stored/returned times effectively UTC; no local-time leakage into bins.
- **Status:** Not executed

## BE-TC-153 — Large-ish result sets: observations list at 1–2k rows is responsive
- **Type / Priority:** NonFunctional / P2 · **Refs:** PRD §9
- **Steps:** ENV-3 copy; `GET /observations?page_size=1000`; measure time to first byte and total; check payload size
- **Expected:** acceptable for demo (no target invented); no OOM; compression if proxied.
- **Status:** Not executed

## BE-TC-154 — Crash recovery: no half-written DuckDB after kill -9 mid-export
- **Type / Priority:** NonFunctional / P2 · **Refs:** PIPE §5
- **Steps:** SIGKILL during `/calendar` insert loop; restart; inspect table integrity (`CHECKPOINT`, `pragma integrity_check`-like) or recreate from raw+snapshot
- **Expected:** DB opens; either transaction-safe or rebuild path documented (raw files are the source of truth — pipeline re-runnable).
- **Status:** Not executed

## BE-TC-155 — Full reproducibility drill from clean environment
- **Type / Priority:** NonFunctional / P0 · **Refs:** VAL §12; README §4 ENV-4
- **Steps:**
  1. Fresh clone/copy of repo at current revision
  2. Install pinned deps (`pyproject.toml`, uv/pip)
  3. Scratch `EMBERLENS_DB`; load synthetic fixtures; run pytest; run calendar; export
  4. Compare checksums of derived CSV vs recorded baseline (`testcase/backend/expected/` — to be committed when baseline exists)
- **Expected:** identical outputs modulo timestamps; documented procedure works without the live locked DB.
- **Status:** Not executed (pending baseline freeze)

## BE-TC-156 — Dependency hygiene and licences
- **Type / Priority:** NonFunctional / P2 · **Refs:** DEFINITION_OF_DONE §1
- **Steps:** `pip check` / `uv pip check`; list deps vs manifest (fastapi, duckdb, polars, shapely, httpx, uvicorn, pytest, ruff); check for unused (`polars` imported? `httpx` used?); licences compatible; no `*` pins in production path (pyproject pins exact for fastapi/duckdb/…? mixed with >= for pydantic — review)
- **Expected:** `pip check` clean; every dependency justified; lockfile committed if available; no transitive secrets.
- **Status:** Not executed
