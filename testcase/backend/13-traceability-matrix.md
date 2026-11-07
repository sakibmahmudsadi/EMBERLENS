# 13 — Requirements traceability matrix (backend)

> Scope note (2026-11-07, ADR-012): active dataset is Bangladesh national bbox (`bangladesh-bd`), Standard `MODIS_SP` + `VIIRS_SNPP_SP`, window 2010-01-01 → 2026-07-31 (199 bins). `/calendar` cap is 240 months. Historical 24-month/Sundarbans defects remain recorded for audit. Current backend suite: 70 passing tests. The API on port 8000 is stale relative to current source; current code is verified separately in the isolated container.

Legend: ✅ covered by ≥1 case · ⚠️ partial / gap · ➖ not implemented by design (P1/P2 or deferred) — no case required for release evidence, listed for completeness.

## PRD §8 functional requirements

| Req | Text (abbreviated) | Cases | Coverage |
|---|---|---:|---|
| FR-01 | Ingest MODIS/VIIRS FIRMS products | BE-TC-006, 071–085, 145–148 | ✅ |
| FR-02 | Validate fields/coords/timestamps/duplicates | BE-TC-025, 081, 101–110 | ✅ |
| FR-03 | Preserve native attrs/confidence semantics | BE-TC-030, 031, 086–100 | ✅ |
| FR-04 | Query detections by AOI/period/sensor/platform | BE-TC-021–035, 011–020 | ⚠️ `aoi_id` ignored (D-22) |
| FR-05 | Report product coverage and data gaps | BE-TC-016–020, 045–050 | ✅ FIRMS source-date evidence and missing-day months are exposed with limits; not AOI observation opportunity |
| FR-06 | Burning-activity calendar | BE-TC-036–052 | ✅ window cap fixed (D-02 → 240 mo; national 24/199-bin regression tests pass) |
| FR-07 | Sensor/platform-separated counts, no merged total | BE-TC-037, 048, 136–139 | ✅ |
| FR-08 | Source-linked observation inspection | BE-TC-031, 032, 067 | ✅ |
| FR-09 | Export filtered observations + calendar | BE-TC-053–070 | ⚠️ D-06/D-08/D-09 fixed; D-10 still open |
| FR-10 | Historical seasonality/trend (P1) | — | ➖ not implemented |
| FR-11 | Baseline/anomaly (P1) | — | ➖ not implemented (correct for prototype) |
| FR-12 | Hotspot grouping (P1) | — | ➖ not implemented (intentionally disabled) |
| FR-13 | Experimental outlook (P2) | — | ➖ not implemented; must stay out |

## API_SPECIFICATION §2 endpoints

| Endpoint | Priority | Cases | Coverage |
|---|---:|---:|---|
| GET /api/v1/health | P0 | BE-TC-001, 002, 008 | ✅ |
| GET /api/v1/data-sources | P0 | BE-TC-003–010 | ✅ |
| GET /api/v1/aois | P0 | BE-TC-011–015 | ✅ |
| POST /api/v1/aois/validate | P2 | — | ➖ not implemented |
| GET /api/v1/coverage | P0 | BE-TC-016–020 | ✅ date/sensor/platform/product filters; `aoi_id` is context only and note explains evidence is global |
| GET /api/v1/observations | P0 | BE-TC-021–030, 034, 035 | ⚠️ aoi_id ignored (D-22) |
| GET /api/v1/observations/{id} | P0 | BE-TC-031–033 | ✅ |
| GET /api/v1/calendar | P0 | BE-TC-036–052 | ✅ D-02/03/04/05 fixed and tested; D-23 closed (read-only GET; standalone export recomputation) |
| GET /api/v1/seasonality | P1 | — | ➖ not implemented |
| GET /api/v1/baselines | P1 | — | ➖ not implemented |
| GET /api/v1/anomalies | P1 | — | ➖ not implemented |
| GET /api/v1/hotspot-groups | P1 | — | ➖ not implemented |
| POST /api/v1/exports | P0 | BE-TC-053–070 | ✅⚠️ see exports defects |
| GET /api/v1/exports/{id}[...] | P2 | — | ➖ not implemented (correct: no async job need yet) |

## DATA_PIPELINE / VALIDATION_PLAN gates

| Gate | Cases | Coverage |
|---|---:|---|
| PIPE §6 file/schema checks | BE-TC-071, 078, 079, 083 | ⚠️ national VIIRS SP files pending; local loader now maps bright_ti4/ti5 and satellite N (D-26 fix) |
| PIPE §6 row checks (coords/time/confidence/dups) | BE-TC-082, 088, 101–110 | ✅ (D-14, D-16 open) |
| PIPE §5 idempotency/atomicity | BE-TC-071–077, 148 | ⚠️ D-11 open; D-12/D-13 fixed (map-before-write; per-snapshot observation_id) |
| VAL §3 source-fidelity | BE-TC-007, 147 | ⚠️ not run on real files |
| VAL §4 provenance chain | BE-TC-031, 136, 140 | ✅ D-03/D-12 fixed; automated tests cover per-month and filtered lineage |
| VAL §5 harmonization | BE-TC-086–100 | ✅ (D-14/16 open) |
| VAL §6 calendar correctness | BE-TC-036–052 | ✅ D-02/D-04/D-05/D-23 fixed and tested |
| VAL §10 API/export validation | BE-TC-001–070 | ⚠️ defects listed |
| VAL §12 reproducibility | BE-TC-146–156 | ⚠️ not run; baseline not frozen |
| VAL §13 release gate (competition demo) | this file + `14-defects-and-risks.md` | ⛔ currently failing (see blocking defects) |

## Coverage summary

- 156 designed cases (BE-TC-001…BE-TC-156).
- Manual pre-fix cases executed 2026-11-06 remain historical evidence. Current automated suite: 70 passed on 2026-11-07. National data counts and source validation are in `DATA_SOURCE_REGISTER.md` §11 and `docs/SOURCE_DATA_COVERAGE_REPORT.md`.
- Fully covered areas: validation semantics, harmonization invariants, security hygiene items present in code.
- Known uncovered-by-design (explicitly out of scope): frontend, ingestion scripts (`scripts/ingest.py`, `scripts/load_national_data.py`, legacy `scripts/load_demo_data.py`), `/seasonality` & friends, rate limiting (absent — cannot test what does not exist; specified as D-32), deployment.
