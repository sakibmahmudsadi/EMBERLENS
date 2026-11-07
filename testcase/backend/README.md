# EMBERLENS — Backend Test Cases

**Role:** Senior software quality tester (backend scope only)
**Application under test:** EMBERLENS backend — FastAPI + DuckDB modular monolith at `W:\Pipeline\Nasa Space App Challenge\backend`
**Reference specification:** `../../Info/docs/*.md` (API_SPECIFICATION, DATA_DICTIONARY, DATA_PIPELINE, SCIENTIFIC_METHODOLOGY, VALIDATION_PLAN, DEFINITION_OF_DONE, CLAUDE.md)
**Date authored:** 2026-11-06
**Status of this suite (2026-11-07):** The current automated backend suite has **63 passing tests** on synthetic fixtures, isolated from the live national DB. Nine manual cases were executed against scratch databases on 2026-11-06 and retain their historical pre-fix findings below. Designed cases without a current automation/execution reference remain pending; see §7 and `14-defects-and-risks.md`.

---

## 1. Scope

**In scope (backend only)**

| Area | Path | Notes |
|---|---|---|
| FastAPI app factory / CORS / startup | `backend/app.py`, `backend/config.py` | Env settings `FRONTEND_ORIGIN`, `DATA_ROOT`, `EMBERLENS_DB` |
| HTTP API | `backend/api/routes.py` | `/api/v1/health`, `/data-sources`, `/aois`, `/coverage`, `/observations`, `/observations/{id}`, `/calendar`, `/exports` |
| Database / schema / repositories | `backend/db/database.py` | DuckDB schema, indexes, `point_in_polygon`, query builders |
| Canonical mapping / fingerprinting | `backend/harmonization/mapping.py` | FIRMS → canonical v1 |
| Input validation | `backend/validation/checks.py` | Coordinates, dates, duplicates |
| Calendar aggregation | `backend/calendar_agg/` | UTC month bins, coverage status, count unit |
| Export + metadata manifest | `backend/exports/exporter.py` | CSV / JSON / GeoJSON + manifest |
| Loader seam | `backend/local_loader.py` | Local-CSV ingestion used to seed the demo DB |

**Out of scope:** frontend/UI, infrastructure, Docker, NASA FIRMS network acquisition (`scripts/ingest.py`), the `ingestion/` package (owned by another agent, currently `.gitkeep` only), deployment, load/soak testing at production scale.

## 2. Why this matters right now

The backend is the scientific core of the challenge submission. Its job is to turn NASA FIRMS rows into a sensor-aware, provenance-preserving monthly burning-activity calendar. The controlling risk is not "HTTP 200" — it is **a number that is wrong but looks authoritative**. Test cases therefore emphasise:

1. Sensor separation — MODIS and VIIRS are never summed or equated.
2. Coverage honesty — "no source records returned; observation coverage unknown" ≠ "zero fires".
3. Provenance — every value traceable to snapshot, fingerprint, method version.
4. Reproducibility — same snapshot + method version ⇒ same output.

## 3. Conventions

- ID: `BE-TC-NNN`, grouped by file (see §6).
- Type: `Functional` | `Negative` | `Boundary` | `Security` | `DataIntegrity` | `Science` | `Regression` | `NonFunctional`
- Priority: `P0` (blocks a credible submission) | `P1` (should fix before demo) | `P2` (hardening)
- Automation: `Auto: path::test` (exists today) | `Not automated` | `Partial: …`
- Status: `Not executed` | `Code-review fail — see D-xx` | `Blocked`
- Requirement refs: `FR-xx` (PRD §8), `API §n` (API_SPECIFICATION), `PIPE §n` (DATA_PIPELINE), `METH §n` (SCIENTIFIC_METHODOLOGY), `VAL §n` (VALIDATION_PLAN).

Severity/priority definitions:
- **P0** — wrong scientific result, silent data loss, secret/path leak, or crash on a documented happy path.
- **P1** — contract violation, misleading manifest/provenance, missing validation, or untestable determinism.
- **P2** — polish, hygiene, defence in depth.

## 4. Test environments and data

