# 14 — Defects and risks (backend)

Evidence tags: **[EX]** = executed and observed · **[CR]** = code review only (must be re-confirmed by execution before closure) · **[CLOSED]** = investigated and found not to be a defect.

Severity: **Blocker** (must fix before demo) · **Major** (fix before release/demo) · **Minor** (fix when convenient). Nothing here is a guess dressed as fact; where only [CR] exists, say so.

---

## D-01 — `/api/v1/data-sources` (and snapshots) leak absolute filesystem paths — CLOSED
- **Severity:** Major · **Evidence:** [EX] automated injection of a legacy absolute path and keyed URL through `/data-sources`; export provenance sanitization test · **Cases:** BE-TC-005, 006, 127 · **Refs:** API §1, §10
- **Impact:** could reveal machine paths and credentials embedded in older source URLs.
- **Fix:** new loads store basenames; data-source and export responses reduce legacy file URIs to basenames and redact MAP_KEY path or query values. Automated tests cover both URL forms. A full endpoint response sweep remains a separate release check.

## D-02 — Canonical 24-month window is rejected as too large
- **Severity:** Blocker · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-038
- **Observed:** `GET /calendar?start=2024-01-01&end=2026-01-01` and `…end=2026-01-01T00:00:00Z` ⇒ HTTP 422 `WINDOW_TOO_LARGE`; only `end=2025-12-31` (23 full months + tail) returns 24 bins.
- **Root cause:** `month_span = (end.year-start.year)*12 + (end.month-start.month) + 1` (double-counts exclusive end).
- **Fix:** `len(month_bins(start, end)) > 24` or correct month arithmetic; add regression test for exactly-24 bins.
- **Impact:** the documented prototype window cannot be queried through the public API.

## D-03 — Calendar provenance includes unrelated snapshots [CLOSED]
- **Severity:** Major · **Evidence:** [EX] 2026-11-07, current API suite · **Cases:** BE-TC-051, `test_calendar`, `test_calendar_honors_sensor_filter` · **Refs:** METH §14, VAL §4
- **Observed:** each calendar month carries only snapshot IDs from its returned observation rows; top-level provenance is derived from the filtered response rows.
- **Resolution:** closed by month-specific and filtered provenance generation. Empty bins carry an empty snapshot list.

## D-04 — FIRMS missing-day evidence is not consulted by `/calendar` [CLOSED]
- **Severity:** Major · **Evidence:** [EX] 2026-11-07, synthetic route tests and national API report · **Cases:** BE-TC-046, `test_calendar_marks_firms_missing_day_as_partial_source_data` · **Refs:** METH §7.3, API §5
- **Observed:** registered SP missing-day records are passed to aggregation and mark the matching product/platform/month `partial_source_data`. A source-service `available` interval never turns an empty AOI-month into a verified zero.
- **Resolution:** closed for the registered global Standard missing-day evidence path. These rows remain global source-service evidence, not AOI-specific observation opportunity; unavailability statuses are not inferred from a broad available interval.

## D-05 — Snapshot-declared series with no matching rows are omitted [CLOSED]
- **Severity:** Major · **Evidence:** [EX] 2026-11-07 · **Cases:** BE-TC-049, `test_calendar_includes_registered_series_with_no_matching_observations` · **Refs:** VAL §6
- **Observed:** the calendar now includes a series when a registered source snapshot overlaps the requested dates, even if no matching observation rows are returned. Its bins have count 0, unverified coverage, and no fabricated contributing snapshot IDs.
- **Resolution:** closed for registered snapshot series. Availability-only evidence remains in `/api/v1/coverage`; it does not create a calendar series without a product snapshot identity.

## D-06 — Zero-row CSV export returns 200 with empty body and no manifest
- **Severity:** Major · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-061 · **Refs:** VAL §10
- **Observed:** `POST /exports {dataset_type:"observations",format:"csv",products:["NOPE"]}` ⇒ 200, `text/csv`, zero bytes.
- **Impact:** client cannot distinguish "no rows match" from "empty file because pipeline broke"; manifest lost.
- **Fix:** emit manifest even for empty sets (header + `# metadata_manifest` or sidecar), or 204 with documented contract.

