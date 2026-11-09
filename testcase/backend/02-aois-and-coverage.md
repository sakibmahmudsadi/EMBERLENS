# 02 — AOIs and coverage

---

## BE-TC-011 — AOI list returns configured AOI with GeoJSON geometry
- **Type / Priority:** Functional / P0 · **Refs:** API §2; FR-04; DATA_DICT §2 (`aoi`)
- **Pre:** ENV-2 with `demo-aoi` (synthetic box 89..91 / 21..23) or ENV-3 `bangladesh-bd` (current active AOI; the earlier expected `sundarbans-bd` / `88.0/21.5/90.0/22.7` expectation is retired — see below)
- **Steps:** `GET /api/v1/aois`
- **Expected:** 200; array length ≥ 1; each item has `aoi_id`, `name`, `crs` (= `EPSG:4326`), `source`, `created_at_utc`; `geometry` is a GeoJSON Polygon/MultiPolygon with `coordinates` in **[longitude, latitude]** order (RFC 7946). For ENV-3 confirm `aoi_id = bangladesh-bd` and bbox matches the national config (`88.0/20.5/92.7/26.7`). The Sundarbans-box assertion (`sundarbans-bd`, `88.0/21.5/90.0/22.7`) is **retired (2026-11-09, Step 3)** — the Sundarbans prototype was removed and the national bbox supersedes it (ADR-012); do not reconstruct that geometry.
- **Automation:** Auto: `tests/test_api.py::test_aois` (order not asserted there) · **Status:** Not executed here

## BE-TC-012 — GeoJSON coordinate order is lon,lat (not lat,lon)
- **Type / Priority:** Boundary / P0 · **Refs:** ARCHITECTURE §6, §10; API §6; D-18 adjacency
- **Pre:** AOI stored from an asymmetric box (e.g. corner at lon 88.0, lat 22.7 makes order detectable)
- **Steps:** `GET /api/v1/aois`; read nested coordinates; also `GET /api/v1/observations/{id}` GeoJSON export (`/exports`, format=geojson) and compare to source CSV `latitude,longitude`
- **Expected:** every geometry reports `[lon, lat]`; a swapped axis fails the case.
- **Status:** Not executed

## BE-TC-013 — Empty AOI list is `[]`, not an error
- **Type / Priority:** Boundary / P1 · **Refs:** API §2
- **Pre:** ENV-1/ENV-2 with empty `aoi` table
- **Steps:** `GET /api/v1/aois`
- **Expected:** 200, body `[]`.
- **Status:** Not executed

## BE-TC-014 — Unknown/non-configured AOI id on calendar → 404 AOI_NOT_FOUND
- **Type / Priority:** Negative / P0 · **Refs:** API §9; FR-04
- **Steps:** `GET /api/v1/calendar?aoi_id=nope&start=2024-01-01&end=2024-04-01`
- **Expected:** 404; envelope `{"error":{"code":"AOI_NOT_FOUND", "message":..., "request_id":..., "details":{}}}`; matching `X-Request-ID`; no stack trace.
- **Automation:** Auto: `tests/test_api.py::test_calendar_aoi_not_found` · **Status:** Not executed here

## BE-TC-015 — Only the configured demo AOIs are served (prototype boundary)
- **Type / Priority:** Security / P1 · **Refs:** API §1 ("accept only the configured AOI"), §10; CLAUDE.md §3; D-24
- **Pre:** Prototype constraint: one documented AOI; DB contains exactly one configured AOI plus, for test, an attacker-inserted second AOI row (e.g. inserted directly via SQL in a scratch copy — never in ENV-3)
- **Steps:** `GET /api/v1/aois`; `GET /api/v1/calendar?aoi_id=<injected>&…`
- **Expected:** only server-configured `EMBERLENS_AOI_IDS` are listed or queryable. Database rows outside the allowlist return 404 and cannot be selected through query or export routes.
- **Actual:** routes filter listings and enforce the allowlist on observations, coverage, map density, calendar, hotspot groups, and exports. Tests insert an unconfigured AOI into DuckDB and assert that it is hidden and all seven query paths reject it.
- **Automation:** `tests/test_api.py::test_unconfigured_database_aois_are_not_exposed_or_queryable` · **Status:** Automated pass; D-24 closed

