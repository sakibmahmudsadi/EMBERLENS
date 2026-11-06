# Product Requirements Document (PRD)

**Product:** EMBERLENS  
**Challenge:** NASA Space Apps Challenge 2026 — Harmonization of MODIS and VIIRS Hot Spots  
**Status:** Product baseline; requirements must be reconciled with the repository audit and live data feasibility.

## 1. Product summary

EMBERLENS turns NASA active-fire observations into a sensor-aware burning-activity calendar for a selected area of interest (AOI). The prototype demonstrates the workflow on one AOI and a fixed observation window of at most 24 months. It preserves sensor-specific meaning and provenance; this bounded slice is not presented as a complete historical record, robust climatology, or validated anomaly baseline. It helps users answer:

- **Where?** Which parts of the AOI contain recorded active-fire detections?
- **When?** How is detected activity distributed across dates, months, seasons, and years?
- **Compared with what?** What does the historical pattern look like, and which periods are unusual relative to an explicit baseline?
- **How reliable is this view?** Which sensors/products contributed, when were observations available, and what are the limitations?
- **Can I reuse it?** Can I download source-linked observations and derived results with metadata?

The challenge brief specifically asks for a web application that harmonizes MODIS and VIIRS hot-spot records into a burning-activity calendar, enabling historical pattern analysis, examination of unusual conditions, and identification of critical periods. EMBERLENS must visibly satisfy that request before pursuing broader fire-intelligence features.

## 2. Problem and opportunity

The historical record is split across sensors with different spatial resolutions, algorithms, observation opportunities, and attribute semantics. A naïve merge produces a combined table, not necessarily a scientifically comparable time series. Users also need to distinguish no detected activity from a period when the relevant sensor/product had no usable observation.

EMBERLENS will preserve the distinctions in the source data while creating a common analytical interface. It will make the assumptions behind comparison inspectable rather than hiding them behind a single number.

## 3. Intended users

### Primary
- Researchers and students studying fire/burning activity, seasonality, and geospatial patterns.
- Land managers and environmental analysts exploring a selected region's historical activity.

### Secondary
- Disaster-risk and monitoring teams seeking historical context. The application is not an official emergency alert system.
- Educators, journalists, and open-data users who need an interpretable view with traceable sources.

### User needs
- Open the configured demo AOI without needing GIS software; arbitrary AOI search/drawing is a later extension.
- See which products cover the selected AOI and period.
- Compare sensor-specific histories without misleading equivalence.
- Inspect the monthly burning calendar and compare sensor-specific returned detections; unusual-period analysis is a later, validated extension.
- Inspect individual records and export data for independent analysis.

## 4. Product principles

1. **Scientific honesty over visual certainty.** Show uncertainty, gaps, provenance, and sensor distinctions.
2. **Calendar first.** The burning-activity calendar is the signature view and the first analytical payoff.
3. **Evidence before intelligence.** No anomaly or event story without source observations and a defined method.
4. **Reusable by design.** Exports retain source, method, filtering, and coordinate metadata.
5. **Global architecture, focused first AOI.** Use one demo geography, potentially Bangladesh/Sundarbans, only if the selected products cover it; do not hardcode that geography into the domain model.
6. **Progressive disclosure.** Start with a clean map and one configured demo AOI; reveal the calendar and source details as the user explores.

### Prototype data window

- The first demonstrator uses one AOI and no more than **24 months** of observations. Do not backfill each sensor to its earliest product date.
- Prefer the latest common source-available window for the selected products at retrieval time. If the overlap is shorter than 24 months, use that shorter window and explain why. Check and report known source-service gaps; source availability is not complete sensor observation coverage.
- Freeze the exact start/end dates, product versions, processing levels, and source snapshots in the run manifest. Do not mix NRT and standard products just to extend the date range.
- Use a monthly calendar, stratified by sensor/platform/product. The two-year window demonstrates the product; it does not support strong long-term seasonality, anomaly, or forecast claims by itself. Those analyses remain deferred unless supported by additional reference data and validation.

