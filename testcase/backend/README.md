# EMBERLENS — Backend Test Cases

**Role:** Senior software quality tester (backend scope only)
**Application under test:** EMBERLENS backend — FastAPI + DuckDB modular monolith at `W:\Pipeline\Nasa Space App Challenge\backend`
**Reference specification:** `../../docs/*.md` (API_SPECIFICATION, DATA_DICTIONARY, DATA_PIPELINE, SCIENTIFIC_METHODOLOGY, VALIDATION_PLAN, DEFINITION_OF_DONE, CLAUDE.md)
**Date authored:** 2026-11-06
**Status of this suite (2026-11-09):** The current automated backend suite has **73 passing tests** on synthetic fixtures, isolated from the live national DB (`:memory:` by default). Manual cases below retain their historical evidence; cases marked retired describe the pre-national prototype and must not be run as written.

---

## 1. Scope

**In scope (backend only)**

| Area | Path | Notes |
|---|---|---|
| FastAPI app factory / CORS / startup | `backend/app.py`, `backend/config.py` | Env settings `FRONTEND_ORIGIN`, `DATA_ROOT`, `EMBERLENS_DB` |
| HTTP API | `backend/api/routes.py` | `/api/v1/health`, `/data-sources`, `/aois`, `/coverage`, `/observations`, `/observations/{id}`, `/calendar`, `/exports`, plus `/map-density`, `/hotspot-groups` (current source) |
| Database / schema / repositories | `backend/db/database.py` | DuckDB schema, indexes, `point_in_polygon`, query builders |
| Canonical mapping / fingerprinting | `backend/harmonization/mapping.py` | FIRMS → canonical v1 |
| Input validation | `backend/validation/checks.py` | Coordinates, dates, duplicates |
| Calendar aggregation | `backend/calendar_agg/` | UTC month bins, coverage status, count unit |
| Export + metadata manifest | `backend/exports/exporter.py` | CSV / JSON / GeoJSON + manifest |
| Loader seam | `backend/local_loader.py` | Local-CSV ingestion used to seed the national DB |

**Out of scope:** frontend/UI, infrastructure (Docker archived under `archive/future-cloud-deployment/docker/`; native launch is `.\start_emberlens.ps1`), NASA FIRMS network acquisition (`scripts/ingest.py`), deployment, load/soak testing at production scale.

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
- Status: `Not executed` | `Code-review fail — see D-xx` | `Blocked` | `Retired (pre-2026-11-09 scope)`
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
| ENV-3 | National data (read-only / separate DB) | `scripts/load_national_data.py --db data/processed/bangladesh-bd.duckdb` after `scripts/ingest.py --download`; real files `data/raw/*_bangladesh-bd.csv` and manifests in `data/processed/manifests/`. The sole active DB is `backend/emberlens-bangladesh.duckdb`; never write to it during test runs. |
| ENV-4 | Reproducibility | Clean venv + frozen snapshot; checksum comparison |

**Synthetic fixtures (hand-checkable, NOT NASA DATA):**
- MODIS: Jan 2, Feb 2 (incl. 2024-02-29 leap day), Mar 0 → files `modis_synthetic.csv`
- VIIRS: Jan 0, Feb 3, Mar 1 → `viirs_synthetic.csv`
- Duplicates: 3 rows, 1 exact duplicate → `duplicates_synthetic.csv`

