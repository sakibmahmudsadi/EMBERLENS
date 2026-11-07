# 06 — Ingestion seam (`local_loader.load_csv`) and idempotency

`backend/local_loader.py` is the temporary seam until `backend/ingestion/` lands; it performs the same work directly against DuckDB. Tests here use **synthetic** fixtures only, plus read-only ENV-3 reference checks.

---

## BE-TC-071 — Load synthetic MODIS CSV: snapshot + observations inserted
- **Type / Priority:** Functional / P0 · **Refs:** FR-01, FR-02; PIPE §4, §6
- **Pre:** ENV-1 empty
- **Steps:** `load_csv(db, fixtures/modis_synthetic.csv, sensor="MODIS", product_id="MODIS_NRT")`; then query tables
- **Expected:** returns dict with `source_snapshot_id`, `row_count=4`, `inserted_or_existing=4`, `exact_duplicates=0`; `fire_observation` count = 4; snapshot `row_count=4`; `sha256` matches file; `product_id`, `sensor`, and per-row `platform` stored.

- **Automation:** Auto: `tests/test_loader.py::test_snapshot_registered` · **Status:** Not executed here

## BE-TC-072 — Exact duplicates deduplicated within snapshot scope
- **Type / Priority:** DataIntegrity / P0 · **Refs:** PIPE §5, §6; METH §6; VAL §6; FR-02
- **Steps:** load `duplicates_synthetic.csv`
- **Expected:** `row_count=3`; `exact_duplicates=1`; observations in DB = 2; both occurrences of the repeated row collapse to one `source_row_fingerprint`; distinct row preserved.
- **Automation:** Auto: `tests/test_loader.py::test_duplicate_csv_exact_dedup` · **Status:** Not executed here

## BE-TC-073 — Re-load of same file is a no-op for row counts
- **Type / Priority:** DataIntegrity / P0 · **Refs:** PIPE §5 (idempotent); FR-01
- **Steps:** load twice; compare `count_observations()`, snapshot list length
- **Expected:** counts unchanged after second load; snapshot `source_snapshot_id` identical (uuid5 of product|filename); no duplicate rows.
- **Automation:** Auto: `tests/test_loader.py::test_reload_is_idempotent` · **Status:** Not executed here

## BE-TC-074 — Reload rewrites snapshot row (provenance churn) instead of short-circuiting
- **Type / Priority:** NonFunctional / P2 · **Refs:** PIPE §5; D-11 adjacency
- **Steps:** load; capture `retrieved_at_utc`; load again same file; capture again
- **Expected (spec):** identical input ⇒ identical manifest/snapshot (content hash unchanged) or an explicit "unchanged" outcome; `retrieved_at_utc` only changes on a real retrieval.
- **Actual (code review):** loader unconditionally `DELETE`s and re-inserts the snapshot with `retrieved_at_utc=now()`; two consecutive loads differ in metadata though bytes are identical. Not data loss, but breaks audit trails and makes "did this change?" unanswerable.
- **Status:** Code-review finding — D-11

## BE-TC-075 — Failed load leaves no half-written snapshot (atomicity)
- **Type / Priority:** DataIntegrity / P0 · **Refs:** PIPE §5 (atomic writes), §11; D-13
- **Pre:** fixture CSV with coordinates valid but `acq_time = 9999` on the **last** row (parseable by `validate_row`, fails in `parse_acquired_at_utc`); scratch DB
- **Steps:** call `load_csv`; catch exception; inspect `source_snapshot` and `fire_observation`
- **Expected (spec):** either nothing is committed (transaction rollback) or the run is recorded as `failed` with zero observations and an explicit error — never a snapshot whose `row_count=N` coexists with zero observation rows.
- **Actual (code review):** validation of rows happens pre-write, but `parse_acquired_at_utc` runs **after** `INSERT` into `source_snapshot`; exception propagates ⇒ `source_snapshot` row with `row_count=N` and **zero** observations remains. Subsequent `/calendar` reports the snapshot as if data were ingested.
- **Status:** Executed 2026-11-06 — **FAIL**: synthetic file whose final row has `acq_time=9999` → `ValueError: Invalid acq_time: '9999'` raised **after** the snapshot insert; DB retains one snapshot with `row_count=4` and **zero** observations; `/calendar` and `/data-sources` see a phantom snapshot (D-13)

