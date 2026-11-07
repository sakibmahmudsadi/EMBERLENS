# 04 — Calendar API and aggregation

Endpoint: `GET /api/v1/calendar` · Service: `calendar_agg/aggregation.py`

Hand-checkable seeded expectations (synthetic fixtures):
`MODIS Terra` Jan=2, Feb=1 (Terra), `MODIS Aqua` Feb=1, `VIIRS S-NPP` Jan=0 / Feb=3 / Mar=1.

---

## BE-TC-036 — Happy path: 3-month window returns both sensors' series
- **Type / Priority:** Functional / P0 · **Refs:** FR-06, FR-07; API §4; VAL §6
- **Pre:** ENV-2 seeded
- **Steps:** `GET /api/v1/calendar?aoi_id=demo-aoi&start=2024-01-01&end=2024-04-01`
- **Expected:** 200; `time_bin="month"`; `count_unit=source_observation_rows_after_exact_deduplication_within_product_snapshot`; `spatial_rule=point_in_polygon_boundary_included`; `confidence_filter=null`; `method_version=calendar-v0`; `time_zone=UTC`; `series` grouped by (sensor, platform, product_id); values sorted by `period_start`; MODIS and VIIRS appear as **separate** series; `limitations` present and mention sensor non-equivalence and "coverage unknown".
- **Automation:** Auto: `tests/test_api.py::test_calendar` · **Status:** Not executed here

## BE-TC-037 — Sensor-specific counts match hand-checked fixture
- **Type / Priority:** DataIntegrity / P0 · **Refs:** VAL §6; FR-06
- **Steps:** as BE-TC-036; then
  - MODIS Terra 2024-01 = 2; MODIS Terra 2024-02 = 1; MODIS Aqua 2024-02 = 1; MODIS 2024-03 = 0
  - VIIRS 2024-02 = 3; VIIRS 2024-03 = 1; VIIRS 2024-01 = 0
- **Expected:** exact integer match; no merged count column exists anywhere in the payload.
- **Automation:** Auto: `tests/test_calendar.py::test_calendar_counts_and_statuses` · **Status:** Not executed here

## BE-TC-038 — Month-bin cap accepts the national Bangladesh window
- **Type / Priority:** Boundary / P0 · **Refs:** ADR-012 (national scope, 240-month cap); API §2, §3; D-02
- **Steps:**
  1. `GET /api/v1/calendar?aoi_id=demo-aoi&start=2024-01-01&end=2026-01-01` (24 bins)
  2. same with `start=2024-01-01&end=2026-01-01T00:00:00Z`
  3. `GET /api/v1/calendar?aoi_id=demo-aoi&start=2010-01-01&end=2026-08-01` (199 bins; national Standard-Product window)
  4. `start=2006-02-01&end=2026-04-01` (>240 bins)
- **Expected (current contract):** steps 1–3 → 200; step 4 → 422 `WINDOW_TOO_LARGE` (240-month cap).
- **Executed 2026-11-06:** pre-fix **FAIL** (steps 1–2 returned 422 `WINDOW_TOO_LARGE`); after month_bins count + 240-month cap, steps 3–4 targeted tests **PASS** (`test_calendar_national_window_accepted`, `test_calendar_window_too_large`); full suite 39 passed on scratch DB.
- **Historical (D-02):** the original `month_span = (end.year-start.year)*12 + (end.month-start.month) + 1` double-counted the exclusive end and rejected the canonical 24-month window; fixed by counting real `[start,end)` month bins.

## BE-TC-039 — Window just above the 240-month cap is rejected
- **Type / Priority:** Boundary / P0 · **Refs:** ADR-012; API §2
- **Steps:** `start=2006-02-01&end=2026-04-01` (242 bins); `start=2006-03-01&end=2026-04-01` (241 bins); control `start=2010-01-01&end=2026-08-01` (199 bins)
- **Expected:** first two → 422 `WINDOW_TOO_LARGE` (240-month cap); control → 200; no partial computation.
- **Automation:** Auto: `tests/test_api.py::test_calendar_window_too_large` (242-bin case) · **Status:** PASS on scratch DB 2026-11-06

## BE-TC-040 — Missing / invalid / reversed range → 422 INVALID_DATE_RANGE
- **Type / Priority:** Negative / P0 · **Refs:** API §9
- **Steps:** omit `start`; omit `end`; `start=foo`; `start=2024-03-01&end=2024-02-01`; `start=2024-03-01&end=2024-03-01`
- **Expected:** 422 `INVALID_DATE_RANGE`; `end <= start` never reaches the aggregator.
- **Status:** Not executed (reversed case covered by observations tests)

