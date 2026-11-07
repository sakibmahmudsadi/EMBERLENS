# 07 — Harmonization and canonical mapping

Target: `backend/harmonization/mapping.py` (`map_row`, `parse_acquired_at_utc`, `fingerprint`, `deduplicate`, vocab helpers).

---

## BE-TC-086 — MODIS confidence retained as numeric source score, never mapped to 0–100 claim
- **Type / Priority:** Science / P0 · **Refs:** METH §5; FR-03; VAL §5
- **Steps:** `map_row` on MODIS row with `confidence="55"`, `confidence="0"`, `confidence="100"`, `confidence="101"`
- **Expected:** `confidence_raw` preserved verbatim (string); `confidence_semantics="numeric_score_0_100_source_native"`; `confidence_class_native is None`; values outside documented range (e.g. 101) either rejected with error or accepted with explicit warning recorded in validation report — never silently clamped; no `confidence_0_100` attribute exists on the output object.
- **Automation:** Auto: `tests/test_mapping.py::test_modis_confidence_semantics_numeric` · **Status:** Not executed here

## BE-TC-087 — VIIRS confidence retained as categorical class, kept separate from MODIS
- **Type / Priority:** Science / P0 · **Refs:** METH §3, §5; FR-03; VAL §5
- **Steps:** `map_row` VIIRS rows with `confidence="n"`, `"l"`, `"h"`, `"N"` (mixed case), `"medium"`
- **Expected:** `confidence_raw` verbatim; `confidence_semantics="categorical_class_source_native"`; `confidence_class_native` = raw value; **no** numeric conversion; cross-sensor comparisons never consume this field arithmetically.
- **Automation:** Auto: `tests/test_mapping.py::test_viirs_confidence_semantics_categorical_kept_separate` · **Status:** Not executed here

## BE-TC-088 — Confidence vocabulary out-of-range is flagged, not extrapolated
- **Type / Priority:** DataIntegrity / P1 · **Refs:** PIPE §6; D-16
- **Steps:** MODIS `confidence="abc"`, `"999"`, `""`; VIIRS `confidence="xyz"`
- **Expected:** MODIS non-numeric → validation error or null with warning; out-of-range numeric → warning recorded (docs: "Confidence values match source-specific allowed semantics"); VIIRS unknown class → preserved with warning; never mapped onto another scale.
- **Actual (code review):** no range/allowed-value check exists at all; `confidence="999"` flows straight into exports.
- **Status:** Code-review finding — D-16

## BE-TC-089 — Native brightness / FRP / daynight preserved; missing stays null
- **Type / Priority:** Functional / P0 · **Refs:** METH §5; DATA_DICT §2
- **Steps:** map rows with full set; map rows missing `brightness`, `frp`, `daynight`, `bright_ti4`, `scan`, `track`; inspect nulls
- **Expected:** present values parsed as float; missing → `None` (never `0`); `brightness` → `brightness_primary_native`; `bright_ti4` → `brightness_secondary_native` (current mapping) or reconciled per product guide (D-26); `daynight_native` verbatim.
- **Automation:** Auto: `tests/test_mapping.py::test_native_fields_preserved_and_timestamp_normalized` · **Status:** Not executed here

## BE-TC-090 — UTC normalization preserves native date/time strings
- **Type / Priority:** Boundary / P0 · **Refs:** METH §5; ARCHITECTURE §6
- **Steps:** `acq_date=2024-02-01, acq_time=325` → `acquired_at_utc == 2024-02-01T03:25:00+00:00`; `acq_time=None` → 00:00; `acq_date=2024-02-30` → raise; native fields echoed unchanged
- **Expected:** tz-aware UTC datetime; `acq_date_native`/`acq_time_native` stored verbatim; midnight boundary correct.
- **Automation:** Auto: `tests/test_mapping.py::test_acq_time_padding`, `test_native_fields_preserved_and_timestamp_normalized` · **Status:** Not executed here

## BE-TC-091 — `acq_time` silent truncation (5+ digits) is rejected
- **Type / Priority:** Boundary / P0 · **Refs:** PIPE §6; D-14
- **Steps:** `acq_time="12345"`, `"012345"`, `"-100"`, `"24:30"`
- **Expected:** raise `ValueError` (or strict regex `^[0-9]{1,4}$` + range check 00:00–23:59); the 5-digit case must not become 12:34.
- **Actual (code review):** `zfill(4)` + fixed slices discard the tail silently (see BE-TC-082).
- **Status:** Code-review fail — D-14

## BE-TC-092 — Fingerprint is deterministic, sha256-scoped, product+version aware
- **Type / Priority:** DataIntegrity / P0 · **Refs:** DATA_DICT §4; METH §6; PIPE §5
- **Steps:** same row twice → equal fingerprint; across `product_id` → differ; across `collection_version` → differ; column order shuffled → equal (sorted keys); coordinate changed → differ
- **Expected:** `sha256-v1:<hex64>`; identical inputs ⇒ identical fingerprint on every platform/architecture; product/version scoping per dictionary.
- **Automation:** Auto: `tests/test_mapping.py::test_fingerprint_deterministic_and_product_scoped` · **Status:** Not executed here