## BE-TC-016 — Coverage lists availability evidence with the mandatory caveat
- **Type / Priority:** Functional / P0 · **Refs:** API §2, §5; FR-05; METH §7.3; DATA_DICT §2 (`data_availability`)
- **Pre:** ENV-2 seeded with availability rows (`available`, `missing`, `unavailable`, `partial`, `unknown`)
- **Steps:** `GET /api/v1/coverage`
- **Expected:** 200; `availability` array echoes inserted rows with fields `product_id`, `platform`, `date_or_interval`, `availability_status`, `source_reference`, `checked_at_utc`; `note` states that records may be absent while coverage is unverified; `aoi_id` echoed as passed.
- **Automation:** `tests/test_api.py::test_coverage`; date filtering is covered by `test_coverage_filters_source_intervals_and_missing_days_by_date_range` · **Status:** Automated pass (synthetic evidence)

## BE-TC-017 — Coverage `aoi_id` and `sensor` parameters are not silently ignored
- **Type / Priority:** Negative / P1 · **Refs:** API §1, §3, §5; D-22
- **Pre:** ENV-2 with two availability rows for `MODIS_SP` and one for `VNP14IM`
- **Steps:**
  1. `GET /api/v1/coverage?aoi_id=does-not-exist`
  2. `GET /api/v1/coverage?sensor=VIIRS`
  3. `GET /api/v1/coverage?sensor=modis` (lower-case)
- **Expected (spec):** step 1 either filters by AOI or rejects with 4xx; step 3 matches case-insensitively like other filters; no parameter is accepted-and-discarded.
- **Actual (code review):** `aoi_id` is echoed but never used to filter; `sensor` filter does `product_id.lower().startswith(sensor.lower())` — case-insensitive but matches only prefix, so `sensor=NP14` returns nothing while `sensor=V` returns VIIRS rows (documented as surprising, still not a rejection). Empty string `sensor=` is falsy → no filter applied silently.
- **Status:** Code-review fail (partial) — D-22

## BE-TC-018 — Coverage `observations` figure is not mistaken for AOI coverage
- **Type / Priority:** DataIntegrity / P1 · **Refs:** API §5; METH §7.3; VAL §6
- **Pre:** ENV-2 seeded; note total observation count in fixtures = 4 MODIS + 4 VIIRS = 8
- **Steps:** `GET /api/v1/coverage`; read `observations`
- **Expected:** the field is unambiguous (either renamed e.g. `total_observations_all_sources` or removed); it must not be presented as "detections in this AOI over this period".
- **Actual (code review):** `count_observations()` counts **all** rows in `fire_observation` with no AOI/time constraint; response key is simply `observations`.
- **Status:** Code-review finding — D-22

## BE-TC-019 — Empty availability table is explicit, not omitted
- **Type / Priority:** Boundary / P1 · **Refs:** API §5
- **Pre:** ENV-1/ENV-2, `data_availability` empty
- **Steps:** `GET /api/v1/coverage`
- **Expected:** 200 with `availability: []` and the caveat note; no fabricated statuses.
- **Status:** Not executed

## BE-TC-020 — Availability status values are the documented enum
- **Type / Priority:** DataIntegrity / P0 · **Refs:** DATA_DICT §2 (`available|unavailable|missing|partial|unknown`); METH §7.3
- **Pre:** ENV-2; insert availability rows with each enum value plus an out-of-enum value (`complete`)
- **Steps:** `GET /api/v1/coverage`; check each echoed status
- **Expected:** documented enum passes through unchanged; out-of-enum input is rejected at write time (see BE-TC-109) or surfaced as `coverage_unknown`, never silently relabellised as `available`.
- **Status:** Not executed