## BE-TC-041 — Month bins are UTC, start-inclusive / end-exclusive, leap-aware
- **Type / Priority:** Boundary / P0 · **Refs:** METH §7.1; VAL §6; DATA_DICT §2
- **Steps:** unit-check `month_bins(2024-01-15, 2024-03-02)`; `month_bins(2024-02-01, 2024-03-01)`; `month_bins(2023-12-15, 2024-03-01)`
- **Expected:** bins are `[Feb 1, Mar 1)` style, UTC tz-aware; 2024-02 has 29 days; `[start, end)` semantics — an observation acquired exactly at `end` belongs to the next window, never to this one; a bin with `period_start` at month start and `period_end` at next month start.
- **Automation:** Auto: `tests/test_calendar.py::test_month_bins_leap_february`, `test_month_boundary_start_inclusive_end_exclusive` · **Status:** Not executed here

## BE-TC-042 — Boundary observation at month end is counted in the correct bin
- **Type / Priority:** Boundary / P0 · **Refs:** METH §7.1; VAL §6
- **Steps:** seed one MODIS obs at `2024-02-29T23:59:00Z` and one at `2024-03-01T00:00:00Z`; query Feb window and Mar window
- **Expected:** Feb bin = 1, Mar bin = 1; no double counting; UTC only.
- **Status:** Not executed (fixture present in synthetic MODIS CSV: 2024-02-29T12:00)

## BE-TC-043 — AOI boundary points are included (point-in-polygon, boundary incl.)
- **Type / Priority:** Boundary / P0 · **Refs:** METH §9; DATA_DICT §2 (`spatial_rule`); VAL §6
- **Steps:** assert `point_in_polygon` for the four corners and one edge midpoint of `box(89,21,91,23)`; one point 0.001° outside each edge
- **Expected:** boundary points True; exterior False.
- **Automation:** Auto: `tests/test_calendar.py::test_boundary_point_included` · **Status:** Not executed here

## BE-TC-044 — Antimeridian / out-of-range coordinates cannot reach aggregation
- **Type / Priority:** Boundary / P1 · **Refs:** PIPE §6; ARCHITECTURE §6
- **Steps:** attempt ingest of obs with lon `180.0001`, lat `-90.0001` (rejected at validation); lon `180` and `-180` accepted and assigned by Shapely `covers` without error; fixture with `lon=180, lat=0` inside a polygon crossing the antimeridian
- **Expected:** invalid rejected fail-closed; extremes accepted; antimeridian handled or explicitly documented as unsupported with a clear error — never silently mis-assigned.
- **Status:** Not executed

## BE-TC-045 — Empty bin status is `no_records_returned_coverage_unverified`, never "zero fires"
- **Type / Priority:** Science / P0 · **Refs:** METH §7.3; API §4, §5; VAL §6, §13; DATA_DICT §2
- **Steps:** window with a month containing no rows; inspect every empty cell in every series
- **Expected:** `coverage_status = no_records_returned_coverage_unverified` (or a gap/unavailable variant from availability evidence); **never** `zero_detections_with_valid_observation_coverage` without independent evidence; response contains a limitation string saying coverage is unknown.
- **Automation:** Auto: `tests/test_calendar.py::test_calendar_counts_and_statuses` (empty case), `tests/test_api.py::test_calendar` · **Status:** Not executed here

## BE-TC-046 — Source availability cannot claim verified zero detections
- **Type / Priority:** Science / P0 · **Refs:** METH §7.3; DATA_DICT §2
- **Steps:** seed availability row `check_result=available` for 2024-03; seed zero observations in that AOI/month; request calendar
- **Expected:** status stays `no_records_returned_coverage_unverified` or becomes `coverage_unknown` per implementation of the availability path — **never** upgraded to "verified zero" from source-service availability alone.
- **Actual:** FIRMS missing-day records are passed to calendar aggregation and mark the affected month `partial_source_data`; a broad `available` source-service interval leaves an empty AOI-month `no_records_returned_coverage_unverified`. Source-service availability never proves valid observation opportunity.
- **Automation:** `tests/test_api.py::test_calendar_source_available_interval_does_not_prove_zero_detections`, `tests/test_api.py::test_calendar_marks_firms_missing_day_as_partial_source_data` · **Status:** Automated pass

