# 08 — Input validation (`validation/checks.py`)

---

## BE-TC-101 — Valid row passes validation
- **Type / Priority:** Functional / P0 · **Refs:** FR-02; PIPE §6
- **Steps:** `validate_row({"latitude": 22.0, "longitude": 90.0, "acq_date_native": "2024-02-01"})`
- **Expected:** `ok=True`, `errors=[]`.
- **Automation:** Auto: `tests/test_validation.py::test_valid_row` · **Status:** Not executed here

## BE-TC-102 — Latitude range boundaries −90 / +90 accepted, outside rejected
- **Type / Priority:** Boundary / P0 · **Refs:** PIPE §6
- **Steps:** lat ∈ {-90, -90.0001, 90, 90.0001, 91, -91}; same for lon ±180 / ±180.0001
- **Expected:** ±90 / ±180 exactly → pass; any exceedance → error naming the field and value; messages differ per field.
- **Automation:** Auto: `tests/test_validation.py::test_lat_out_of_range`, `test_lon_out_of_range` · **Status:** Not executed here

## BE-TC-103 — NaN / Infinity coordinates are rejected (verified safe)
- **Type / Priority:** Boundary / P0 · **Refs:** PIPE §6
- **Steps (unit):** `check_coordinates(float("nan"), 90.0)`; `check_coordinates(90.0, float("nan"))`; `float("inf")` / `float("-inf")`; CSV-string `"NaN"` and `"1e999"`
- **Expected (spec):** all non-finite values rejected.
- **Executed 2026-11-06** (scratch, no DB): all six inputs return the expected out-of-range errors; boundary values −90/+90/±180 pass. The `not (min <= x <= max)` pattern is safe here because comparisons with NaN are False and the guard negates them. **PASS.**
- **Status:** Executed — PASS

## BE-TC-104 — Non-numeric / missing coordinates fail closed with field-specific message
- **Type / Priority:** Negative / P1 · **Refs:** PIPE §6
- **Steps:** latitude `"abc"`, `None`, `""`, `"22,5"`; longitude missing entirely
- **Expected:** errors identify the offending field; longitude error appended even when latitude already failed (both reported in one pass); no exception raised to caller.
- **Status:** Not executed (code review shows `TypeError/ValueError` caught and both errors accumulated — verify message wording)

## BE-TC-105 — Missing / empty `acq_date_native` is an error; whitespace-only too
- **Type / Priority:** Boundary / P1 · **Refs:** PIPE §6
- **Steps:** `acq_date_native=None`, `""`, `"   "`
- **Expected:** error; `validate_row.ok == False`.
- **Automation:** Auto: `tests/test_validation.py::test_missing_date` (None case) · **Status:** Not executed here

## BE-TC-106 — Invalid calendar dates are rejected by the parser, not the validator
- **Type / Priority:** Negative / P1 · **Refs:** PIPE §6
- **Steps:** `acq_date_native="2024-02-30"`, `"2024-13-01"`, `"02/01/2024"` through `validate_row` then through `parse_acquired_at_utc`
- **Expected:** `validate_row` may pass (presence only) but the mapping stage raises `ValueError` with the bad value; load aborts pre-write (BE-TC-081); document layering of checks.
- **Status:** Not executed

## BE-TC-107 — `find_duplicates` flags repeated fingerprints once each
- **Type / Priority:** Functional / P1 · **Refs:** PIPE §6
- **Steps:** `find_duplicates(["a","b","a","c","b","a"])`
- **Expected:** `["a","b"]`; order of first appearance; no duplicates in the result.
- **Automation:** Auto: `tests/test_validation.py::test_find_duplicates` · **Status:** Not executed here

## BE-TC-108 — Duplicate diagnostics separate exact vs near duplicates
- **Type / Priority:** DataIntegrity / P1 · **Refs:** METH §6; VAL §5
- **Steps:** rows identical in acq/coords but different `frp` (legit separate detections); identical coords, same source snapshot (exact); cross-sensor (never dupes)
- **Expected:** only byte/fingerprint-identical rows reported as duplicates; near-duplicates counted separately or not flagged; report feeds validation summary.
- **Status:** Not executed

## BE-TC-109 — `data_availability` writes enforce the documented enum
- **Type / Priority:** DataIntegrity / P1 · **Refs:** DATA_DICT §2; METH §7.3
- **Steps:** attempt insert with status `available`, `missing`, `partial`, `unavailable`, `unknown`, `complete`, `null`
- **Expected:** five documented values accepted; `complete` and null rejected or mapped to `coverage_unknown`; `notes` required for `unknown` if policy demands; never coerced to `available`.
- **Status:** Not executed

## BE-TC-110 — Row-count and validation reports never fabricate success
- **Type / Priority:** Science / P0 · **Refs:** PIPE §6, §11; CLAUDE.md §5 ("Never suppress exceptions…")
- **Steps:** feed the pipeline a file where 3 rows fail parsing but 73 pass; inspect `counts.validation_status`, `row_count`, `inserted` fields; same for an empty-file case
- **Expected:** partial-pass reported as `warning`/`failed` with explicit counts; no "passed" with hidden failures; load either aborts or is explicitly recorded; exits non-zero for CLI entry points (`scripts/ingest.py` if in scope of a later suite — out of scope here).
- **Status:** Not executed (behavior in `local_loader`: any invalid row aborts everything — fail-closed, good; but `parse_acquired_at_utc` failure occurs post-snapshot-write — see BE-TC-075)
