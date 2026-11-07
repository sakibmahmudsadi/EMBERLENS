# Scientific Methodology and Measurement Contract

**This document is a scientific design contract, not a statement that the methods have already been validated.** Every method marked *proposed* must be tested on the actual source products and demo AOI before being presented as a result. Current prototype scope is one task-specified Bangladesh bounding box and the fixed 2010-01-01–2026-07-31 source snapshot; it is not a complete 20-year record or a validated climatology.

## 1. Scientific objective

Construct a defensible historical burning-activity calendar from NASA MODIS and VIIRS active-fire observations. The application should support interpretation of spatial and temporal patterns while preserving the fact that each sensor is a measurement system with its own characteristics.

The core question is not “How many fires happened?” It is: **“What active-fire detections were recorded for this AOI, by which products and sensors, over what observation coverage, and how does the observed pattern compare with a defined historical reference?”**

## 2. What the source data represent

NASA FIRMS distributes active-fire / thermal-anomaly detections derived from satellite observations. A detection is not, by itself:

- proof of a wildfire;
- a confirmed incident or ignition point;
- a fire perimeter;
- a burned-area measurement;
- a direct measure of people or property at risk.

Detected thermal anomalies may include wildfires, agricultural burning, prescribed burns, gas flares, industrial heat sources, and other hot targets. Fires may be missed because of satellite overpass timing, cloud, smoke, canopy, fire size/temperature, or other observation/algorithm limitations.

Use the phrase **active-fire detection** or **hotspot observation** in data labels and primary UI copy.

## 3. Sensor differences are part of the data, not noise to erase

Important distinctions include:

- MODIS active-fire products have a nominal detection footprint around 1 km; VIIRS 375 m products resolve smaller and more spatially detailed thermal anomalies.
- Sensors/platforms have different overpass schedules and observation opportunities.
- Algorithms, channel characteristics, product versions, and confidence fields differ.
- More detections from VIIRS do not necessarily indicate more burning; the higher spatial resolution can detect smaller or more numerous hotspots.
- MODIS confidence is commonly expressed numerically on a 0–100 range; VIIRS confidence classes/values have different semantics depending on product. Do not map one to the other by a simple numeric conversion.

Sources: NASA FIRMS active-fire notes and attribute descriptions, plus NASA VIIRS product documentation. Review the exact standard-product documentation for every selected product/version.

## 4. Measurement layers

Keep these layers conceptually and physically separate:

1. **Source observation:** exactly what a source product reports, with native fields and lineage.
2. **Canonical observation:** a normalized representation that makes shared concepts queryable without erasing native fields.
3. **Sensor-stratified aggregate:** a count or statistic for one sensor/platform/product over a defined AOI and time bin.
4. **Cross-sensor comparison:** a documented comparison that uses overlap, coverage, and sensor characteristics.
5. **Fused indicator (optional):** a derived, validated index with an explicit formula, calibration period, uncertainty, and version.
6. **Hotspot group (optional):** an algorithmic spatial-temporal grouping of observations, not a confirmed fire incident.

Never collapse these layers into a single undifferentiated “fire count.”

## 5. Canonical normalization

Normalize only what is genuinely common:

- latitude/longitude into decimal degrees with validated ranges;
- acquisition timestamp into UTC while preserving native date/time fields;
- sensor/platform/product identifiers into controlled vocabularies while retaining source strings;
- physical units only where the source documentation defines the units;
- common schema types and missing-value representation;
- source snapshot, source file, source row/fingerprint, product version, and processing version.

Do not fabricate unavailable attributes. A missing FRP or confidence field remains null/unknown; it is not zero.

### Confidence rule

Store at least:
- `confidence_raw` (original value/string);
- `confidence_semantics` (e.g. numeric score, categorical class, or product-specific meaning);
- `confidence_native_label` where applicable;
- `confidence_mapping_version` only if a validated mapping is later introduced.

Do not create a universal `confidence_0_100` from incompatible native fields without independent calibration evidence.

## 6. Duplicate and overlap handling

A detection from one platform and a nearby detection from another platform may be separate measurements of the same burning activity. They are not automatically duplicate records. Repeated overpasses can also produce distinct records for a continuing thermal anomaly.

Rules:
- Preserve each source observation.
- Deduplicate exact repeated source rows within the same product/snapshot scope using a stable fingerprint and explicit rules.
- Do not deduplicate across sensors merely because coordinates/time are close.
- If cross-sensor linkage is implemented, record it as an association with distance/time evidence and a method version; do not delete either source row.
- Show overlap-period sensor outputs separately before proposing a combined index.

## 7. Building the burning-activity calendar

The calendar is the P0 analytical output.

### 7.1 Define the unit before counting

Every calendar output must declare:
- AOI geometry/version;
- temporal bin;
- sensor/product/platform set;
- source snapshot and product version;
- count unit;
- spatial inclusion rule;
- time basis;
- source-data status and its evidence/limits.