## BE-TC-047 — Availability rows produce gap/unavailable statuses (unit level)
- **Type / Priority:** Functional / P1 · **Refs:** METH §7.3
- **Steps:** unit-test `resolve_coverage_status` and `aggregate_calendar(..., availability={(product, platform, "2024-03-01"): "missing"})`
- **Expected:** `missing → source_data_gap`; `unavailable → product_unavailable`; `partial → partial_source_data`; `unknown → coverage_unknown`; `available` + count 0 → `no_records_returned_coverage_unverified`.
- **Automation:** Auto: `tests/test_calendar.py::test_coverage_status_logic` · **Status:** Not executed here

## BE-TC-048 — Counts are never summed across sensors
- **Type / Priority:** Science / P0 · **Refs:** METH §4, §8; PRD §5 (P0); VAL §13; D-03/D-18 adjacency
- **Steps:** inspect full JSON; regex for any field equal to MODIS+VIIRS combined; check `count_unit`; check `series` count matches distinct (sensor,platform,product) in fixture (4: Terra, Aqua, S-NPP)
- **Expected:** no combined sensor value or file-level platform aggregate (for example, a combined Terra+Aqua input is represented by its native Terra and Aqua row series); no `harmonized_fire_count`; series individually addressable; empty series never merged.
- **Automation:** `tests/test_calendar.py::test_calendar_counts_and_statuses`, `tests/test_api.py::test_combined_modis_snapshot_does_not_create_a_false_combined_calendar_series` · **Status:** Automated pass

## BE-TC-049 — Registered series with no matching observations remain visible
- **Type / Priority:** Science / P1 · **Refs:** METH §7.3; VAL §6; D-05
- **Steps:** Register a source snapshot for a sensor/platform/product whose requested window overlaps the query but whose snapshot has no matching observation rows; request the calendar with that product filter.
- **Expected (spec):** a series (or explicit gap entries) is emitted so the UI can show "source data gap" for a month with no rows; absence must be visible, not silently missing from the response.
- **Actual:** Calendar series keys include registered source snapshots that overlap the query, while malformed/incomplete snapshot identities are excluded. Empty bins are zero-count rows with an unverified status and no fabricated contributing snapshot IDs.
- **Automation:** `tests/test_api.py::test_calendar_includes_registered_series_with_no_matching_observations` · **Status:** Automated pass

## BE-TC-050 — Calendar GET is read-only and export is standalone
- **Type / Priority:** NonFunctional / P1 · **Refs:** API §2; ARCHITECTURE §9, §11; D-23
- **Steps:** GET twice; count `calendar_aggregate` rows; compare `generated_at_utc`
- **Expected (spec, REST):** read endpoints are safe; derived rows either pre-computed by a write path or replaced deterministically without duplicates.
- **Actual:** GET computes response rows without writing `calendar_aggregate`; the calendar export recomputes the same rows directly and works without a prior GET. Automated tests assert both properties.
- **Automation:** `tests/test_api.py::test_calendar_get_does_not_write_derived_rows`, `tests/test_api.py::test_unfiltered_calendar_export_is_standalone` · **Status:** Automated pass; D-23 closed

## BE-TC-051 — Provenance lists only contributing snapshots
- **Type / Priority:** DataIntegrity / P1 · **Refs:** METH §14; API §4; VAL §3; D-03
- **Pre:** ENV-2: two snapshots loaded; window excludes one (e.g. only VIIRS in range)
- **Steps:** request calendar for a window where only one snapshot contributes; inspect `provenance.source_snapshot_ids`
- **Expected (spec):** only snapshot ids whose rows appear in the returned bins (plus, if declared, availability references).
- **Actual:** Calendar value and response provenance are derived from snapshots attached to returned observation rows; the API suite checks monthly and sensor-filtered provenance.
- **Automation:** `tests/test_api.py::test_calendar`, `tests/test_api.py::test_calendar_honors_sensor_filter` · **Status:** Automated pass

## BE-TC-052 — Calendar response contains no placeholder zeros as "data"
- **Type / Priority:** Science / P0 · **Refs:** API §4 ("Do not use zero as a placeholder"); README §1
- **Steps:** empty-DB case (no snapshots at all); request calendar
- **Expected (spec):** either 404/422 "no configured data" or `series: []` with explicit `limitations`/`coverage_status` disclaimers — never fabricated zeros with `records_present`.
- **Actual (code review):** with zero observations, `series` is empty list — acceptable, but consumers expecting an array-per-sensor get silence rather than an explicit "no source records; coverage unknown" statement; add a `status`/`message` or documented empty-state.
- **Status:** Not executed; partially satisfied by code

