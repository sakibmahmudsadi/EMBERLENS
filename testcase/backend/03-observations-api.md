# 03 — Observations API (list, filter, pagination, detail)

Endpoints: `GET /api/v1/observations`, `GET /api/v1/observations/{observation_id}`

---

## BE-TC-021 — List returns data, pagination block and count-unit note
- **Type / Priority:** Functional / P0 · **Refs:** API §2, §6; FR-04
- **Pre:** ENV-2 seeded (ENV-3 for real reconciliation)
- **Steps:** `GET /api/v1/observations`
- **Expected:** 200; body keys `data` (array), `pagination` (`page`, `page_size`, `total`), `count_unit_note`. Defaults: page 1, page_size 100. Rows include `observation_id`, `acquired_at_utc`, `latitude`, `longitude`, `sensor`, `platform`, `product_id`, `confidence_raw`, `confidence_semantics`, `frp_native` (nullable), `source_snapshot_id`. Ordering is `acquired_at_utc, observation_id` (deterministic).
- **Automation:** Auto: `tests/test_api.py::test_observations_list_and_pagination` · **Status:** Not executed here

## BE-TC-022 — `sensors` / `platforms` / `products` filter as comma-separated lists
- **Type / Priority:** Functional / P1 · **Refs:** API §3
- **Steps:** `sensors=MODIS`; `sensors=MODIS,VIIRS`; `sensors= MODIS , VIIRS ` (spaces); `platforms=Terra`; `products=MODIS_NRT`
- **Expected:** whitespace trimmed; exact-match within the list (case-sensitive, see BE-TC-024); unknown tokens match nothing and return 200 with empty `data` and `total: 0` — never a 500.
- **Automation:** Partial: list filter covered in `test_observations_list_and_pagination` · **Status:** Not executed here

## BE-TC-023 — Empty filter token is rejected, not silently widened
- **Type / Priority:** Negative / P2 · **Refs:** API §3; D-25
- **Steps:** `sensors=MODIS,` (trailing comma); `sensors=,VIIRS`; `sensors=,,`
- **Expected (spec):** 4xx `INVALID_FILTER` (or equivalent) naming the offending parameter; no silent `IN ('')` clause.
- **Actual (code review):** tokens stripped, empties kept; `sensor IN ('MODIS','')` matches nothing extra — mostly benign but slips through silently and signals sloppy input handling.
- **Status:** Code-review finding — D-25

## BE-TC-024 — Filter matching is case-sensitive and inconsistent with /coverage
- **Type / Priority:** Negative / P2 · **Refs:** API §3; D-25 adjacency
- **Steps:** `sensors=modis`; `platforms=terra`
- **Expected:** either documented case-insensitivity everywhere or a strict enum with a 4xx for out-of-vocabulary values. Current behaviour returns 200 with zero rows, indistinguishable from "no data".
- **Status:** Not executed (document behaviour; decide contract)

## BE-TC-025 — Invalid `start` / `end` → 422 INVALID_DATE_RANGE
- **Type / Priority:** Negative / P0 · **Refs:** API §3, §9; FR-02
- **Steps:** `start=not-a-date`; `start=2024-13-99`; `start=2024-02-30`; `end=` (empty string); `start=2024-01-01T25:99:99Z`
- **Expected:** 422; `code=INVALID_DATE_RANGE`; no exception; message does not echo raw SQL/paths.
- **Automation:** Auto (partial): `tests/test_api.py::test_invalid_date_range` · **Status:** Not executed here

## BE-TC-026 — `end <= start` → 422 INVALID_DATE_RANGE
- **Type / Priority:** Boundary / P0 · **Refs:** API §3, §9
- **Steps:** `start=2024-02-01&end=2024-01-01`; equal instants `start=end=2024-01-15T00:00:00Z`
- **Expected:** 422 both cases; code `INVALID_DATE_RANGE`.
- **Automation:** Auto: `tests/test_api.py::test_invalid_date_range` (unequal case) · **Status:** Not executed here

## BE-TC-027 — Naive timestamps are interpreted as UTC; offsets are honoured
- **Type / Priority:** Boundary / P1 · **Refs:** ARCHITECTURE §6; API §1
- **Steps:** `start=2024-01-01` (naive); `start=2024-01-01T06:00:00+06:00`; `start=2024-01-01T00:00:00Z`; compare filtered `total` against ENV-3 rows acquired in each interval
- **Expected:** naive treated as UTC (+00:00); aware offsets converted correctly; `Z` accepted; identical instants in different offsets return identical results.
- **Status:** Not executed

