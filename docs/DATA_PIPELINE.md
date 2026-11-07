> **Scope superseded 2026-11-06 (ADR-012):** the active configuration is Bangladesh national bbox (`bangladesh-bd`), Standard `MODIS_SP` + `VIIRS_SNPP_SP`, fixed window 2010-01-01 → 2026-07-31. “24-month prototype” below is historical and must not be used as current scope; the national bbox is not an authoritative boundary and missing records are not verified zero detections. See `docs/DECISIONS.md` ADR-012 and `DATA_SOURCE_REGISTER.md` §10.

# Data Pipeline and Ingestion Specification

## 1. Goal

Create a repeatable, auditable pipeline for the registered Bangladesh bbox and frozen 2010-01-01–2026-07-31 Standard-product snapshot. Validate selected NASA FIRMS products, preserve raw sources, and produce canonical observations and a monthly sensor-specific calendar. Current loaded snapshots and remaining pipeline gaps are recorded in `docs/STATUS.md` and `docs/SOURCE_DATA_COVERAGE_REPORT.md`.

## 2. Source selection

Primary provider: NASA FIRMS.

Sources to evaluate:
- FIRMS active-fire product and product documentation pages.
- FIRMS archive download for historical data.
- FIRMS API area service for supported bounded queries.
- FIRMS [data-availability](https://firms.modaps.eosdis.nasa.gov/api/data_availability/) and [missing-data](https://firms.modaps.eosdis.nasa.gov/api/missing_data/) services for source-service date context.

### Product selection

Candidate initial products include MODIS Collection 6.1 and VIIRS 375 m products for Suomi-NPP, NOAA-20, and NOAA-21 where the selected AOI/date range is available. Confirm exact product identifiers and versions against the current FIRMS service at implementation time.

The currently registered snapshot is frozen by ADR-012 at 2010-01-01 through 2026-07-31 for `MODIS_SP` and `VIIRS_SNPP_SP`. Do not apply the superseded 24-month prototype cap or silently change the registered dates. For a future re-freeze, query product availability and inspect archive metadata, choose a documented common Standard-product window, and record the decision and exact dates in the manifest. Product-date availability is not proof of clear-sky observation coverage.

### Standard versus NRT

For historical/scientific analysis, prefer standard science-quality products when available. FIRMS notes that NRT records are replaced with standard data as the archive is updated; the lag can be several months. If NRT is used for recent periods, label it as provisional and preserve the retrieval date. Do not silently mix NRT and standard records in one trend without accounting for processing level and version.

## 3. Ingestion modes

### Historical ingestion

- Use the registered FIRMS Area API workflow for the national prototype snapshot; do not request the full archive back to product start dates.
- Restrict downloads to the exact registered AOI, products, and dates. A new date window or sensor requires an explicit scope/register update.
- Partition retrievals by product and manageable time windows.
- Preserve the original downloaded artifact and checksum.
- Store the exact archive request or selection metadata.

### Recent data ingestion

- Use the appropriate FIRMS API product/source for current or recent observations.
- Respect documented day-range and transaction limits.
- Retry transient failures with bounded exponential backoff.
- Do not retry invalid credentials or invalid product/parameter combinations indefinitely.
- Record the time the request was made and the time of the latest source data returned.

The Area API supports bounded day-range queries and requires a FIRMS MAP_KEY. Check the live API documentation before deciding batch sizes or request scheduling.

## 4. Ingestion run manifest

One manifest per run should record:

```json
{
  "ingestion_run_id": "generated-id",
  "provider": "NASA FIRMS",
  "source_endpoint_or_archive": "exact-source-reference",
  "product_id": "exact-product-id",
  "processing_level": "standard-or-nrt",
  "collection_version": "exact-version-or-null",
  "aoi_id": "aoi-reference",
  "requested_start_utc": "ISO-8601-or-null",
  "requested_end_utc": "ISO-8601-or-null",
  "retrieved_at_utc": "ISO-8601",
  "source_file": "relative-path",
  "sha256": "checksum",
  "row_count": 0,
  "validation_status": "pending|passed|warning|failed",
  "code_revision": "git-commit",
  "config_hash": "hash",
  "documentation_url": "URL",
  "documentation_checked_at": "ISO-8601"
}
```

The values above are illustrative schema placeholders, not real source results.

## 5. Idempotency and safety

- Re-running an identical request should not multiply canonical records.
- Use source snapshot IDs, content hashes, and a deterministic fingerprint to detect exact repeated ingestion.
- Do not mutate the original file.
- If source data are revised, ingest as a new snapshot and explicitly reconcile downstream products.
- Use atomic writes so partially downloaded files cannot be mistaken for complete data.
- Avoid logging API keys or complete secret-bearing request URLs.
- Validate date ranges, AOI bounds, product IDs, and maximum request sizes.

## 6. Validation checks

At minimum:

### File/schema checks
- File exists, is non-empty, and is parseable.
- Expected header/columns are present for the selected source product.
- Types can be parsed without silent coercion of invalid values.
- Unexpected columns are preserved or reported; do not simply discard them.

### Row checks
- Latitude in [-90, 90], longitude in [-180, 180].
- Acquisition date/time valid and convertible to UTC under documented rules.
- Numeric source fields are within plausible/documented ranges; do not apply arbitrary caps.
- Confidence values match source-specific allowed semantics.
- FRP/brightness units are verified before conversion.
- Missingness is summarized by field and product.
- Exact duplicate rows are detected under a documented scope.

### Coverage checks
- Requested range versus returned dates is reported.
- Product availability/missing-data records are checked where possible and stored as source-service evidence. These checks do not prove valid-pixel/clear-sky observation opportunities.
- An empty result is labeled as no source records returned with observation coverage unknown unless independent coverage evidence supports a verified zero.
- Partial downloads or API errors are surfaced.

## 7. Transformation stages

1. `raw`: unchanged input source artifact.
2. `validated`: source rows plus validation report, still source-faithful.
3. `canonical`: mapped fields plus all native fields/provenance.
4. `derived`: calendar aggregates, baselines, hotspot groups, anomalies.

Never overwrite one stage with another. Every stage includes run ID and method/mapping version.

## 8. Recommended demo-data strategy

Current prototype data is the one Bangladesh task-specified national bounding box and the frozen 2010-01-01–2026-07-31 Standard-product snapshot defined by ADR-012. The Sundarbans and 24-month strategy below are superseded historical planning, not current ingestion instructions. Keep the source snapshot frozen and preserve its manifest/checksum; keep large raw files outside Git and commit only small reviewed fixtures. Any boundary, product, or date-window change needs a documented scope decision and validation rerun.

## 9. Reconciliation and reprocessing

When a source snapshot changes:
- compare source version, date coverage, row count, and hashes;
- identify affected canonical rows and derived outputs;
- rebuild derived datasets from the new snapshot using an explicit method version;
- retain the prior output and lineage for reproducibility;
- document why values changed.

## 10. Pipeline outputs

Required outputs for a successful P0 run:
- raw data files;
- ingestion manifest;
- validation report;
- canonical observations;
- source-data availability/gap report with limits;
- calendar aggregate dataset;
- method/metadata manifest;
- automated test result summary.

## 11. Operational error behavior

Represent source unavailability, API throttling, invalid keys, malformed responses, no data, and partial data as different outcomes. Never turn an ingestion failure into an empty successful dataset. Use bounded retries and provide a human-readable error with the run ID.
