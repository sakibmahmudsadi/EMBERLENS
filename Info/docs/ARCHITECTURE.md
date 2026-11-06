# System Architecture

**Status:** Recommended target architecture; confirm against the actual repository before implementation.

## 1. Architecture objective

Deliver one reproducible path from NASA FIRMS records to a user-facing burning-activity calendar, while retaining original observations, source provenance, sensor-specific measurement meaning, and exportability. The competition prototype is limited to one AOI and a fixed source window of at most 24 months.

Use a **modular monolith** initially. The scientific pipeline, API, and frontend should have clear boundaries, but separate deployable services are not justified until scale or team ownership requires them.

## 2. Proposed logical architecture

```text
NASA FIRMS archive / API
        |
        v
Acquisition adapters -----> Immutable raw files + manifests
        |                                  |
        v                                  v
Schema / quality validation          Checksums / lineage
        |
        v
Canonical observation layer (source-preserving)
        |
        +----> Sensor-specific queries and coverage
        |
        +----> Sensor-aware calendar aggregation
        |
        +----> Optional hotspot grouping
        |
        +----> Baseline / anomaly analytics
        |
        v
PostgreSQL + PostGIS <----> FastAPI application
        |                          |
        |                          v
        |                    Typed response contracts
        |                          |
        v                          v
Parquet curated exports      React + TypeScript UI
                                   |
                                   v
                         MapLibre map + calendar + analysis
```

This is a conceptual boundary diagram. It does not assert that any component is already implemented.

## 3. Recommended technology baseline

| Concern | Recommendation | Notes / decision gate |
|---|---|---|
| Backend | Python, FastAPI, Pydantic | Good fit for scientific data and typed APIs |
| Data store | Reuse the existing store; DuckDB/Parquet or SQLite may fit a fixed prototype snapshot | Add PostgreSQL/PostGIS only if the actual app or query load requires it |
| ORM/migrations | SQLAlchemy + Alembic | Keep schema evolution explicit |
| Processing | Polars or Pandas; NumPy; Shapely/GeoPandas when needed | Benchmark the team's actual dataset before choosing both dataframe stacks |
| File formats | Original CSV/JSON plus curated Parquet | Raw files remain immutable; Parquet is a derived artifact |
| Frontend | React + TypeScript + Vite | Component boundaries by product feature |
| Map | MapLibre GL JS | Use a real basemap and real observation data layer; review tile source/license |
| Charts | One accessible chart library | Calendar matrix and compact trend charts; avoid library sprawl |
| Tests | Pytest; frontend test runner already present or selected deliberately | Test pipeline and contracts end-to-end |
| Local infrastructure | Docker Compose for database/services if it reduces setup friction | Do not containerize everything automatically |

If the repository already has a viable stack, prefer retaining it unless audit evidence demonstrates a material problem. For one static AOI and at most 24 months of data, avoid adding a database server or spatial infrastructure solely because it appears in the target diagram.

## 4. Backend module boundaries

Suggested Python package responsibilities:

- `ingestion/`: source clients, archive adapters, retrieval manifests, retries, pagination/windowing.
- `validation/`: source schema checks, coordinate/time validation, quality reports, duplicate diagnostics.
- `harmonization/`: source-to-canonical mappings, units, platform/sensor attributes, versioned transformations.
- `calendar/`: UTC month bins, sensor-stratified aggregation, source-data status and evidence; actual valid-observation coverage is unknown unless a separate coverage source is added.
- `event_detection/`: optional spatial-temporal grouping and cross-sensor association; keep disabled until validated.
- `analytics/`: seasonality, baselines, anomaly calculations, comparisons.
- `exports/`: CSV/JSON/GeoJSON/Parquet generation and metadata manifests.
- `api/`: route handlers, dependency injection, response schemas, error contracts.
- `db/`: models, migrations, repositories, query helpers.

The physical folder structure may differ; preserve the conceptual boundaries.

## 5. Data storage strategy

### Raw layer

- Store downloaded source payloads unchanged whenever licensing, size, and operational constraints allow.
- Assign a `source_snapshot_id` and checksum to each file/request batch.
- Store retrieval time, requested AOI/time span, endpoint, product identifier, collection/version, and source documentation reference.
- Do not overwrite raw files when a product is reprocessed or updated; create a new snapshot.

### Canonical relational layer

