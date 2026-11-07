# EMBERLENS

**From Fire Signals to Place Intelligence**  
*Where. When. What changed. Why it matters.*

EMBERLENS is a geospatial fire-intelligence application built around the 2026 NASA Space Apps Challenge, **Harmonization of MODIS and VIIRS Hot Spots**.

Its central product is a scientifically defensible **burning-activity calendar** for a selected area of interest (AOI). The current showcase scope is Bangladesh's national bounding box and NASA FIRMS Standard Product observations from 2010-01-01 through 2026-07-31. Sensor-specific meaning and provenance are preserved; historical counts are not presented as a validated anomaly baseline or forecast.

> **Product principle:** The map is the entry point. The calendar and place-level interpretation are the product. The data must remain reusable.

## Start here

1. Read [`CLAUDE.md`](CLAUDE.md) before asking Claude Code to change the repository.
2. Read [`docs/PRD.md`](docs/PRD.md) for product scope and acceptance criteria.
3. Read [`docs/SCIENTIFIC_METHODOLOGY.md`](docs/SCIENTIFIC_METHODOLOGY.md) before designing harmonization, event grouping, baselines, or anomaly logic.
4. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the recommended system boundary and stack.
5. Read [`docs/STATUS.md`](docs/STATUS.md) and [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md) before implementing anything in an existing repository.

## Current implementation

The repository contains a React/TypeScript + MapLibre frontend and a FastAPI/DuckDB backend. Synthetic fixtures are used by automated tests only. Check `docs/STATUS.md` and `DATA_SOURCE_REGISTER.md` for live source-data and ingestion status before presenting national coverage as complete.

## Prototype scope and data window

- The active demo AOI is the task-specified Bangladesh national bounding box (`bangladesh-bd`), not an authoritative country boundary. The fixed window is **2010-01-01 through 2026-07-31**, inclusive; it uses the common availability ceiling for Standard `MODIS_SP` and `VIIRS_SNPP_SP` products.
- The national historical range is deliberate for the showcase, rather than a backfill to each product's earliest available date. Record exact dates, product versions, processing levels, retrieval time, and snapshot IDs in each manifest. Do not mix NRT and Standard products to extend the end date.
- Keep the exact start/end dates, product versions, processing levels, retrieval time, and source snapshot IDs in the manifest so the demo can be reproduced. Do not mix NRT and standard products just to extend the end date.
- The calendar is monthly and sensor/platform-stratified over the accepted 2010–2026 snapshot. Returned detection counts are descriptive; the snapshot does not establish valid-pixel opportunity, calibrated cross-sensor equivalence, a validated anomaly baseline, or a forecast.
- FIRMS date availability or missing-data status describes the source service’s data availability. It does not prove clear-sky observation opportunity or that a zero-row bin means no fire activity. Label such a bin “no source records returned; observation coverage unknown” unless independent coverage evidence supports a stronger statement.

## Product scope at a glance

- **Showcase prototype:** Bangladesh national bounding box, 2010–2026 Standard MODIS + VIIRS observations, provenance, a monthly sensor/platform-specific calendar, source-observation inspection, and metadata-backed exports.
- **Deferred:** validated climatological baselines, anomaly analysis, and predictive outlooks. Long history does not by itself validate those analyses.
- **Deferred:** hotspot grouping and activity outlooks. These do not block the calendar and must not be described as confirmed incidents or guaranteed predictions.

## Proposed default stack (subject to repository audit)

| Layer | Default recommendation | Reason |
|---|---|---|
| API | Python + FastAPI + Pydantic | Strong data/science ecosystem and typed HTTP contracts |
| Data store | Reuse the app's existing store; DuckDB/Parquet or SQLite may fit a fixed demo snapshot | Avoid adding PostGIS for one preconfigured AOI unless actual query needs justify it |
| Raw/derived storage | Immutable source files + Parquet | Reproducible ingestion and efficient analytical scans |
| Data processing | Polars or Pandas; GeoPandas/Shapely where needed | Tabular and geospatial processing |
| Frontend | React + TypeScript + Vite | Fast iteration and a maintainable interactive app |
| Map | MapLibre GL JS | Real vector map and independently managed observation layers |
| Charts | A small, accessible chart library | Calendar and trend views, not decorative dashboards |
| Local infrastructure | Docker Compose when useful | Repeatable database and service setup |

Do not add Redis, task queues, microservices, Kubernetes, machine learning, or a large analytics stack without an evidenced need.

## Active scope (2026-11-06; ADR-012)