## D-07 — CSV manifest appended as non-CSV line; breaks parsers
- **Severity:** Major · **Evidence:** [CR] · **Cases:** BE-TC-054 · **Refs:** API §8, VAL §10
- **Fix:** separate sidecar/download part, or valid trailing row in a documented single-column envelope, or JSON sidecar endpoint; never a ragged comment line.

## D-08 — Calendar export ignores `start`/`end`/`sensors`/… and leaks all stored aggregates
- **Severity:** Blocker · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-058, 064, 068 · **Refs:** API §7, §8
- **Observed:** request for VIIRS Feb-2024 calendar returned **72 rows** (3 series × 24 months) from all previously inserted aggregates; filters echoed in manifest but unapplied.
- **Impact:** silent over-disclosure of derived data; manifest misstates filters; repeated GET/Export calls make live DB dirtier each run.
- **Fix:** `list_calendar(aoi_id, start, end, sensors, platforms, products)` with SQL filtering; manifest reports applied filter set and row count.

## D-09 — `format=geojson` with `dataset_type=calendar` crashes with HTTP 500
- **Severity:** Blocker · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-057 · **Refs:** API §7
- **Observed:** uncaught `KeyError` in `to_geojson` (no `longitude`/`latitude` on aggregate rows); client gets `500 Internal Server Error` (not the documented envelope).
- **Fix:** reject the combination with 4xx `UNSUPPORTED_COMBINATION`, or emit a documented non-spatial GeoJSON (e.g. Features with null geometry and `properties`); add regression test.

## D-10 — Observations export silently capped at 1000 rows and ignores `aoi_id`
- **Severity:** Major · **Evidence:** [CR] + logic read; count not yet measured end-to-end on >1000 fixture · **Cases:** BE-TC-059, 060 · **Refs:** API §7
- **Impact:** incomplete export presented as complete; AOI-scoped claim false.
- **Fix:** page through full filtered set (bounded demo max ~2k); filter by AOI or reject `aoi_id`; report `truncated` flag if ever capped.

## D-11 — Same filename with changed content silently replaces previous snapshot; reload rewrites lineage
- **Severity:** Major · **Evidence:** [CR] · **Cases:** BE-TC-074, 077 · **Refs:** PIPE §5, §9
- **Impact:** old `sha256` vanished without record; run manifests no longer match DB; breaks "did this change?" and reconciliation.
- **Fix:** snapshot key = content hash (or id + hash compare with explicit conflict error); keep previous snapshot; reconcile derived outputs by method_version bump.

## D-12 — Cross-snapshot identical rows silently disappear (INSERT OR IGNORE on content-only id)
- **Severity:** Blocker · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-076, 094 · **Refs:** PIPE §5
- **Observed:** same synthetic file loaded under two names ⇒ `count_observations()` = **4**, expected 8; second snapshot shows `row_count=4`, contributes 0 rows; no warning.
- **Fix:** make `observation_id` unique per (source_snapshot_id, fingerprint), or report collisions loudly; add uniqueness constraint or explicit reconciliation step.

## D-13 — Mid-load failure leaves phantom snapshot (row_count set, zero observations)
- **Severity:** Blocker · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-075, 081 · **Refs:** PIPE §5, §11
- **Observed:** fixture with last-row `acq_time=9999` ⇒ `ValueError: Invalid acq_time` **after** `INSERT` into `source_snapshot`; DB retains snapshot `row_count=4` with **0** observations.
- **Fix:** single DB transaction around snapshot+observations; or two-phase (stage → validate → commit); or record failed run explicitly and roll back.

## D-14 — `acq_time` with >4 digits is silently truncated to HHMM
- **Severity:** Blocker (data corruption) · **Evidence:** [CR] · **Cases:** BE-TC-082, 091 · **Refs:** PIPE §6
- **Fix:** strict `^[0-9]{1,4}$` + HHMM range validation; raise otherwise.

