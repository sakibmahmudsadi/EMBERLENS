# 01 — Health, data sources and startup

All cases ENV-2 unless marked ENV-3/ENV-4. Paths relative to `backend/`.

---

## BE-TC-001 — Health endpoint returns liveness payload
- **Type / Priority:** Functional / P0 · **Refs:** API §2 (P0), FR-09 adjacency
- **Pre:** App created via `create_app()`; DB available (or scratch `EMBERLENS_DB`)
- **Steps:** `GET /api/v1/health`
- **Expected:** 200; JSON keys `status` = `ok`, `service` = `EMBERLENS`, `time` parseable ISO-8601 with timezone. No DB contents, file paths or secrets in body.
- **Automation:** Auto: `tests/test_api.py::test_health` · **Status:** Not executed in this suite

## BE-TC-002 — Health is not a readiness probe for a broken DB
- **Type / Priority:** NonFunctional / P1 · **Refs:** PIPE §11, API §2, D-20
- **Pre:** `EMBERLENS_DB` points at an unreachable/locked path (e.g. another `duckdb.connect()` holds it open)
- **Steps:** import `backend.app` / `create_app()`; then `GET /api/v1/health`
- **Expected (spec):** app should start or fail with a single, clear, non-secret diagnostic; `/health` should not claim `ok` while the DB is unusable, or should be explicitly defined as liveness-only.
- **Actual (code review):** `app.py` runs `startup_db()` at import/app creation and raises `duckdb.IOException` before any request can be served — the lock observed on 2026-11-06 (`emberlens.duckdb` held by C:\Python315\python.exe PID 14692) means `pytest` cannot even collect the suite. Either is unacceptable for an operable demo.
- **Status:** Code-review fail — D-20

## BE-TC-003 — data-sources returns both lists and the source-service caveat
- **Type / Priority:** Functional / P0 · **Refs:** API §2, §5; FR-05; METH §7.3
- **Pre:** ENV-2 seeded with MODIS+VIIRS synthetic snapshots
- **Steps:** `GET /api/v1/data-sources`
- **Expected:** 200; `snapshots` length 2; `availability` key present (list); `note` present and contains wording that date availability ≠ clear-sky/valid-pixel coverage. Snapshot objects include `source_snapshot_id`, `product_id`, `processing_level`, `collection_version`, `retrieved_at_utc`, `sha256`, `row_count`.
- **Automation:** Auto: `tests/test_api.py::test_data_sources` · **Status:** Not executed here

## BE-TC-004 — data-sources on empty DB is well-formed, not an error
- **Type / Priority:** Boundary / P1 · **Refs:** API §2, PIPE §11, VAL §10
- **Pre:** ENV-1/ENV-2 with no snapshots
- **Steps:** `GET /api/v1/data-sources`
- **Expected:** 200; `snapshots: []`, `availability: []`; `note` still present; no exception.
- **Status:** Not executed

## BE-TC-005 — data-sources must not leak absolute filesystem paths
- **Type / Priority:** Security / P0 · **Refs:** API §1 ("Do not expose internal filesystem paths"), §10; D-01
- **Pre:** ENV-2 after `load_csv(...)` of any file path outside the repo (e.g. `C:\Users\...\modis_synthetic.csv`)
- **Steps:** `GET /api/v1/data-sources`; inspect `snapshots[*].source_file_uri`
- **Expected (spec):** no absolute machine-specific path is returned to clients; either an opaque object key / repo-relative path or the field is omitted from the response while retained internally.
- **Actual:** the loader stores only a basename for new snapshots; the API also strips absolute paths from legacy rows before response serialization. Source endpoints redact both `/csv/<MAP_KEY>/` path segments and `MAP_KEY` query values.
- **Automation:** `tests/test_api.py::test_data_sources` injects an absolute legacy path and path/query tokens, then asserts the public response contains only a basename and `<MAP_KEY>` placeholders · **Status:** Automated pass; D-01 closed

## BE-TC-006 — data-sources must not expose ingestion run internals or secrets
- **Type / Priority:** Security / P1 · **Refs:** API §10; CLAUDE.md §5
- **Pre:** Snapshot inserted with `ingestion_run_id` set and `source_endpoint` containing a token-templated URL (if any)
- **Steps:** `GET /api/v1/data-sources`
- **Expected:** no credential material; `source_endpoint` contains no MAP_KEY/query tokens; internal host paths absent.
- **Automation:** `tests/test_api.py::test_data_sources` verifies path and query MAP_KEY redaction in snapshot source URLs · **Status:** Automated pass

## BE-TC-007 — Snapshot row counts and sha256 are reported, not invented
- **Type / Priority:** DataIntegrity / P0 · **Refs:** FR-01, FR-02; PIPE §4, §6; VAL §3
- **Pre:** ENV-3 read-only copy with real snapshots (or ENV-2 synthetic)
- **Steps:** `GET /api/v1/data-sources`; cross-check `row_count`, `sha256` against `data/processed/manifests/*.json` for the same source file
- **Expected:** values match the manifest exactly; any mismatch fails. No derived/estimated counts appear.
- **Status:** Not executed against real files

## BE-TC-008 — Content-Type and method semantics
- **Type / Priority:** Functional / P2 · **Refs:** API §2
- **Steps:** `POST /api/v1/health`; `PUT /api/v1/data-sources` (not allowed); `GET /api/v1/health` with `Accept: application/json`
- **Expected:** 405 for wrong method with a well-formed error envelope (see BE-TC-120); 200 for GET; `application/json` on API responses.
- **Status:** Not executed

## BE-TC-009 — Responses never carry `MAP_KEY`
- **Type / Priority:** Security / P0 · **Refs:** CLAUDE.md §5; API §10
- **Pre:** `NASA_FIRMS_MAP_KEY`/`MAP_KEY` set in environment; ingestion manifest exists with templated endpoint
- **Steps:** hit every GET endpoint; grep response bodies for the key value
- **Expected:** zero occurrences; env values never logged (no logging of env at import).
- **Status:** Not executed (requires a dummy key; do not use a real one)

## BE-TC-010 — OpenAPI schema renders and matches implemented routes only
- **Type / Priority:** Functional / P1 · **Refs:** API §2, DEFINITION_OF_DONE §4
- **Steps:** `GET /openapi.json`; enumerate paths; compare to API_SPECIFICATION §2
- **Expected:** schema 200/valid; paths exactly the implemented set (health, data-sources, aois, coverage, observations, observations/{id}, calendar, exports). Deferred endpoints (`/seasonality`, `/baselines`, `/anomalies`, `/hotspot-groups`, `POST /aois/validate`, async export endpoints) must be **absent**, not stubbed with fake data.
- **Status:** Not executed