Prototype defaults: count source observation rows after exact duplicate removal within the same product/snapshot; keep counts separate by sensor/platform/product; use UTC month boundaries; include a point on the AOI boundary using a documented point-in-polygon rule; and apply no confidence filter by default. Preserve native confidence values. These rules produce comparable query structure, not physically equivalent measurements.

Prototype default: use a **month-by-year matrix** over the fixed snapshot. This is a descriptive calendar of returned source observations, not a validated seasonal normal. A date-specific detail view may show observations, but do not use fine daily bins to imply complete observation opportunities or absence of activity.

### 7.2 Show sensor-stratified results

Provide separate series/panels for MODIS and each relevant VIIRS platform/product. If a single combined visual is useful, it must retain sensor breakdown and an explanation of the aggregation. A visually unified calendar can still show separate measures in toggles, facets, or stacked categories; do not hide the differences.

### 7.3 Coverage is not optional

For each product and period, capture source-data availability separately from actual observation opportunity. FIRMS date-availability or missing-data services describe dates represented in the data service; they do not establish clear-sky coverage, valid-pixel coverage, or complete opportunities to detect fires. A hotspot CSV with no rows cannot by itself prove that a sensor observed zero fires.

Use explicit source-status values such as:

- `records_present`;
- `no_records_returned_coverage_unverified`;
- `source_data_gap`;
- `product_unavailable`;
- `partial_source_data`;
- `coverage_unknown`;
- `zero_detections_with_valid_observation_coverage` only when independent coverage evidence supports that interpretation.