## D-15 — Empty input file succeeds silently
- **Severity:** Major · **Evidence:** [CR] · **Cases:** BE-TC-078, 110 · **Refs:** PIPE §6, §11
- **Fix:** explicit `no_data` outcome; non-zero exit / exception for CLI; never `row_count=0` + success.

## D-16 — No semantic validation of confidence / FRP / brightness against product guides
- **Severity:** Major · **Evidence:** [CR] · **Cases:** BE-TC-088 · **Refs:** PIPE §6, VAL §5
- **Fix:** per-product allowed-value tables from NASA product guides; warn-and-log; never clamp silently.

## D-17 — FRP unit never populated; `frp_mw` always null without explicit "unit not supplied" signal
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-063, 100 · **Refs:** DATA_DICT §2, METH §5
- **Fix:** always set `frp_unit_native = "unit_not_supplied"` when unknown; document.

## D-18 — Missing mapped columns injected as `None` into `source_attributes`
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-099
- **Fix:** keep absent columns out of `source_attributes`; log them separately.

## D-19 — NaN/Infinity coordinate bypass — **CLOSED (not a defect)**
- **Severity:** n/a · **Evidence:** [EX] 2026-11-06 (BE-TC-103)
- **Outcome:** `not (min <= x <= max)` rejects NaN/Inf correctly; boundary ±90/±180 accepted. No code change.

## D-20 — Locked/binary `emberlens.duckdb` in repo root of backend; default test run fails
- **Severity:** Major · **Evidence:** [EX] 2026-11-06 · **Cases:** BE-TC-002, 149, 121 · **Refs:** README §5, .gitignore, VAL §12
- **Observed:** `pytest` cannot import `backend.app` — `duckdb.IOException: … emberlens.duckdb … used by another process (C:\Python315\python.exe PID 14692)`; with scratch `EMBERLENS_DB`, 38/38 pass. `.gitignore` lacks `*.duckdb`/`*.duckdb.wal`.
- **Fix:** never commit the DB/WAL; scratch DB path for tests; document `EMBERLENS_DB`; add `*.duckdb*` to .gitignore; make `create_app` lazy or the error message actionable.

## D-21 — Error envelope does not match API spec; no request_id — CLOSED
- **Severity:** Major · **Evidence:** [EX] automated contract tests across validation, routing, domain, and unexpected errors · **Cases:** BE-TC-125 · **Refs:** API §9
- **Fix:** Central exception handlers emit the documented top-level `error` envelope; each response has a unique body/header request ID. Unexpected failures return a generic message without leaking exception text.

## D-22 — `aoi_id` accepted and ignored on `/coverage` and `/observations` (and AOI export); filter semantics inconsistent
- **Severity:** Major · **Evidence:** [CR] · **Cases:** BE-TC-017, 018, 035, 060 · **Refs:** API §3
- **Fix:** single filter implementation; remove or enforce `aoi_id` everywhere; consistent case-sensitivity rule.

## D-23 — GET `/calendar` mutates `calendar_aggregate` on every call — CLOSED
- **Severity:** Major · **Evidence:** [CR] + automated tests · **Cases:** BE-TC-050, 119, 124 · **Refs:** ARCHITECTURE §9, API §2
- **Fix:** Calendar GET now computes rows without writing `calendar_aggregate`; calendar export independently recomputes and no longer depends on a previous GET. Automated tests assert both behaviors.

## D-24 — Any AOI present in DB is served; no configured-AOI allowlist enforced — CLOSED
- **Severity:** Major · **Evidence:** [EX] synthetic AOI injection and seven endpoint rejection assertions · **Cases:** BE-TC-015 · **Refs:** API §1, CLAUDE.md §3
- **Fix:** `EMBERLENS_AOI_IDS` is a server-side comma-separated allowlist (default `bangladesh-bd`). AOI listings are filtered, and every AOI-scoped query/export validates the ID against the allowlist and the database.

## D-25 — Filter parsing accepts empty tokens; case-sensitivity inconsistent
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-023, 024, 118 · **Refs:** API §3
- **Fix:** trim + reject empties; document case-insensitivity or strict enums with 4xx.