## BE-TC-028 — Pagination clamps rather than errors, and is documented
- **Type / Priority:** Boundary / P1 · **Refs:** API §3
- **Steps:** `page=0`; `page=-5`; `page_size=0`; `page_size=100000`; `page=999999&page_size=50`
- **Expected:** page clamped to ≥ 1; page_size clamped to 1..1000; over-range page returns `data: []` with correct `total`; no error, and the clamp is documented (or the API rejects with 4xx if strict validation is chosen).
- **Status:** Not executed

## BE-TC-029 — Pagination is stable across pages (no skips/dups under identical data)
- **Type / Priority:** DataIntegrity / P1 · **Refs:** API §3; VAL §10
- **Steps:** total N>200 synthetic rows (generate in scratch ENV-1); iterate pages 1..k; collect `observation_id`s; compare against single-page `page_size=1000` set
- **Expected:** no duplicates across pages; no omissions; ordering stable; `total` identical on every page.
- **Status:** Not executed (needs a larger synthetic fixture generator — approved as test-only, clearly labelled SYNTHETIC_NOT_NASA_DATA)

## BE-TC-030 — `include_native_fields=false` omits `source_attributes`; true returns it
- **Type / Priority:** Functional / P1 · **Refs:** API §3, §6; DATA_DICT §2
- **Steps:** `GET /api/v1/observations` with default and with `include_native_fields=true`; diff row keys
- **Expected:** default list omits `source_attributes`; `true` includes it verbatim (JSON of unmapped native columns); other fields unchanged.
- **Automation:** Auto (partial): `tests/test_api.py::test_observations_list_and_pagination` asserts presence of confidence fields only · **Status:** Not executed here

## BE-TC-031 — Detail endpoint returns provenance and all native fields
- **Type / Priority:** Functional / P0 · **Refs:** API §6; FR-08; VAL §4
- **Steps:** pick a row from list; `GET /api/v1/observations/{id}`
- **Expected:** 200; includes `source_snapshot_id`, `source_row_fingerprint`, `provider`, `product_id`, `collection_version`, `processing_level`, `normalization_version`, `ingested_at_utc`, `source_attributes`; native date/time preserved (`acq_date_native`, `acq_time_native`).
- **Automation:** Auto: `tests/test_api.py::test_observation_detail` · **Status:** Not executed here

## BE-TC-032 — Detail for unknown id → 404 OBSERVATION_NOT_FOUND
- **Type / Priority:** Negative / P0 · **Refs:** API §9
- **Steps:** `GET /api/v1/observations/does-not-exist`
- **Expected:** 404; `code=OBSERVATION_NOT_FOUND`; no 500.
- **Automation:** Auto: `tests/test_api.py::test_observation_not_found` · **Status:** Not executed here

## BE-TC-033 — Detail id with SQL/path payload cannot break out
- **Type / Priority:** Security / P0 · **Refs:** API §10; D-19/D-21 adjacency
- **Steps:** `observation_id = ../../../../etc/passwd`; `' OR 1=1 --`; `%00`; 10 KB id string
- **Expected:** 404 OBSERVATION_NOT_FOUND (parameterised query, no file access); no traceback; no timing oracle difference beyond noise.
- **Status:** Not executed

## BE-TC-034 — Injection via list filters is inert
- **Type / Priority:** Security / P0 · **Refs:** API §10
- **Steps:** `sensors='; DROP TABLE fire_observation; --`; `products=MODIS' OR '1'='1`; `start=2024-01-01' UNION SELECT 1--`
- **Expected:** 200 with zero rows or 422; `fire_observation` still readable; no SQL in error text.
- **Status:** Not executed

## BE-TC-035 — `aoi_id` on list/export is not a silent no-op
- **Type / Priority:** Negative / P1 · **Refs:** API §3; CLAUDE.md §3; D-22
- **Steps:** `GET /api/v1/observations?aoi_id=bangladesh-bd` with rows both inside and outside the AOI (ENV-1 fixture with one row at 0/0). The earlier literal `sundarbans-bd` example is retired (2026-11-09, Step 3): the active AOI is `bangladesh-bd`; the case logic is unchanged.
- **Expected (spec):** only AOI rows returned, or parameter rejected with 4xx.
- **Actual (code review):** `aoi_id` is accepted by the route signature and never passed to `query_observations` → **all** rows returned regardless; an analyst can believe they filtered by AOI and did not.
- **Status:** Code-review fail — D-22
