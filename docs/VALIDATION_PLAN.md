# Validation Plan

## 1. Purpose

Validation determines whether EMBERLENS is technically correct, scientifically defensible, and useful for the 2026 challenge. A passing unit-test suite alone does not validate the scientific interpretation. The first prototype uses one AOI and no more than 24 months of fixed source data; it demonstrates a workflow and does not establish a long-term climatology or robust anomaly baseline.

## 2. Validation layers

1. Source fidelity and ingestion.
2. Canonical schema and provenance.
3. Sensor-aware harmonization.
4. Calendar and historical aggregation.
5. Coverage/missing-data behavior.
6. Optional hotspot grouping.
7. Baseline/anomaly analysis.
8. API/export consistency.
9. UI usability and communication.
10. Reproducibility and competition demonstration.

## 3. Source-data validation

For each selected FIRMS product/version:
- Compare downloaded schema and fields against the current NASA product guide.
- Confirm product, platform, processing level, temporal coverage, and units.
- Compare a sample with the official source/API or archive artifact.
- Check date continuity within the fixed window, source-service missing dates, coordinate ranges, nulls, invalid types, and duplicates. Do not interpret an available source date as proof of valid clear-sky observations.
- Verify time parsing and UTC handling, including midnight boundaries.
- Preserve and verify checksums for raw files.

**Pass evidence:** data-source register, sample comparison report, raw manifest, schema test output, and documented discrepancies.

## 4. Provenance validation

- Every canonical row maps to one source snapshot and source fingerprint/row.
- Every derived calendar aggregate identifies its AOI, interval, sensors/products, source snapshots, and method version.
- Export metadata matches the data shown in the UI.
- Reprocessing creates a traceable new result rather than silently overwriting the old one.

**Pass evidence:** automated lineage tests and a sample trace from one UI calendar cell back to raw rows.

## 5. Harmonization validation

### Required checks
- Source fields mapped to canonical fields without losing native values.
- Confidence semantics retained independently by product.
- Unit conversions tested against source definitions.
- Exact duplicate handling tested within source scope.
- Nearby cross-sensor detections remain separate source observations.
- Cross-sensor derived comparisons explicitly define assumptions and limitations.

### Overlap-period analysis

Use temporal overlap between selected sensors/products. Compare sensor-specific counts/distributions by common AOI and bins. Investigate whether differences reflect resolution, detection characteristics, coverage, product version, or real temporal/spatial variation. Do not claim validation based only on visually similar charts.

### Sensitivity analysis

Test candidate comparison results under alternative time bins, spatial aggregation resolutions, confidence filters (native semantics), and overlap periods. Record material changes and avoid a single result if the conclusion is unstable.

**Pass evidence:** source mapping tests, overlap analysis, sensitivity report, and approved methodology record.

## 6. Calendar validation

Construct a small hand-checkable fixture with known source rows and expected period buckets.

Test:
- AOI inclusion boundaries;
- start-inclusive/end-exclusive interval behavior;
- timezone conversions;
- leap days and month/year boundaries;
- sensor and platform partitioning;
- count unit consistency;
- duplicate policy;
- periods with detections;
- periods with no source rows and unknown observation coverage;
- source-service gaps and unavailable periods;
- verified zero-detection periods only when independent valid-observation coverage evidence exists.

**Pass evidence:** deterministic unit tests and a fixed data snapshot whose calendar output is reproducible.

## 7. Historical and baseline validation

- Verify each period's aggregation against a separate simple reference calculation.
- Check sample-size sufficiency and valid coverage.
- Avoid comparing a target period against a baseline that includes it unless that inclusion is intentional and disclosed.
- Stratify by sensor/product when measurements are not calibrated.
- Test robustness to alternative baseline windows and statistics.

**Pass evidence:** notebooks or scripts are acceptable as analysis artifacts, but final production methods must be reproducible in the application pipeline and have written conclusions.

## 8. Anomaly validation

- Use time-aware splits; never randomly shuffle time-series rows for forecasting-like validation.
- Compare candidate anomaly method with a simple seasonal reference.
- Evaluate false flags and missed high-activity periods by inspecting actual evidence.
- Check zero inflation, skew, outliers, missingness, and unequal observation opportunities.
- Show the reference period, actual observation, expected distribution/range, method, and coverage to users.

A high score is not meaningful if it is uncalibrated. Do not report anomaly “accuracy” without a defensible labeled reference.

## 9. Hotspot grouping validation (if built)

- Confirm temporal/spatial threshold rationale.
- Test dense and sparse regions.
- Test transitive-chain failures and separate nearby activity.
- Run sensitivity tests across parameters.
- Inspect cases with both MODIS and VIIRS detections.
- Verify that every group member links to source records.
- Label results as algorithmic groups, not confirmed fire incidents.

## 10. API and export validation

- Schema validation for every response/export type.
- Pagination and filter tests.
- GeoJSON coordinate order and CRS tests.
- CSV encoding, quoting, null, date/time, and numeric precision checks.
- Metadata sidecar completeness.
- Export row counts match API filters and UI preview.
- Failure and empty-result behavior are distinct.

## 11. Frontend/usability validation

Conduct task-based tests with team members or target users:
- open the configured demo AOI;
- identify which sensors/products contribute;
- interpret a monthly calendar period;
- distinguish no source records from independently verified zero detections;
- describe a high-count month without presenting it as a validated anomaly or emergency;
- download a dataset and locate its methodology metadata.

Record confusion points, time-to-task if measured, and changes made. Do not fabricate user-testing results.

## 12. Reproducibility test

From a clean environment:
1. install documented dependencies;
2. load the fixed raw sample/snapshot;
3. run validation and canonical processing;
4. generate calendar and supporting outputs;
5. compare checksums or deterministic row/value comparisons with the recorded expected output;
6. start the application and complete the demo flow.

If outputs differ due to nondeterministic behavior or source revision, explain and version the cause.

## 13. Release gate for a competition demo

Must pass:
- P0 source ingestion and provenance;
- P0 monthly calendar correctness and source-status semantics for the fixed window of at most 24 months;
- sensor distinctions and methodological disclosure;
- export metadata and consistency;
- application starts reliably from documented steps;
- demo can be repeated from a frozen source snapshot;
- no fabricated statistics, multi-decade history claims, robust-baseline claims from only two years, or unvalidated prediction claims.

A feature that does not pass its validation gate must be disabled, labeled experimental, or removed from the competition demo.
