# 05 — Exports and metadata manifest

Endpoint: `POST /api/v1/exports` · Service: `exports/exporter.py`

Manifest requirements (API §8): project/schema/version, creation time, AOI+CRS, range/tz, filters, snapshots+versions, method versions, units, count unit, coverage method, NASA attribution, limitations.

---

## BE-TC-053 — Observations CSV export round-trips and carries manifest
- **Type / Priority:** Functional / P0 · **Refs:** FR-09; API §7, §8; VAL §10
- **Pre:** ENV-2 seeded
- **Steps:** `POST /api/v1/exports` `{"dataset_type":"observations","format":"csv","sensors":["VIIRS"]}`; save body; parse with `csv`; locate manifest
- **Expected:** 200; `Content-Disposition: attachment; filename=emberlens-observations.csv`; media type `text/csv`; first line(s) parse as CSV (header + N rows) then a `# metadata_manifest: {…}` line; row count equals filtered total; columns include canonical + key native fields; manifest contains `project`, `schema_version`, `dataset_type`, `created_at_utc`, `crs=EPSG:4326`, `filters`, `source_snapshots` with `sha256`, `method_version`, `normalization_version`, `source_attribution` containing NASA FIRMS, and `limitations` (must include "not confirmed wildfires" and coverage-unknown wording).
- **Automation:** Auto: `tests/test_api.py::test_export_csv_direct_with_manifest` · **Status:** Not executed here

## BE-TC-054 — CSV manifest line is not valid CSV and breaks naive parsers
- **Type / Priority:** Functional / P1 · **Refs:** API §8; VAL §10 (CSV encoding/quoting); D-07
- **Steps:** `csv.DictReader(io.StringIO(body))` on the CSV export; inspect last record
- **Expected (spec):** sidecar or embedded manifest parseable by the documented contract, or a separate manifest section/field with an unambiguous separator.
- **Actual (code review):** manifest is appended as `# metadata_manifest: {json with commas, quotes}\n` — a single unquoted field containing commas; `csv.DictReader` yields a row with one column; downstream pandas/Excel see a ragged final row or a shifted column count. Also **empty export** (`to_csv([])` → `""`) suppresses the manifest line entirely (see BE-TC-061).
- **Status:** Raw API wire-format issue remains (D-07); the frontend download path strips the trailing comment from the CSV body and provides the parsed manifest as a separate `.metadata.json` sidecar. BrowserOS round-trip passed for 893 filtered VIIRS rows on 2026-11-08. Direct API consumers still need to parse the manifest comment or request JSON/GeoJSON.

## BE-TC-055 — JSON export embeds `metadata_manifest` beside `data`
- **Type / Priority:** Functional / P1 · **Refs:** API §8; VAL §10
- **Steps:** same request with `format=json`; `json.loads` body; check keys `data`, `metadata_manifest`
- **Expected:** valid JSON; arrays aligned; manifest identical in content to CSV/GeoJSON manifests for same filters; no `NaN`/`Infinity` unflagged (JSON spec forbids them — enforce strict).
- **Status:** Not executed

## BE-TC-056 — GeoJSON export is RFC 7946: Point, [lon, lat], properties complete
- **Type / Priority:** Functional / P0 · **Refs:** API §6; ARCHITECTURE §6; VAL §10
- **Steps:** `format=geojson`; verify `type=FeatureCollection`; each feature `geometry.type=Point`; `coordinates == [longitude, latitude]`; `properties` includes `latitude`,`longitude`; `metadata_manifest` embedded at top level
- **Expected:** coordinates lon-first; properties contain all row fields incl. native; no validation errors from a strict GeoJSON parser.
- **Automation:** Auto: `tests/test_api.py::test_export_geojson` · **Status:** Not executed here

## BE-TC-057 — GeoJSON export for `dataset_type=calendar` returns None instead of crashing
- **Type / Priority:** Negative / P0 · **Refs:** API §7; D-09
- **Pre:** calendar_aggregate rows exist (call `GET /api/v1/calendar` once, or in scratch ENV-1)
- **Steps:** `POST /api/v1/exports` `{"dataset_type":"calendar","format":"geojson","aoi_id":"demo-aoi"}`
- **Expected (spec):** either 4xx `UNSUPPORTED_COMBINATION` with a clear message, or a valid GeoJSON (e.g. with null geometry or a documented "no geometry — aggregate rows" mode).
- **Historical actual (2026-11-06, before D-09 fix):** calendar rows had no `longitude`/`latitude`; `to_geojson` raised an uncaught `KeyError` and returned HTTP 500.
- **Current actual:** the API returns HTTP 422 `UNSUPPORTED_COMBINATION` in the standard error envelope, including `request_id` and `X-Request-ID`.
- **Automation:** `tests/test_api.py::test_calendar_geojson_export_is_rejected_with_error_envelope` · **Status:** Automated pass