| ID | Name | How |
|---|---|---|
| ENV-1 | Unit (in-memory) | `init_db(":memory:")`, synthetic fixtures in `backend/tests/fixtures/SYNTHETIC_NOT_NASA_DATA/` — **never real NASA data** |
| ENV-2 | Integration (TestClient) | `fastapi.testclient.TestClient` against synthetic-seeded in-memory DB (see `backend/tests/conftest.py`) |
| ENV-3 | National data (read-only / separate DB) | `scripts/load_national_data.py --db data/processed/bangladesh-bd.duckdb` after `scripts/ingest.py --download`; real files `data/raw/*_bangladesh-bd.csv` (counts pending — read manifests). Legacy `backend/emberlens.duckdb` is locked and must not be written during test runs. |
| ENV-4 | Reproducibility | Clean venv + frozen snapshot; checksum comparison |

**Synthetic fixtures (hand-checkable, NOT NASA DATA):**
- MODIS: Jan 2, Feb 2 (incl. 2024-02-29 leap day), Mar 0 → files `modis_synthetic.csv`
- VIIRS: Jan 0, Feb 3, Mar 1 → `viirs_synthetic.csv`
- Duplicates: 3 rows, 1 exact duplicate → `duplicates_synthetic.csv`

**Real snapshot (provenance-relevant):**
- **Active scope superseded (ADR-012, user decision 2026-11-06):** AOI `bangladesh-bd`, national bounding box `88.0,20.5,92.7,26.7` (EPSG:4326), task-specified and labelled not an official boundary (over-includes border-adjacent India/Myanmar).
- Window frozen to **2010-01-01 .. 2026-07-31** (199 bins), the common Standard Product availability ceiling checked 2026-11-06 (`MODIS_SP` → 2026-08-31; `VIIRS_SNPP_SP` → 2026-07-31; MODIS-only Aug 2026 excluded). Products: `MODIS_SP` (Collection 6.1) and `VIIRS_SNPP_SP` (VNP14IMGTDL_SP 375 m) Standard only — no NRT.
- `scripts/ingest.py --download` fetches 5-day Area-API chunks into `data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` and `data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv`; atomic write, manifests + SHA-256 in `data/processed/manifests/`.
- `scripts/load_national_data.py` loads into a separate default DB (`backend/emberlens-bangladesh.duckdb`); it does **not** mutate the locked/legacy `backend/emberlens.duckdb`.
- **Download completion/row counts must be read from manifests; do not infer.** Historical Sundarbans 2024–2025 snapshots remain archived under `data/raw/_archive_2024-2025/` and in prior manifests; they are not the national scope.
- Prior Sundarbans verification (2026-11-06): MODIS 76 rows `a925ad06…4084e`; VIIRS 1,977 rows `3bf8ad84…3653`; VIIRS `satellite="N"` (now mapped to Suomi-NPP), confidence ∈ {`l`,`n`,`h`}, version `2`; VIIRS SP layout reconciled (D-26 fix).

## 5. Preconditions / how to run

Automated baseline already in repo:

```powershell
cd "W:\Pipeline\Nasa Space App Challenge\backend"
# NOTE: a plain run of pytest fails on this machine because backend/emberlens.duckdb
# is locked by a running process (PID 14692 at the time of writing) — see D-20.
# Use a scratch DB path instead:
$env:EMBERLENS_DB = "$env:TEMP\opencode\emberlens-test-run.duckdb"
.venv\Scripts\python -m pytest -q -p no:cacheprovider
```

Observed on 2026-11-07: **70 passed** (run in the pinned production container environment against the current source tree). Ruff passes for the changed app, route, aggregation, configuration, and test files. All automated tests use synthetic fixtures; they do not re-ingest the live NASA files or exercise the production DB. Source-file reconciliation remains covered by the stored validation reports/manifests, not by these synthetic tests.

Manual/API execution: start the app (`uvicorn backend.app:app`) and issue the exact requests shown in each case; compare against expected. ENV-3 checks must use a **copy** of `emberlens.duckdb` or be strictly read-only.

## 6. Suite index