## BE-TC-076 — Cross-snapshot identical content silently drops observations
- **Type / Priority:** DataIntegrity / P0 · **Refs:** PIPE §5; D-12
- **Pre:** same synthetic CSV copied to two different filenames (`a.csv`, `b.csv`, identical bytes), scratch DB
- **Steps:** `load_csv(a.csv …)` then `load_csv(b.csv …)`; compare `count_observations()` and per-snapshot row counts
- **Expected (spec):** either both snapshots carry their rows (fingerprint scoped by `source_snapshot_id`) or the second is an explicit no-op reported as such; never silent loss.
- **Actual (code review):** `observation_id = uuid5(fingerprint)` where fingerprint excludes filename/snapshot; `INSERT OR IGNORE` drops every row of `b.csv`; `b.csv`'s snapshot reports `row_count=N` yet contributes 0 observations; `/data-sources` shows a healthy-looking snapshot with no data behind it.
- **Status:** Executed 2026-11-06 — **FAIL**: after loading the identical synthetic file under two different names, `count_observations()` = **4** (expected 8); second snapshot reports `row_count=4` but contributes 0 observations (D-12)

## BE-TC-077 — Same file name, different content silently replaces old data
- **Type / Priority:** DataIntegrity / P1 · **Refs:** PIPE §5, §9
- **Pre:** load `x.csv` (v1); overwrite `x.csv` with different rows (v2); reload
- **Steps:** inspect counts and fingerprints before/after
- **Expected (spec):** content hash change is detected; either load is rejected as "same snapshot id, different sha256" or a **new** snapshot is created and reconciliation is explicit — never silent overwrite of lineage.
- **Actual (code review):** snapshot_id is `uuid5(product|filename)` → identical id; loader `DELETE`s prior rows and inserts v2 without comparing hashes; the manifest's old `sha256` is gone.
- **Status:** Code-review finding — D-11

## BE-TC-078 — Empty CSV (header only) creates an empty snapshot without failing
- **Type / Priority:** Negative / P1 · **Refs:** PIPE §6, §11; D-15
- **Steps:** load fixture with header only
- **Expected (spec):** explicit `no_data` outcome (or exception) reported to caller; no snapshot with `row_count=0` masquerading as success.
- **Actual (code review):** succeeds silently; snapshot row_count=0; caller cannot distinguish "file empty" from "all rows invalid".
- **Status:** Code-review fail — D-15

## BE-TC-079 — BOM / non-UTF8 / comment lines / blanks
- **Type / Priority:** Boundary / P2 · **Refs:** PIPE §6 (file checks); D-14 adjacency
- **Steps:** file with UTF-8 BOM (`\ufefflatitude,...`); file with `#` comment header lines; file with blank lines; file in CP1252 with a latin-1 degree sign
- **Expected:** BOM handled or rejected with clear error (current: `utf-8` codec ⇒ `\ufefflatitude` → latitude missing → all rows invalid → `ValueError` from loader — fail-closed but confusing); `#`-lines skipped; blanks skipped; unknown encoding rejected with clear message.
- **Status:** Not executed

## BE-TC-080 — Comment-stripping breaks quoted multi-line fields
- **Type / Priority:** Boundary / P2 · **Refs:** PIPE §6; D-16 adjacency
- **Pre:** CSV with a quoted field containing an embedded newline whose second line starts with `#` (rare in FIRMS, but possible in free-text `notes`-like columns)
- **Steps:** load; compare parsed rows vs `csv.DictReader` ground truth
- **Expected:** quoted newline preserved or file rejected; never mis-parsed silently.
- **Actual (code review):** lines are pre-filtered with `line.strip() and not line.lstrip().startswith("#")` **before** CSV parsing → a continuation line starting with `#` is dropped, corrupting the record.
- **Status:** Code-review finding — D-16