**Real snapshot (provenance-relevant):**
- **Active scope (ADR-012, user decision 2026-11-06):** AOI `bangladesh-bd`, national bounding box `88.0,20.5,92.7,26.7` (EPSG:4326), task-specified and labelled not an official boundary (over-includes border-adjacent India/Myanmar).
- Window frozen to **2010-01-01 .. 2026-07-31** (199 bins), the common Standard Product availability ceiling checked 2026-11-06 (`MODIS_SP` → 2026-08-31; `VIIRS_SNPP_SP` → 2026-07-31; MODIS-only Aug 2026 excluded). Products: `MODIS_SP` (Collection 6.1) and `VIIRS_SNPP_SP` (VNP14IMGTDL_SP 375 m) Standard only — no NRT.
- `scripts/ingest.py --download` fetches 5-day Area-API chunks into `data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` and `data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv`; atomic write, manifests + SHA-256 in `data/processed/manifests/`.
- `scripts/load_national_data.py` loads into the national DB (`backend/emberlens-bangladesh.duckdb`).
- **Download completion/row counts must be read from manifests; do not infer.** See `DATA_SOURCE_REGISTER.md` §11: MODIS_SP 147,536 rows / VIIRS_SNPP_SP 520,949 rows / total 668,485. The Sundarbans 2024–2025 prototype (2,053 rows) was retired and its DB/files removed on 2026-11-09 (see `docs/REPOSITORY_CLEANUP.md`); the Sundarbans area is inside `bangladesh-bd` and covered by the national snapshot.
- Historic 2024–2025 Sundarbans snapshot details (MODIS 76 rows, VIIRS 1,977 rows, `satellite="N"`, confidence ∈ {`l`,`n`,`h`}, version `2`) are retained in git history for traceability and are not the national scope.

## 5. Preconditions / how to run

Automated baseline already in repo:

```powershell
cd "W:\Pipeline\Nasa Space App Challenge\backend"
# Tests default to an in-memory DB (:memory:); no scratch EMBERLENS_DB is needed.
.venv\Scripts\python -m pytest -q
```

Observed on 2026-11-09: **73 passed** (1 Starlette/httpx deprecation warning). Ruff passes (`ruff check .`). All automated tests use synthetic fixtures; they do not re-ingest the live NASA files or exercise the production DB. Source-file reconciliation remains covered by the stored validation reports/manifests, not by these synthetic tests.

Manual/API execution: start the app natively (`.\start_emberlens.ps1`, or `uvicorn backend.app:app`) and issue the exact requests shown in each case; compare against expected. ENV-3 checks must use a **copy** of `backend/emberlens-bangladesh.duckdb` or be strictly read-only.

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

- `backend/tests/` — **73 tests passed on 2026-11-09** on synthetic fixtures (Step 1/2 verification). The production listener on port 8000 must be restarted from current source before use as evidence (it is not auto-reloaded).
- The national Bangladesh snapshot is loaded and validated: MODIS_SP 147,536 rows and VIIRS_SNPP_SP 520,949 rows, with manifests and the national DB. See `DATA_SOURCE_REGISTER.md` §11 and `docs/SOURCE_DATA_COVERAGE_REPORT.md`; this test suite does not replace that data validation.
- Several designed cases were **executed** against scratch databases on 2026-11-06 (pre-fix evidence): BE-TC-038/057/058/061/075/076 FAILs (D-02/D-09/D-08/D-06/D-13/D-12), BE-TC-103 PASS, BE-TC-149 FAIL (default path, D-20). The 2026-11-06 fix pass closed the listed defects. D-03, D-04, D-05, D-23 are closed with automated coverage; D-20 remains an operational risk (stale API holds the DB lock — use `.\stop_emberlens.ps1` / `.\start_emberlens.ps1`).
- BE-TC-136 (Sundarbans 2024-02 traceability) is **retired** — it asserted the pre-national snapshot (`3bf8ad84…3653`) and must not be run as written. BE-TC-011's Sundarbans bbox assertion and BE-TC-035's `sundarbans-bd` example were updated/retired in Step 3; their underlying logic (GeoJSON order, `aoi_id` no-op) is unchanged.

## 8. Definition of pass

A case passes only when the observed behaviour matches **Expected result** exactly, including HTTP status, error `code`, and envelope shape. For Science cases, an output that is numerically right but scientifically mislabelled (e.g. "0 detections" without the coverage disclaimer, or a merged MODIS+VIIRS count) fails.

## 9. Reporting defects

Log with: BE-TC id, observed vs expected, request/response (secrets redacted), snapshot id + sha256 + method_version, and the `D-xx` candidate it maps to. Attach the failing run's `ingestion_run_id` when relevant. Do not paste MAP_KEY values anywhere.