## BE-TC-058 — Calendar export honours `start`/`end`/`sensors`… or rejects them
- **Type / Priority:** Functional / P1 · **Refs:** API §7; D-08
- **Pre:** two calendar rows for aoi in different months; one calendar call made earlier with overlapping range
- **Steps:** `POST /api/v1/exports` `{"dataset_type":"calendar","format":"json","aoi_id":"demo-aoi","start":"2024-02-01","end":"2024-03-01","sensors":["VIIRS"]}`
- **Expected (spec):** only rows matching the requested range and filters are exported, and manifest echoes exactly what was exported.
- **Actual (code review):** `db.list_calendar(aoi_id)` ignores `start`, `end`, `sensors`, `platforms`, `products` entirely; filters are echoed into the manifest without being applied — manifest claims a restriction that was not enforced. Also the rows returned include **everything ever inserted** by previous GET /calendar calls (cross-window leakage).
- **Status:** Executed 2026-11-06 — **FAIL**: VIIRS-only Feb 2024 request returned **72 rows**; filters ignored (D-08)

## BE-TC-059 — Observations export is silently capped at 1,000 rows
- **Type / Priority:** Boundary / P1 · **Refs:** API §7 ("bounded export … direct when measured size reasonable"); VAL §10; D-05/D-10
- **Steps:** seed >1000 synthetic observations (scratch); export observations with no filters; count rows in output; compare to SQL `count(*)`
- **Expected:** either full export (bounded demo max is ~2k rows) or an explicit truncation marker + `row_count` + `truncated: true` in manifest; never a silent cut.
- **Actual (code review):** `page_size=1000` hard-coded; manifest `row_count=len(rows)` reports 1000 as if it were the total; no truncation flag.
- **Status:** Code-review fail — D-10

## BE-TC-060 — Observations export ignores `aoi_id` (global export masquerades as AOI export)
- **Type / Priority:** Security / P0 · **Refs:** API §3, §7; D-10
- **Steps:** seed one synthetic row outside the AOI (0,0); export with `aoi_id=demo-aoi`; count rows / check manifest AOI
- **Expected (spec):** export scoped to AOI, or aoi_id rejected; manifest names the actual geometry.
- **Actual (code review):** `req.aoi_id` only drives `get_aoi` for the manifest label; `query_observations(...)` receives no AOI predicate → out-of-AOI rows included while manifest claims `"aoi":{"aoi_id":"demo-aoi", …}`.
- **Status:** Code-review fail — D-10

## BE-TC-061 — Zero-row export: status, empty body vs manifest
- **Type / Priority:** Negative / P1 · **Refs:** VAL §10 ("Failure and empty-result behavior are distinct"); D-06
- **Steps:** filters matching nothing (`sensors=["VIIRS"], products=["NOPE"]`); formats csv/json/geojson
- **Expected:** 200 with a well-formed empty payload **and** complete manifest (row_count=0) — or a documented 4xx/204; never a silent empty body.
- **Actual (code review):** `to_csv([])` → `""`; `if payload:` fails → manifest line omitted; client receives HTTP 200, `text/csv`, zero bytes, no metadata, no indication whether filters matched nothing or the pipeline broke.
- **Status:** Executed 2026-11-06 — **HTTP 200 with zero bytes**, no manifest, `text/csv; charset=utf-8` (D-06)

## BE-TC-062 — Manifest is complete per API §8 for every format
- **Type / Priority:** Functional / P0 · **Refs:** API §8
- **Steps:** generate manifest (via CSV/JSON/GeoJSON) for observations and calendar; assert keys: `project`, `schema_version`, `dataset_type`, `created_at_utc`, `aoi` (or explicit null), `date_range`, `time_zone`, `filters`, `row_count`, `method_version`, `normalization_version`, `crs`, `units` (coordinates/counts/frp), `coverage_method`, `source_attribution`, `limitations`, plus snapshots with `sha256`, `source_endpoint`, `product_id`, `collection_version`, `processing_level`, `retrieved_at_utc`; and for calendar exports `count_unit`.
- **Expected:** all present; `limitations` non-empty and free of marketing language; attribution cites NASA FIRMS.
- **Status:** Not executed (checklist case)