## BE-TC-093 — Fingerprint is not derived from coordinates alone
- **Type / Priority:** Science / P1 · **Refs:** DATA_DICT §4
- **Steps:** two rows identical except `acq_time`; two rows identical except `confidence`; compare fingerprints
- **Expected:** all differ (full-row hash); no collision from coordinate pair reuse.
- **Status:** Not executed (implicitly covered by algorithm — explicit assertion recommended)

## BE-TC-094 — `observation_id = uuid5(fingerprint)` is stable but not snapshot-scoped
- **Type / Priority:** DataIntegrity / P1 · **Refs:** PIPE §5; D-12
- **Steps:** map same source row under two different `source_snapshot_id` values; compare `observation_id`
- **Expected (spec decision):** either `observation_id` includes snapshot lineage (so distinct snapshots coexist) or duplicates are **reported** with a reconciliation step — never silently `INSERT OR IGNORE`d.
- **Actual (code review):** identical `observation_id` → cross-snapshot rows vanish (see BE-TC-076).
- **Status:** Code-review fail — D-12

## BE-TC-095 — Deduplication is exact-text only, within one snapshot
- **Type / Priority:** Functional / P0 · **Refs:** METH §6; PIPE §6
- **Steps:** rows equal in all mapped fields → 1 dup; rows differing only in an unmapped attribute → kept separate (fingerprint uses raw row incl. unmapped keys); near-neighbor cross-sensor rows → both kept
- **Expected:** dup counting correct; cross-sensor never deduped; `deduplicate` returns count of dropped rows.
- **Automation:** Auto: `tests/test_mapping.py::test_deduplicate_exact_only_within_snapshot` · **Status:** Not executed here

## BE-TC-096 — Platform vocabulary: aliases resolve, unknowns pass through verbatim
- **Type / Priority:** Functional / P1 · **Refs:** METH §3; D-26
- **Steps:** `suomi-npp|S-NPP|SNPP|s-npp` → `Suomi-NPP`; `noaa-20|noaa20` → `NOAA-20`; `Aqua`/`Terra` unchanged; `"N"` → currently `"N"` (see BE-TC-084); `"Suomi NPP"` → unchanged (documented decision or add alias)
- **Expected:** documented controlled vocabulary; unmapped values preserved verbatim **and flagged** for review — never error-free silent pass-through for known-alias families.
- **Automation:** Auto: `tests/test_mapping.py::test_platform_vocabulary` (aliases only) · **Status:** Not executed here

## BE-TC-097 — Unsupported sensor rejected with allowed list in message
- **Type / Priority:** Negative / P1 · **Refs:** PIPE §2
- **Steps:** `normalize_sensor("LANDSAT")`, `"modis "`, `""`
- **Expected:** `ValueError`; message lists supported values; whitespace trimmed.
- **Automation:** Auto: `tests/test_mapping.py::test_sensor_unsupported` · **Status:** Not executed here

## BE-TC-098 — Unmapped native columns land in `source_attributes` (authoritative preservation)
- **Type / Priority:** Functional / P1 · **Refs:** METH §5; DATA_DICT §2
- **Pre:** row with extra column `instrument_custom="x"` and missing `bright_ti4`
- **Steps:** map; inspect `source_attributes`
- **Expected:** `{"instrument_custom":"x"}` present; **also** `{"bright_ti4": None}` present (current) — see BE-TC-099; no native value dropped without trace; snapshot mapping version recorded (`normalization_version=canonical-v1`).
- **Status:** Not executed

## BE-TC-099 — Missing mapped columns are recorded as explicit nulls (not silently indistinguishable)
- **Type / Priority:** DataIntegrity / P2 · **Refs:** DATA_DICT §1 ("Null means unknown/not supplied"); D-18
- **Steps:** map row lacking `bright_ti4`; inspect `source_attributes`
- **Expected (spec):** distinguish "source supplied null" from "field absent from product"; at minimum document the convention; ideally absent columns logged, present-but-null kept.
- **Actual (code review):** absent mapped columns are injected into `source_attributes` as `None` — indistinguishable from a source-supplied null; minor but real ambiguity in an audit.
- **Status:** Code-review finding — D-18 (low)

## BE-TC-100 — `frp_mw` / `frp_unit_native` are never fabricated
- **Type / Priority:** Science / P0 · **Refs:** DATA_DICT §2; METH §5; D-17
- **Steps:** map a full FIRMS MODIS row without unit metadata; inspect canonical row and export manifest/units
- **Expected:** `frp_mw is None`, `frp_unit_native is None` (or `"unit_not_supplied"`), guidance references source docs; no silent Watts→MW conversion with undocumented factor.
- **Status:** Not executed (behaviour correct by default; needs regression guard + explicit `frp_unit_native="MW?"` decision in docs)