## D-26 — Real VIIRS SP layout not reconciled: `satellite="N"` unmapped; `brightness` missing ⇒ silent null-brightness; VIIRS ingest validation marked **failed**
- **Severity:** Blocker (for any real-data demo claim) · **Evidence:** [EX] data inspection + manifest `validation_status:"failed"` (`missing required columns: ['brightness']`, extra `['bright_ti4','bright_ti5',…]`) · **Cases:** BE-TC-083, 084, 096, 145 · **Refs:** PIPE §2, §6; METH §3
- **Why [EX]:** values were read from the real file (1,977 rows, sha256 `3bf8ad84…3653`); manifest defect confirmed on disk.
- **Fix:** map VIIRS SP (`bright_ti4` → primary, `bright_ti5` → secondary or explicit gap); map `satellite="N"` → `Suomi-NPP`; re-run validation to `passed`; document in manifest + DECISIONS; only then serve calendar from real snapshot.

## D-27 — CSV formula-injection not mitigated
- **Severity:** Minor (no untrusted input path today) · **Evidence:** [CR] · **Cases:** BE-TC-066
- **Fix:** prefix dangerous leading chars or quote-wrap; document residual risk.

## D-28 — No migration strategy for DuckDB schema
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-112
- **Fix:** Alembic or documented `schema_version` table + upgrade script; or freeze schema and note.

## D-29 — Calendar pulls all observations into Python for filtering
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-119
- **Fix:** SQL-side time/space filter when data grows beyond demo scale.

## D-30 — Naive vs aware timestamps at API boundary unpinned
- **Severity:** Minor · **Evidence:** [CR] · **Cases:** BE-TC-027, 122, 123, 152
- **Fix:** pin serialization to `Z` suffix UTC; test DST-irrelevant but leap month boundary cases.

## D-31 — Security headers / docs exposure not hardened; CORS wildcards with credentials
- **Severity:** Minor (local demo) · **Evidence:** [CR] · **Cases:** BE-TC-128, 130, 131
- **Fix:** proxy-set headers or explicit app config; disable `/docs` when exposed.

## D-32 — No rate limiting on expensive endpoints (calendar recompute, exports)
- **Severity:** Major (once deployed/exposed) · **Evidence:** [CR] · **Cases:** BE-TC-129 · **Refs:** API §10
- **Fix:** simple limiter (e.g. slowapi) + 429/`Retry-After`; or explicit local-only deployment statement.

## D-33 — No application-level structured logging (run IDs, counts)
- **Severity:** Major (ops/audit) · **Evidence:** [CR] · **Cases:** BE-TC-150 · **Refs:** PRD §9, PIPE §9
- **Fix:** `logging` with JSON formatter; `ingestion_run_id`/`request_id` on every line; never secrets.

---

## Release gate verdict (VAL §13 for competition demo)

**NOT READY FOR PUBLIC RELEASE.** D-01, D-02, D-03, D-04, D-05, D-06, D-08, D-09, D-12, D-13, D-14, D-15, D-21, D-23, D-24, and D-26 have been addressed in code and are covered by current evidence or tests. Remaining gates include final real-file/runtime reconciliation after a controlled API cutover, public hosting with persistent storage/TLS, and scientific validation boundaries recorded in `docs/STATUS.md`. The listener on port 8000 is stale and still returns 404 for `/api/v1/map-density`; the current container build is verified separately.

What is verified and should be preserved: no merged MODIS+VIIRS counts; boundary-inclusive point-in-polygon; empty bins labelled as unverified rather than "no fires"; snapshot-declared empty series visible; synthetic fixtures hand-checkable and explicitly labelled; count unit string explicit; row-level provenance (fingerprint, snapshot, normalization version); 67 automated tests pass as of 2026-11-07.

## Recommended fix order

1. Reconcile current API source with the running listener and verify it against the loaded national snapshot → local operational readiness.
2. Close remaining export traceability and security cases in the current suite → reusable data claim.
3. D-32 (rate limiting) and other deployment exposure controls → before any shared deployment.
4. Configure a public host, persistent storage, and TLS; then verify public health, data, and UI.
5. Complete scientific validation for boundaries, event grouping, baselines, and valid-observation opportunity before presenting those analyses as evidence.