## BE-TC-063 — Manifest units: FRP unit declared, never silently "MW"
- **Type / Priority:** Science / P1 · **Refs:** METH §5; DATA_DICT §2 (`frp_unit_native`); D-17
- **Steps:** inspect `units` in manifest; export observations; check `frp_unit_native` column
- **Expected:** manifest says FRP is "as supplied by source; see frp_unit_native" (or nothing); `frp_mw` remains null unless a documented conversion was applied; no invented unit.
- **Status:** Not executed

## BE-TC-064 — Export count (`row_count`) equals rows actually serialized
- **Type / Priority:** DataIntegrity / P0 · **Refs:** VAL §10; FR-09
- **Steps:** for each format, compare manifest `row_count` with `csv.DictReader` rows / `len(json.data)` / `len(geojson.features)`
- **Expected:** exact equality for every format and for empty set.
- **Status:** Not executed

## BE-TC-065 — CSV encoding, quoting and null handling
- **Type / Priority:** Functional / P1 · **Refs:** VAL §10
- **Steps:** rows containing commas/quotes/newlines in `source_attributes`; null FRP; UTF-8 names in AOI name; CRLF vs LF line endings
- **Expected:** RFC 4180-ish output; UTF-8 (no BOM unless documented); nulls as empty (not `null` string) or documented sentinel; multiline fields quoted; round-trip via `csv` matches.
- **Status:** Not executed

## BE-TC-066 — CSV cannot be formula-injected (Excel/Sheets)
- **Type / Priority:** Security / P1 · **Refs:** API §10; D-27
- **Pre:** a synthetic row whose `name`/`notes`-like field begins with `=`, `+`, `-`, `@` (e.g. AOI name from an upload — if ever supported)
- **Steps:** export CSV; inspect first cell of each row
- **Expected:** cells prefixed with `'` or wrapped so spreadsheets do not execute; or manifest documents the risk; never raw `=cmd|' /C calc'!A0`.
- **Status:** Not executed (no user-controlled AOI name today; keep as regression guard)

## BE-TC-067 — GeoJSON properties exclude nothing required for provenance
- **Type / Priority:** Functional / P2 · **Refs:** API §6; VAL §10
- **Steps:** verify GeoJSON properties include `source_snapshot_id`, `source_row_fingerprint`, `product_id`, `collection_version`, `processing_level`, `confidence_raw`, `confidence_semantics`, `frp_native`, `acq_date_native`, `acq_time_native`
- **Expected:** full lineage survives the GeoJSON round-trip; a consumer can link every feature back to raw source.
- **Status:** Not executed

## BE-TC-068 — Manifest `date_range` reflects the export, not the request
- **Type / Priority:** DataIntegrity / P1 · **Refs:** API §8; D-08
- **Steps:** export calendar with no start/end; inspect `date_range`; export observations with range; inspect again
- **Expected:** manifest reports the actual span of included rows (or the explicit requested range, clearly labelled `requested_*`), never a plausible-looking wrong one.
- **Actual (code review):** manifest echoes `start`/`end` verbatim (nulls allowed) even when the returned rows cover all time — or nothing.
- **Status:** Code-review fail — D-08

## BE-TC-069 — Export of `dataset_type=calendar` requires `aoi_id`
- **Type / Priority:** Negative / P1 · **Refs:** API §7; D-09 adjacency
- **Steps:** `POST /api/v1/exports` `{"dataset_type":"calendar","format":"json"}` (no `aoi_id`)
- **Expected:** 422 `AOI_REQUIRED`; message says aoi_id is required for calendar exports; no server error.
- **Status:** Not executed (code path exists; correctness of message unverified)

## BE-TC-070 — Invalid export arguments are rejected before work
- **Type / Priority:** Negative / P1 · **Refs:** API §7, §9
- **Steps:** `dataset_type=parquet`; `format=xlsx`; `sensors=[123]`; `start=garbage`; `end<start`; oversized body (10 MB)
- **Expected:** 422 with stable code; pattern validation on `dataset_type`/`format` (Pydantic) fires first; no partial files/temp litter; no internal exception text.
- **Status:** Not executed