## BE-TC-081 — Invalid coordinate rows abort the whole file before any DB write
- **Type / Priority:** Boundary / P1 · **Refs:** PIPE §6; FR-02
- **Steps:** synthetic file with one row `latitude=91`; call `load_csv`; inspect exception message and DB tables
- **Expected:** `ValueError` naming file + line number and the invalid field; **zero** rows inserted; snapshot table unchanged (validation precedes writes).
- **Status:** Not executed (code path exists — confirm line number is 1-based as documented, i.e. header = line 1)

## BE-TC-082 — `acq_time` malformed values are not silently truncated
- **Type / Priority:** Boundary / P0 · **Refs:** PIPE §6; D-14
- **Steps (unit, `parse_acquired_at_utc`):** `"5"` → 00:05; `"325"` → 03:25; `"2359"` → 23:59; `"12345"` → must raise; `"2400"` → raise; `"1260"` → raise; `"ab"` → raise; `""`/`None` → defaults 00:00 (documented) or raise
- **Expected:** strict 4-digit HHMM validation; anything else raises `ValueError`; never partial parse.
- **Actual (code review):** `t = t.zfill(4)` only pads; `"12345"` stays 5 chars; `t[:2]="12"`, `t[2:4]="34"` ⇒ silently stored as **12:34**, dropping the 5th digit; no error, corrupt timestamp in analytics.
- **Status:** Code-review fail — D-14

## BE-TC-083 — Missing required FIRMS columns fail the whole load pre-write
- **Type / Priority:** Boundary / P0 · **Refs:** PIPE §6 (schema checks); FR-02; VAL §3
- **Steps:** load real VIIRS SP header (`bright_ti4` but no `brightness`) through the current mapping with `sensor="VIIRS"`; load a file lacking `latitude`; load file lacking `acq_date`
- **Expected (spec, from manifest lesson):** schema mismatch is a **hard** failure with a report naming missing required columns (the ingest pipeline already produces `validation_status=failed` for VIIRS: `missing required columns: ['brightness']`); or mapping updated to the real VIIRS SP layout (`bright_ti4` → `brightness_primary_native`) with tests.
- **Actual (code review):** mapping for VIIRS expects `brightness`/`bright_ti4` — `bright_ti4` maps to secondary, `brightness` absent ⇒ `brightness_primary_native=NULL` **silently** (no error, since missing native columns are tolerated by `map_row`). Requires product-guide reconciliation before demo ingest.
- **Status:** Code-review finding / blocked on product-guide reconciliation — D-26

## BE-TC-084 — VIIRS `satellite="N"` is normalized to a documented platform, not stored as "N"
- **Type / Priority:** DataIntegrity / P0 · **Refs:** PIPE §2, §6; METH §3; D-26
- **Pre:** ENV-3 real file (read-only analysis) or a single synthetic row with `satellite=N, instrument=VIIRS`
- **Steps:** `map_row` on the row; inspect `platform`; group in `/calendar` by platform
- **Expected:** `Suomi-NPP` (or explicit `unknown_source_label:"N"` with a documented mapping); UI/coverage can filter `Suomi-NPP`.
- **Actual (code review):** `PLATFORM_ALIASES` has no `"n"`; `normalize_platform("N")` returns `"N"`; every real VIIRS_SP row would be grouped under platform `"N"`, breaking sensor/platform stratification and availability joins (`data_availability.platform` uses `Suomi-NPP` per manifest).
- **Status:** Code-review fail (real-data blocker) — D-26

## BE-TC-085 — Loader rejects wrong `sensor` arguments and preserves unknowns
- **Type / Priority:** Boundary / P1 · **Refs:** PIPE §2; FR-03
- **Steps:** `sensor="LANDSAT"`; `sensor="viirs"`; `sensor="MODIS "` (trailing space)
- **Expected:** unsupported sensor raises `ValueError` with allowed list; case/whitespace tolerated or explicitly rejected — never silently coerced into the MODIS map.
- **Status:** Not executed