| File | Cases | Focus |
|---|---|---|
| `01-health-and-data-sources.md` | BE-TC-001…010 | Health, data-sources, provenance leakage, empty DB |
| `02-aois-and-coverage.md` | BE-TC-011…020 | AOI listing, GeoJSON order, coverage/availability semantics |
| `03-observations-api.md` | BE-TC-021…035 | Filtering, pagination, date validation, injection, detail |
| `04-calendar-api.md` | BE-TC-036…052 | Window limits, bins, coverage status, sensor separation, leap/boundary |
| `05-exports.md` | BE-TC-053…070 | Formats, manifest completeness, empty results, GeoJSON crashes |
| `06-ingestion-local-loader.md` | BE-TC-071…085 | Idempotency, dedup, atomicity, partial failure, file edge cases |
| `07-harmonization-mapping.md` | BE-TC-086…100 | Sensor vocab, platform aliases, confidence, fingerprints, acq_time |
| `08-validation.md` | BE-TC-101…110 | Coordinate/date checks, duplicate detection |
| `09-database-and-schema.md` | BE-TC-111…124 | Schema, constraints, indexes, query semantics, DuckDB behaviour |
| `10-security-and-error-contract.md` | BE-TC-125…135 | Envelope, request IDs, secrets, paths, CORS, rate limits |
| `11-scientific-correctness.md` | BE-TC-136…145 | Sensor separation, honesty of zero-bins, coverage, lineage |
| `12-nonfunctional-reproducibility.md` | BE-TC-146…156 | Determinism, retry, WAL/locking, startup failure, observability |
| `13-traceability-matrix.md` | — | FR/API/PIPE/VAL → BE-TC mapping |
| `14-defects-and-risks.md` | D-01…D-33 | Defects/risks (executed vs code-review evidence), release gate |

## 7. Known baseline (honest status)

- `backend/tests/` — **70 tests passed on 2026-11-07** using containerized dependencies and synthetic fixtures. The production listener on port 8000 still holds the national DB and runs older code; do not use it as evidence for the current route contract.
- The national Bangladesh snapshot is loaded and validated: MODIS_SP 147,536 rows and VIIRS_SNPP_SP 520,949 rows, with manifests and a separate national DB. See `DATA_SOURCE_REGISTER.md` §11 and `docs/SOURCE_DATA_COVERAGE_REPORT.md`; this test suite does not replace that data validation.
- Several designed cases were **executed** against scratch databases on 2026-11-06 (pre-fix evidence):
  - BE-TC-038 **FAIL** — exactly-24-month range `[2024-01-01, 2026-01-01)` → 422 `WINDOW_TOO_LARGE` (D-02)
  - BE-TC-057 **FAIL** — calendar export as GeoJSON → HTTP 500 `Internal Server Error` (D-09)
  - BE-TC-058 **FAIL** — VIIRS-only Feb-2024 calendar export returned 72 unfiltered rows (D-08)
  - BE-TC-061 **FAIL** — zero-row CSV export → HTTP 200, empty body, manifest lost (D-06)
  - BE-TC-075 **FAIL** — load with invalid `acq_time` in final row → snapshot `row_count=4`, **zero** observations (D-13)
  - BE-TC-076 **FAIL** — identical content under two filenames → 4 observations total, expected 8 (D-12)
  - BE-TC-103 **PASS** — NaN/Infinity coordinates are rejected
  - BE-TC-149 **FAIL (default path)** — documented test/boot path broken by locked DB; scratch `EMBERLENS_DB` works
- Historical fix pass on 2026-11-06 closed the listed ingestion/export defects. Current scope and loaded rows are documented in the register and coverage report. D-03, D-04, and D-05 are closed with current automated coverage; snapshot-declared empty series are covered for a registered snapshot whose date interval overlaps the query. D-23 is also closed: calendar GET is read-only and calendar export computes independently. D-20 remains an operational risk.
- The API on port 8000 is stale relative to current source and needs a controlled cutover before the normal local URL is considered verified. The isolated container build serves current source and has been browser-checked; public hosting remains unconfigured.

## 8. Definition of pass

A case passes only when the observed behaviour matches **Expected result** exactly, including HTTP status, error `code`, and envelope shape. For Science cases, an output that is numerically right but scientifically mislabelled (e.g. "0 detections" without the coverage disclaimer, or a merged MODIS+VIIRS count) fails.

## 9. Reporting defects

Log with: BE-TC id, observed vs expected, request/response (secrets redacted), snapshot id + sha256 + method_version, and the `D-xx` candidate it maps to. Attach the failing run's `ingestion_run_id` when relevant. Do not paste MAP_KEY values anywhere.
