# 11 — Scientific correctness (evidence-level, not just "it responds")

These cases fail the release even if every HTTP call returns 200.

---

## BE-TC-136 — A calendar cell trace can be reproduced back to raw source rows
- **Type / Priority:** Science / P0 · **Refs:** VAL §3, §4, §6; METH §14; FR-09
- **Pre:** ENV-3 read-only copy; pick VIIRS 2024-02 cell for `sundarbans-bd`
- **Steps:**
  1. `GET /api/v1/calendar?aoi_id=sundarbans-bd&start=2024-02-01&end=2024-03-01`; record VIIRS count and `source_snapshot_ids`
  2. `GET /api/v1/observations?products=VIIRS_SNPP_SP&start=2024-02-01&end=2024-03-01&page_size=1000`
  3. assert each returned feature lies inside the AOI bbox; count = calendar cell
  4. verify each `source_row_fingerprint` appears in the raw CSV (recompute fingerprint from the row via `fingerprint()`)
- **Expected:** counts agree exactly; fingerprints recompute identically; snapshot sha256 matches the manifest (`3bf8ad84…3653`); AOI bbox membership consistent with `point_in_polygon`.
- **Status:** Not executed — required before demo (needs scratch copy of live DB or fresh scratch ingest)

## BE-TC-137 — Sensor-specific series are never presented as interchangeable
- **Type / Priority:** Science / P0 · **Refs:** METH §3, §8; PRD §10; VAL §13
- **Steps:** read calendar JSON; read export manifest `limitations`; read `/data-sources` note; inspect frontend-facing contract docs (out of scope for code, but contract must support it)
- **Expected:** no key named like `harmonized_count`, `total_fires`, `fire_count`; sensor labels explicit; confidence semantics differ MODIS numeric / VIIRS categorical, stated in docs and export; no claim VIIRS sees "more fires".
- **Status:** Not executed (static inspection + export field check)

## BE-TC-138 — Descriptive history is labelled descriptive; no climatology claim from 24 months
- **Type / Priority:** Science / P0 · **Refs:** METH §7.1, §8; PRD §4, §6; README §1
- **Steps:** inspect `limitations`, manifest, API docs; search codebase/response strings for "climatology", "normal", "average fire season", "anomaly"
- **Expected:** any such term absent or explicitly "not established"; no seasonal baseline exposed; UI copy (reviewed in frontend suite) mirrors this; API has no `/anomalies`/`/baselines` implementation.
- **Status:** Not executed

## BE-TC-139 — "No source records returned" copy is used everywhere; "zero fires" never appears
- **Type / Priority:** Science / P0 · **Refs:** METH §7.3; CLAUDE.md §4; VAL §6, §11
- **Steps:** grep API responses, manifest `limitations`, error messages, logs for `zero`, `no fire`, `0 detections`; assert mandatory disclaimer(s) present in calendar `limitations` and export manifest
- **Expected:** the two strings "no source records returned" / "observation coverage unknown" appear; no affirmative zero-fire language.
- **Status:** Not executed

## BE-TC-140 — Provenance chain is complete on every export (snapshot → row → method)
- **Type / Priority:** Science / P0 · **Refs:** VAL §4; METH §14; API §8
- **Steps:** pick one exported observation; follow `source_snapshot_id` → `/data-sources` snapshot entry → manifest `source_snapshots[]`; verify `sha256`,`collection_version`,`processing_level`,`retrieved_at_utc`,`documentation_url` present; verify `method_version=calendar-v0`, `normalization_version=canonical-v1` on derived rows
- **Expected:** chain unbroken; a third party can identify exactly which bytes produced the number.
- **Status:** Not executed

## BE-TC-141 — Counting unit is explicit and stable across API, CSV, JSON, GeoJSON
- **Type / Priority:** Science / P1 · **Refs:** DATA_DICT §2 (`count_unit`); API §4
- **Steps:** grep all four outputs for `source_observation_rows_after_exact_deduplication_within_product_snapshot`; ensure observations exports state row-per-source-observation semantics via `count_unit_note` (list) and manifest text
- **Expected:** identical unit string everywhere; no drift.
- **Status:** Not executed

## BE-TC-142 — Duplicate policy: exact only within snapshot; near-dupes near boundaries survive
- **Type / Priority:** Science / P0 · **Refs:** METH §6; PIPE §6
- **Steps:** synthetic fixture variant with two rows same coords/time, different `frp` (keeps both); two identical rows (dedupe); one MODIS + one VIIRS identical coords/time (both kept, separate series)
- **Expected:** counts match hand calculation; no cross-sensor merge; no coordinate-distance clustering.
- **Status:** Not executed (unit-covered pieces; end-to-end recommended)

## BE-TC-143 — AOI boundary handling is documented and tested at exact edges
- **Type / Priority:** Science / P0 · **Refs:** METH §9; VAL §6
- **Steps:** point on each of 4 bbox edges; point on corner; point 1e-9 outside; point with lon=180/lat=0 for a global AOI (if ever)
- **Expected:** boundary included (`covers`); outside excluded; results documented in method notes (`spatial_rule=point_in_polygon_boundary_included`).
- **Automation:** Auto: `tests/test_calendar.py::test_boundary_point_included` · **Status:** Not executed here

## BE-TC-144 — Leap-day and month-end observations land in the correct month
- **Type / Priority:** Boundary / P0 · **Refs:** VAL §6
- **Steps:** synthetic 2024-02-29T12:00 row; 2024-02-29T23:59 vs 2024-03-01T00:00; non-leap 2025-02 has 28 days
- **Expected:** Feb 2024 bin includes leap-day rows; no row leaks into March; non-leap Feb has exactly 28/29 distinct day bins if daily views existed (they don't in prototype — months only).
- **Automation:** Auto: `tests/test_calendar.py::test_month_bins_leap_february` · **Status:** Not executed here

## BE-TC-145 — Real SP files pass the ingestion gate before any calendar claim ships
- **Type / Priority:** Science / P0 · **Refs:** PIPE §2, §6; README §5 (real snapshot); D-26
- **Pre:** real files in `data/raw/`; ingest manifests show MODIS passed / VIIRS `failed` (missing `brightness`)
- **Steps:**
  1. Reconcile product guides for MODIS_SP / VIIRS_SNPP_SP (field names, units, confidence domain)
  2. Fix mapping or manifest criteria; reload both files into a **scratch copy** of the DB
  3. Run validation report; require `validation_status: passed` for VIIRS with zero unmapped required fields
  4. Serve `/calendar` from scratch DB; verify series platforms = `Terra`/`Aqua` (MODIS) and `Suomi-NPP` (VIIRS after D-26 fix)
- **Expected:** both products ingest with explicit reports; platform stratification correct; no silent null-brightness rows without flags.
- **Status:** BLOCKED — requires product-guide reconciliation (see `data/processed/manifests/* VIIRS * failed`); without it no calendar claim is defensible