In the prototype UI, label the unverified case **“No source records returned; observation coverage unknown.”** Do not infer observation completeness only from the absence of records in a hotspot CSV. Consult [FIRMS date availability](https://firms.modaps.eosdis.nasa.gov/api/data_availability/) and [missing-data information](https://firms.modaps.eosdis.nasa.gov/api/missing_data/) for source-service gaps, and document what those checks do and do not establish.

## 8. Cross-sensor harmonization strategy

A shared schema is necessary but not sufficient. For the bounded prototype, define harmonization as a source-preserving common schema plus a common AOI, monthly binning rule, and query contract, while retaining separate sensor/platform/product series. Compare those series only as sensor-specific observations; aligned bins do not make their counts physically equivalent.

1. Normalize shared fields and preserve all sensor-native attributes.
2. Apply the same documented AOI boundary rule and month boundaries to each selected product.
3. Identify the latest overlapping source-available period for the selected products and record known source-service gaps. This does not establish complete observation opportunity.
4. Show MODIS and VIIRS outputs separately and disclose known product/coverage differences.
5. Test candidate adjustments against held-out periods or regions before considering a fused index.
6. Only then publish a fused index or adjustment, clearly labeled as derived and versioned.

The 2010–2026 snapshot is still shorter than a complete 20-year record and its source-gap evidence is not valid-pixel coverage. Any baseline/anomaly results must remain explicitly exploratory until the method, missingness handling, sensor separation, and validation are documented and tested.

Potential comparison techniques (research candidates, not approved methods): rate normalization by valid observation opportunities; sensor-specific standardization against a reference distribution; overlap-period regression/calibration; stratification by region/season; and grid-based aggregation. Each must be evaluated for assumptions and bias.

### Do not use without justification
- dividing one sensor count by a fixed global ratio;
- mapping VIIRS categorical confidence to MODIS percentage;
- summing detections as if every record were an independent fire;
- applying a single global correction without testing regional/seasonal differences;
- interpreting sensor transition dates as environmental change.

## 9. Spatial aggregation and AOIs

A raw point coordinate is generally the hotspot pixel's nominal center, not the exact location or extent of a fire. If a grid is used:

- state its cell size, projection, and reason for selection;
- consider an equal-area or otherwise appropriate spatial reference for area-based analysis;
- test whether results change materially at alternative resolutions;
- preserve source observations and do not replace them with grid centroids;
- treat AOI clipping/assignment consistently across sensors;
- document boundary effects and uncertainty near AOI edges.

A point-in-polygon rule is a reasonable starting choice for a point-based application, but it must be stated and tested. If full detection-pixel footprints are available and the analysis needs them, assess pixel intersection separately.

## 10. Optional hotspot grouping

The prototype exposes an **experimental, unvalidated** `/api/v1/hotspot-groups` method labeled “algorithmic hotspot group.” It clusters only within the same sensor/platform/product; it never fuses cross-sensor observations or calls groups confirmed incidents. `hotspot-groups-grid-0.1` uses a local metric grid, pair links within 24 hours, a 72-hour component-duration cap to limit transitive chaining, and candidate distance defaults of 2,000 m for MODIS and 750 m for VIIRS (two nominal pixel widths). Callers may provide a distance threshold. Each group carries contributing observation IDs, source snapshot IDs, interval, centroid, and bounds.

These are engineering defaults, not validated fire-event thresholds. Before scientific interpretation, evaluate:
- source pixel scale and location uncertainty;
- overpass time and repeated detections;
- transitive chaining (a long chain of near-neighbor points can merge distinct activity);
- high-density regions and sparse regions;
- sensitivity to distance/time thresholds;
- cross-sensor association versus within-sensor grouping.

The endpoint is bounded to 90 days and 50,000 matching observations to prevent expensive national-history clustering requests. Results are suitable for prototype exploration only until the sensitivity report and domain evaluation are completed.

Keep a many-to-many provenance relation from every group to its contributing observation IDs. Report method/version, parameters, and known limitations. Do not call the result a confirmed incident or perimeter.

## 11. Historical baseline and anomaly methodology

### Current prototype display (descriptive only)

The seasonal panel reports returned-row totals by calendar month and, separately for each sensor/platform/product, the median and 25th–75th percentile among month-year bins that contain records and are not marked with a FIRMS-reported missing source date. Empty bins and bins with a known source gap are excluded, never converted to zero. The displayed sample size (`n`) is the number of included month-year bins. This is an exploratory distribution of returned records, not an expected-activity interval, exposure-adjusted baseline, anomaly score, or critical-period flag. A month without a known FIRMS missing date still does not establish valid-pixel or clear-sky opportunity over the AOI.

The selected calendar-cell detail also shows an **exploratory historical count context** (`observed-count-prior-month-IQR-v1`). For the selected sensor/platform/product and calendar month, it uses only earlier years inside the currently selected calendar window whose bins have returned records and no FIRMS-reported missing source date. It excludes the target year, requires at least five reference years, and reports the prior-sample median and linearly interpolated 25th–75th percentile range. The selected count is labeled above, within, or below that observed middle range; this is a descriptive comparison, not an anomaly score or expected burning range. A selected bin with no records, a known source gap, or insufficient prior samples receives no above/within/below label. The detail lists reference years and source snapshot IDs so the comparison can be traced.

This comparison remains subject to the same observation-opportunity limitation as the seasonal display. It is not an exposure-adjusted baseline, validated unusual-fire-period detector, alert, or risk signal. Changing the selected calendar date range changes which prior years are available for the reference sample.

### Baseline

Define the reference period and the valid-coverage rule before calculating a baseline. Possible summaries include month-of-year distribution, median, mean, quantiles, robust dispersion, and year-specific values. Use sensor-stratified baselines by default.

Avoid a baseline that includes the target period when the analysis claims to compare the target against prior history. Decide whether the target year's data are excluded and state the rule.

### Anomaly

An anomaly is deviation from a specified reference distribution, not proof of danger. Candidate statistics include:
- standardized deviation when distributional assumptions are reasonably satisfied;
- robust z-score using median and MAD;
- empirical quantile thresholds;
- season-matched comparison against prior years.

Choose based on actual data distribution, sample size, zero inflation, missingness, and stability. Report the observed value, baseline statistic, dispersion/interval, reference years, coverage status, sensor/product, method version, and interpretation text.

Do not run a z-score on sparse or zero-inflated counts and report a precise “risk score” without demonstrating that the method is meaningful.

## 12. Critical-period interpretation

Critical periods should be described as periods that merit attention based on historical frequency/intensity patterns or statistically unusual activity. A “critical period” is not an official alert or a forecast. Explain the evidence and what the platform cannot infer.

## 13. Forecasting is deferred

An activity outlook is optional and should be hidden/omitted unless all are true:
- there is enough temporal history and supporting covariate data;
- target construction is defensible;
- temporal holdout validation avoids future leakage;
- performance is compared with simple seasonal baselines;
- uncertainty and geographic limitations are displayed;
- product language calls it experimental.

A prediction of satellite-observed hotspot activity is not automatically a prediction of wildfire occurrence or impact.

## 14. Required method metadata

Every derived dataset/result must expose:
- method and version;
- code revision or build identifier;
- input snapshot IDs and product versions;
- AOI and geometry version;
- date/time range and time basis;
- sensor/platform selection;
- filtering and quality rules;
- spatial/temporal aggregation parameters;
- coverage/missingness method;
- output unit and interpretation;
- generation timestamp;
- known limitations.

## 15. Required scientific disclosures

The user should be able to discover that:
- the sensors do not have identical resolution or observation opportunities;
- hotspot detections are not confirmed fire incidents;
- cloud, smoke, canopy, overpass timing, and product algorithms affect what is detected;
- missing records are not necessarily zero activity;
- historical patterns do not guarantee future activity;
- any harmonized index is an analytical construct, not a NASA-provided measurement.

## 16. Approval gate

No harmonization method is “approved” until a short methodology record contains: hypothesis, inputs, exact formula/parameters, assumptions, validation design, sensitivity tests, failure cases, and decision. Record it in `docs/DECISIONS.md` and reference it from the output metadata.