## 5. Scope and priority

### P0 — Required for a defensible challenge submission
- Real NASA FIRMS MODIS and VIIRS source data for one documented AOI and a fixed window of at most 24 months.
- Ingestion manifest, raw file preservation, product/version metadata, and data-quality report.
- Common source-preserving observation schema.
- Sensor-aware filters and coverage display.
- A monthly burning-activity calendar with a documented counting unit and source-data status.
- Sensor/platform-separated views over common AOI and month bins. For the prototype, cross-sensor harmonization means a source-preserving common schema and aligned query frame; it does not mean a calibrated or fused fire-activity count.
- Historical year/month/season analysis only where supported by the bounded data and clearly labeled as descriptive.
- Observation detail with source attributes and provenance.
- A bounded CSV/JSON/GeoJSON export of supported data and metadata.
- A reproducible demo AOI, fixed data snapshot, and test procedure.

### P1 — Strong differentiators after P0 works
- Place/region profile and seasonal climatology.
- Baseline ranges and unusual-activity analysis with explainability.
- Spatial distribution and time-series comparison.
- Algorithmic hotspot/event grouping, clearly distinguished from confirmed fire incidents.
- Comparison between two AOIs or subregions.

### P2 — Only if evidence, time, and validation allow
- Multi-region/global discovery.
- Experimental activity outlook. This is not a core claim and must not appear as a forecast unless a separate validation plan passes.
- Additional contextual layers (weather, land cover, protected areas, population, administrative boundaries) only with documented data lineage and a defined analytical purpose.
- Public API, accounts, saved workspaces, collaborative annotation, and operational alerts.

## 6. Explicit non-goals

- Confirming individual wildfires from hotspot detections alone.
- Mapping fire perimeters or burned area from active-fire points.
- Declaring an emergency, issuing an official warning, or replacing authorities.
- Claiming raw MODIS and VIIRS counts are directly equivalent.
- Producing an unvalidated predictive model because a dashboard is expected to have an AI feature.
- Building a generic global dashboard that cannot explain one AOI correctly.
- Adding complex user management, billing, microservices, or infrastructure without a demonstrated requirement.

## 7. Core user journeys

### Journey A — Explore the demo AOI
1. Open the map with the configured demo AOI.
2. See AOI geometry, the fixed date range (no more than 24 months), sensor/product availability, and source-status caveats.
3. Open the monthly burning calendar.
4. Select a cell or period to inspect returned detections and their contributing sensor/platform.

**Acceptance:** AOI and fixed time range are visible; results are reproducible from the same frozen snapshot; no-source-record periods are not presented as verified zero activity.

### Journey B — Inspect the demo period
1. Select the configured demo AOI and the supported period within the fixed data window.
2. Open the monthly calendar.
3. Inspect returned detections and source-data status by month.
4. Switch between sensor/platform-specific panels.
5. Read the method and coverage notes.

**Acceptance:** Aggregation definition, time zone, sensor set, product versions, and source availability status are accessible. The view does not imply that sensor differences are environmental change or that two years establish a stable climatology.

### Journey C — Investigate an unusual period (post-prototype, only if validated)
1. Open a period flagged by the selected anomaly method.
2. Inspect observed value, baseline, reference interval, sample/coverage context, and sensor contribution.
3. Open underlying observations.
4. Export the subset and its metadata.

**Acceptance:** The flag is reproducible, the baseline is stated, supporting evidence is visible, and copy avoids describing a statistical anomaly as a confirmed emergency.

### Journey D — Reuse data
1. Choose source observations or a derived dataset.
2. Apply AOI/date/sensor/quality filters.
3. Preview row count, fields, and processing method.
4. Download CSV, JSON, or GeoJSON.
5. Inspect a metadata sidecar or metadata section.

**Acceptance:** Export contains or accompanies source attribution, data coverage, filters, units, coordinate reference system, processing version, generation time, and limitations.