- Store a source-preserving row per detection with canonical fields plus native/source fields.
- Keep product, platform, sensor, and processing version as explicit dimensions.
- Geometry should be stored with a documented CRS; use WGS84 for lat/lon interchange and appropriate spatial indexing for database queries.
- Retain the raw source key or a deterministic row fingerprint scoped to product/version when no upstream unique ID exists.

### Derived analytical layer

- Store calendar aggregates, coverage summaries, hotspot groups, baseline outputs, and anomaly results as versioned derived data.
- Every derived record carries a method/algorithm version and references the input snapshot(s).
- Parquet exports are reproducible build outputs, not the only canonical record of data lineage.

## 6. Geospatial/time conventions

- Canonical longitude/latitude order must be explicit at API boundaries; GeoJSON uses longitude then latitude.
- Store acquisition timestamps in UTC. Keep the original acquisition date/time fields as supplied by the source.
- Use UTC consistently for cross-sensor temporal comparison. Local display time may be offered, but the displayed time zone must be labeled.
- Treat a point as a hotspot pixel center/nominal location, not a fire perimeter or exact ignition point.
- Store AOI geometry with its CRS, source, name, version, and selection method (search, uploaded boundary, drawn polygon, or admin layer).
- Validate antimeridian-crossing geometries and bounding boxes if global AOIs are supported.

## 7. Frontend boundaries

Organize the UI around user tasks, not a wall of charts:

- `map/`: basemap, detection layers, AOI drawing/search, layer controls.
- `search/`: place/coordinate lookup, AOI selection.
- `calendar/`: burning-activity calendar, period selection, coverage state.
- `sensors/`: MODIS/VIIRS/platform filters and comparison explanation.
- `place-profile/`: historical summaries and seasonal context.
- `analysis/`: baseline and anomaly views with evidence.
- `observations/`: source-record detail.
- `exports/`: format, filter, preview, download, metadata.

Data fetching should be centralized behind typed API clients. UI components must not calculate scientific indicators independently from backend definitions.

## 8. Proposed API boundary

Use versioned routes (`/api/v1/...`) and typed request/response schemas. The API should expose:

- health and data-source status;
- AOI metadata/coverage;
- observations with pagination and filters;
- calendar aggregates and coverage;
- historical/seasonal summaries;
- optional baselines/anomalies/hotspot groups;
- direct export of the bounded demo dataset with a metadata manifest; asynchronous export jobs only if profiling shows they are necessary.

See `docs/API_SPECIFICATION.md`. These are proposed contracts, not existing endpoints.

## 9. Processing and execution model

For the first demonstrator, a repeatable command/script can run ingestion and analytical jobs. Do not introduce a distributed job queue unless the workflow becomes slow or must run asynchronously for users. Long-running exports may use a background-task abstraction later.

Every run should record:
- run ID;
- start/end time;
- code revision;
- configuration hash;
- source snapshot IDs;
- input row counts;
- output row counts;
- validation warnings/errors;
- method versions;
- status and failure reason.

## 10. Deployment direction

For a challenge prototype, reuse the actual application's deployment and data store. A fixed two-year snapshot may not need a database server; add managed Postgres/PostGIS only if data size or spatial query needs justify it. Keep NASA API keys server-side. Do not make the browser call authenticated FIRMS endpoints directly. Set CORS to explicit origins and constrain date/AOI filters to the demo configuration.

A deployment decision is not final until hosting, data size, cost, and the team's ability to operate it have been assessed.

## 11. Architecture quality attributes

- Reproducible scientific transformation.
- Traceable observation-to-calendar lineage.
- Clear distinction between raw, normalized, and derived datasets.
- Safe repeatable ingestion.
- Good AOI/time-range query performance.
- Graceful empty/no-coverage behavior.
- Accessible, legible visualizations.
- Low operational complexity for a small student team.

## 12. Key architecture risks

1. **Naïve fusion:** solved by sensor-specific aggregation and a separate validated comparison layer.
2. **Data gaps mistaken for inactivity:** solved by explicit availability/coverage tables and status fields.
3. **Unbounded archive ingestion:** solved by AOI/time-bounded jobs, product-specific downloads, and manifests.
4. **Frontend scientific drift:** solved by backend-owned definitions and shared contracts.
5. **Premature infrastructure complexity:** solved by the modular-monolith default and documented decision gates.
