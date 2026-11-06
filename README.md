# EMBERLENS

**From Fire Signals to Place Intelligence**  
*Where. When. What changed. Why it matters.*

EMBERLENS is a geospatial fire-intelligence application built around the 2026 NASA Space Apps Challenge, **Harmonization of MODIS and VIIRS Hot Spots**.

Its central product is a scientifically defensible **burning-activity calendar** for a selected area of interest (AOI). The prototype demonstrates the data path on one AOI and a fixed observation window of no more than 24 months. It preserves sensor-specific meaning and provenance; the short window is not presented as a long-term climatology or validated anomaly baseline.

> **Product principle:** The map is the entry point. The calendar and place-level interpretation are the product. The data must remain reusable.

## Start here

1. Read [`CLAUDE.md`](CLAUDE.md) before asking Claude Code to change the repository.
2. Read [`docs/PRD.md`](docs/PRD.md) for product scope and acceptance criteria.
3. Read [`docs/SCIENTIFIC_METHODOLOGY.md`](docs/SCIENTIFIC_METHODOLOGY.md) before designing harmonization, event grouping, baselines, or anomaly logic.
4. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the recommended system boundary and stack.
5. Read [`docs/STATUS.md`](docs/STATUS.md) and [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md) before implementing anything in an existing repository.

## Important: this is a project starter pack, not a claim of completed implementation

The folders under `backend/`, `frontend/`, `scripts/`, and `infrastructure/` are intentional implementation locations. This pack does not contain fabricated datasets, API responses, scientific results, model metrics, screenshots, or production-ready code. Do not present an empty scaffold as a working product.

The actual application repository must be audited before choosing what to retain, replace, or build. This Info pack is documentation only. See `docs/PROJECT_AUDIT.md`.

## Prototype scope and data window

- Use one documented demo AOI and a fixed window of **at most 24 months**. Do not backfill each product to its earliest available date for the prototype.
- Prefer the latest common source-available window of up to 24 months for the selected products at retrieval time. If the overlap is shorter, use that shorter window and record why. Check for known source-service gaps; source availability is not complete sensor observation coverage.
- Keep the exact start/end dates, product versions, processing levels, retrieval time, and source snapshot IDs in the manifest so the demo can be reproduced. Do not mix NRT and standard products just to extend the end date.
- The initial calendar is monthly and sensor/platform-stratified. A two-year slice demonstrates the workflow; it is not enough by itself to support strong climatology, anomaly, or forecasting claims. Keep those features out of the prototype unless separately justified and validated.
- FIRMS date availability or missing-data status describes the source service’s data availability. It does not prove clear-sky observation opportunity or that a zero-row bin means no fire activity. Label such a bin “no source records returned; observation coverage unknown” unless independent coverage evidence supports a stronger statement.

## Product scope at a glance

- **Prototype P0:** one AOI, a fixed window of at most 24 months, real source snapshots for selected MODIS and VIIRS products, provenance, a monthly sensor/platform-specific calendar, source-observation inspection, and a small metadata-backed export.
- **After the prototype:** longer historical coverage, climatological baselines, anomaly analysis, additional AOIs, and richer place intelligence. A two-year demo must not be described as a 20-year history or robust seasonal baseline.
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

## Target user journey

1. A user opens the configured demo AOI.
2. EMBERLENS shows selected MODIS/VIIRS products and the fixed demo window (at most 24 months), with source-data availability notes.
3. The user chooses a time span within the fixed demo window and a sensor/platform view.
4. The monthly burning-activity calendar shows returned detections and source-data gaps, with sensor context visible.
5. The user opens a calendar month or map point to inspect the source observations and provenance. The prototype does not label a period anomalous based only on two years of data.
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

Use `CLAUDE.md` for execution rules, `docs/PRD.md` for current product scope, `docs/SCIENTIFIC_METHODOLOGY.md` for scientific behavior, and `docs/DECISIONS.md` for accepted choices. Earlier pasted handoff prose and mockups are design context only where they agree with these documents; the calendar-first, 24-month prototype scope takes precedence.

## First instruction to the coding agent

Audit the actual application repository and its data first; this Info pack contains no implementation. Then build the smallest complete path from a real source record to a validated monthly calendar cell and metadata-backed export for one AOI and no more than 24 months. Do not backfill the full sensor archives. Refine the interface after this path is reproducible.