## 8. Functional requirements

| ID | Requirement | Priority | Acceptance evidence |
|---|---|---:|---|
| FR-01 | Ingest supported MODIS and VIIRS FIRMS products | P0 | Manifest, raw file, source URL/product, retrieval time, checksums |
| FR-02 | Validate required fields, types, coordinates, timestamps, and duplicates | P0 | Validation report and automated tests |
| FR-03 | Preserve source attributes and native confidence semantics | P0 | Data dictionary and source-to-canonical mapping tests |
| FR-04 | Query detections by AOI, period, sensor, and platform | P0 | API tests against known fixture and database |
| FR-05 | Report product coverage and data gaps | P0 | Availability view/API and no-data tests |
| FR-06 | Display a burning-activity calendar | P0 | Calendar integration test from a fixed source snapshot |
| FR-07 | Show sensor/platform-separated source-row counts and method notes | P0 | UI/API evidence; no unqualified merged count or unvalidated index |
| FR-08 | Inspect a source-linked observation | P0 | Detail panel includes provenance and native fields |
| FR-09 | Export filtered observations and derived calendar data | P0 | Round-trip/schema/metadata tests |
| FR-10 | Historical seasonality and trend views | P1 | Reproducible aggregate tests |
| FR-11 | Baseline and anomaly explanation | P1 | Time-aware validation and explanation fields |
| FR-12 | Group observations into algorithmic hotspot events | P1 | Method, sensitivity, provenance, and evaluation report |
| FR-13 | Optional experimental outlook | P2 | Only after leakage-safe time split and baseline comparison |

## 9. Non-functional requirements

- **Reproducibility:** A data snapshot plus method version can reproduce the same derived outputs.
- **Traceability:** Every aggregate links to a source snapshot and transformation version.
- **Performance:** AOI queries and calendar summaries must be measured on the actual demo dataset; set realistic targets after profiling rather than inventing them.
- **Reliability:** Ingestion can retry without corrupting or multiplying records.
- **Security:** Secrets are environment-managed; validation prevents arbitrary file paths and unsafe queries.
- **Accessibility:** Keyboard access, readable contrast, clear focus, and non-color-only encodings.
- **Responsive design:** The essential AOI, calendar, sensor, and detail workflows work on laptop and tablet widths.
- **Observability:** Logs include run IDs and counts, never secret values or sensitive credentials.

## 10. Product language and labels

Prefer: *active-fire detection*, *hotspot observation*, *detected burning activity*, *algorithmic hotspot group*, *statistical anomaly*, *data coverage*.  
Avoid unqualified: *wildfire*, *fire incident*, *fire perimeter*, *danger*, *prediction*, *confirmed fire*.

Use “fire event” only if the UI clearly states that it is an algorithmic grouping of detections, not an independently confirmed incident. “Hotspot group” is the safer default label.

## 11. Success measures

Product success is demonstrated through evidence, not aspirational numbers:
- At least one reproducible AOI pipeline from NASA source file to calendar and export.
- MODIS and VIIRS records can be inspected separately and compared without losing sensor identity.
- Coverage gaps are represented explicitly.
- A judge can understand the challenge problem, the harmonization approach, and why the calendar is useful within a short demo.
- Independent rerun produces the same results from the same snapshot and code/method version.
- Known limitations are presented clearly.

Do not invent numeric performance, impact, or accuracy targets. Establish them after profiling and validation, then record the benchmark method.

## 12. Open decisions to resolve during audit

- Which exact FIRMS products and processing collections are available for each demo period?
- Does the existing dataset use standard science-quality or NRT records, and are product versions mixed?
- Which AOI produces the strongest scientifically defensible demonstration?
- Which exact demo AOI, boundary source, products, and latest common source-data window of at most 24 months will be used? Here, source-data availability does not imply observation completeness.
- Which cross-sensor comparison can be supported by overlap-period evidence? A fused value is out of prototype scope unless validated.
- What deployment environment and data volume are realistically available to the team?