EMBERLENS is now configured for the **Bangladesh national bounding box** (`bangladesh-bd`, W=88.0 S=20.5 E=92.7 N=26.7, EPSG:4326; not an official boundary). The fixed Standard Product window is **2010-01-01 → 2026-07-31** (199 month bins), selected as the common availability ceiling for `MODIS_SP` and `VIIRS_SNPP_SP`; MODIS-only 2026-08 is excluded. This bbox is not a boundary and missing records are still not verified zero activity. The 24-month Sundarbans/prototype sections below are retained as historical context only.

## Target user journey

1. A user opens the Bangladesh national bounding-box view.
2. EMBERLENS shows selected MODIS/VIIRS products and the fixed 2010–2026 window, with source-data availability notes.
3. The user chooses a time span within the fixed window and a sensor/platform view.
4. The monthly burning-activity calendar shows returned detections and source-data gaps, with sensor context visible.
5. The user opens a calendar month or map point to inspect the source observations and provenance. The prototype does not label a period anomalous without a separately validated baseline.
6. The user exports observations or derived data with complete metadata and provenance.

## Scientific guardrails

- A FIRMS active-fire hotspot is a satellite detection of a thermal anomaly, not proof of a wildfire, fire perimeter, burned area, or emergency.
- MODIS and VIIRS differ in spatial resolution, overpass characteristics, algorithms, and confidence semantics. A shared schema is not proof that their measurements are interchangeable.
- Never add raw MODIS and VIIRS detection counts and label the sum a harmonized fire count.
- Preserve source rows, source product/version, sensor/platform, acquisition time, native attributes, and every processing version.
- Distinguish **no source records returned** from **verified zero detections**. A source-availability check alone does not establish clear-sky or complete observation coverage.
- Keep descriptive history, statistical anomalies, operational warnings, and forecasts clearly separated.
- Never invent results, accuracy, validation, data coverage, or impact claims.

## Project documentation map

- `docs/PRD.md` — users, journeys, features, scope, product acceptance.
- `docs/ARCHITECTURE.md` — system components, data flow, deployment direction.
- `docs/SCIENTIFIC_METHODOLOGY.md` — measurement model, harmonization, calendar, events, baselines, anomalies.
- `docs/DATA_DICTIONARY.md` — source-preserving and canonical fields.
- `docs/DATA_PIPELINE.md` — acquisition, validation, processing, reproducibility.
- `docs/API_SPECIFICATION.md` — proposed API contracts.
- `docs/VALIDATION_PLAN.md` — scientific, software, and product evaluation.
- `docs/SCIENTIFIC_RISK_REGISTER.md` — major scientific failure modes and controls.
- `docs/ROADMAP.md` — milestones and gates.
- `docs/IMPLEMENTATION_PLAN.md` — recommended execution sequence.
- `docs/DEFINITION_OF_DONE.md` — evidence required to call work complete.
- `docs/DECISIONS.md` — decision record; unresolved choices remain explicit.
- `docs/STATUS.md` — current project state, to be updated by the team.
- `docs/PROJECT_AUDIT.md` — first task for Claude Code in an existing repository.
- `docs/COMPETITION_STRATEGY.md` — challenge alignment and demonstration narrative.
- `docs/KIMI_K3_CLAUDE_CODE.md` — Kimi endpoint/model configuration notes.

## NASA source references

- [2026 challenge brief](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
- [NASA FIRMS active-fire products](https://firms.modaps.eosdis.nasa.gov/active_fire/)
- [NASA FIRMS archive download](https://firms.modaps.eosdis.nasa.gov/download/)
- [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/)
- [NASA FIRMS API use tutorial](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html)
- [NASA FIRMS active-fire attribute descriptions](https://firms.modaps.eosdis.nasa.gov/content/descriptions/)
- [NASA VIIRS fire product information](https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html)

Always re-check live product availability, product versions, endpoint limits, and field definitions before ingestion. Store the documentation URL and retrieval date used for every data-source decision.

## Document authority

Use `CLAUDE.md` for execution rules, `docs/PRD.md` for current product scope, `docs/SCIENTIFIC_METHODOLOGY.md` for scientific behavior, and `docs/DECISIONS.md` for accepted choices. ADR-012 supersedes earlier 24-month guidance and sets the current Bangladesh 2010–2026 snapshot. Earlier handoff prose and mockups are design context only where they agree with the accepted decision.

## First instruction to the coding agent

Audit the actual application repository and its data first. The current implementation uses the frozen national snapshot recorded in ADR-012; do not backfill earlier product history or extend the product set without an accepted decision. Keep the path from source record through validated monthly calendar cell to metadata-backed export reproducible.
