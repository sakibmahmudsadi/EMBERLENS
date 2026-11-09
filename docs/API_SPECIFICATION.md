> **Scope superseded 2026-11-06 (ADR-012):** the active configuration is Bangladesh national bbox (`bangladesh-bd`), Standard `MODIS_SP` + `VIIRS_SNPP_SP`, fixed window 2010-01-01 → 2026-07-31. “24-month prototype” below is historical and must not be used as current scope; the national bbox is not an authoritative boundary and missing records are not verified zero detections. See `docs/DECISIONS.md` ADR-012 and `DATA_SOURCE_REGISTER.md` §10.

# API Specification

**Status:** API contract and implementation notes. See endpoint handlers and `docs/STATUS.md` for currently verified behavior.

## 1. API principles

- Prefix routes with `/api/v1`.
- Validate query parameters and request bodies.
- Use UTC ISO-8601 timestamps in machine responses.
- Paginate observation results.
- Use the registered Bangladesh AOI and frozen 2010-01-01–2026-07-31 snapshot for the competition view. Calendar requests are capped at 240 month bins; observation queries return only rows present in the loaded snapshot.
- Serve only AOI IDs in the server-side `EMBERLENS_AOI_IDS` allowlist (default: `bangladesh-bd`); AOI rows added directly to DuckDB are not automatically public.
- Return explicit source-status and sensor/product context; do not label source-date availability as clear-sky observation coverage.
- Use a stable response envelope for errors.
- Do not expose NASA secrets or internal filesystem paths.
- Keep scientific calculations in backend services; the frontend renders API-defined values.

## 2. Proposed endpoints

| Method | Path | Purpose | Priority |
|---|---|---|---:|
| GET | `/api/v1/health` | Basic service health | P0 |
| GET | `/api/v1/data-sources` | Products/platforms and known coverage | P0 |
| GET | `/api/v1/aois` | Return the configured demo AOI | P0 |
| POST | `/api/v1/aois/validate` | Validate arbitrary AOI geometry | P2 / out of prototype scope |
| GET | `/api/v1/coverage` | FIRMS source-date evidence filtered by date range, sensor, platform, and product | P0 |
| GET | `/api/v1/observations` | Paginated source-linked observations | P0 |
| GET | `/api/v1/observations/{observation_id}` | Observation detail and provenance | P0 |
| GET | `/api/v1/map-density` | Full-filtered dataset summarized into spatial cells with separate sensor/product counts | P0 |
| GET | `/api/v1/calendar` | Calendar aggregates and coverage states | P0 |
| GET | `/api/v1/seasonality` | Historical month/season summaries | P1 |
| GET | `/api/v1/baselines` | Baseline summaries | P1 |
| GET | `/api/v1/anomalies` | Explained anomaly results | P1 |
| GET | `/api/v1/hotspot-groups` | Experimental sensor-separated algorithmic groups with source-observation provenance | P1 / unvalidated |
| POST | `/api/v1/exports` | Generate a bounded export directly with its metadata manifest | P0 |
| GET | `/api/v1/exports/{export_id}` | Track an asynchronous export job, only if profiling shows direct export is too slow | P2 / conditional |
| GET | `/api/v1/exports/{export_id}/download` | Download an asynchronous export, only if a job endpoint is needed | P2 / conditional |

## 3. Common query parameters

Where appropriate:
- the configured demo `aoi_id`;
- `start` and `end` as ISO-8601 (end-exclusive recommended), constrained to the registered 2010-01-01–2026-07-31 observation window;
- `sensors` / `platforms` / `products` as enumerated filters;
- `page` and `page_size` for observation lists;
- `include_native_fields` boolean, default false for list views.

Observation and calendar queries also support quality filters: `min_frp_native` applies to the source-native FRP field (no unit conversion is implied); `daynight` accepts `D` or `N`; `min_modis_confidence` is a 0–100 numeric threshold applied to MODIS records only; and `viirs_confidence_classes` accepts the source-native `L`, `N`, and/or `H` classes for VIIRS only. Sensor-specific confidence filters leave observations from the other sensor unchanged. Observation exports apply these filters directly. Calendar exports recompute the requested bins from source observations, require both `start` and `end`, and do not depend on a prior calendar request or cached aggregate rows.

Spatial queries and exports may include a `bounds` selection in `west,south,east,north` order (query parameter for GET endpoints; JSON field for POST `/exports`). It requires a configured `aoi_id`, is intersected with that AOI's stored geometry, and applies to observations, map density, calendar rows, experimental groups, and exports. The response/manifest reports requested and effective WGS 84 bounds. Without `bounds`, the entire configured AOI is used. This enables map-view subregion queries without accepting a new arbitrary AOI polygon or querying beyond the frozen Bangladesh bounding box. Source-service availability remains global and is not clipped to the selected map area.

`/api/v1/map-density` uses the same AOI, dates, sensor/product, and quality filters as the calendar. It returns grid-cell centers and per-series row counts. Marker size uses the highest single-series count in a cell; counts from MODIS and VIIRS are never summed. A marker is a spatial summary, not an individual observation or perimeter.

For the prototype, accept only the configured AOI and dates inside the frozen window; do not accept arbitrary SQL, database identifiers, or filesystem paths from clients.

## 4. Calendar response contract

Illustrative response shape:

```json
{
  "aoi": {"aoi_id": "demo-aoi", "name": "Demo AOI", "crs": "EPSG:4326"},
  "period": {"start": "<fixed-demo-start>", "end": "<fixed-demo-end-exclusive>", "time_zone": "UTC"},
  "time_bin": "month",
  "count_unit": "source_observation_rows_after_exact_deduplication_within_product_snapshot",
  "spatial_rule": "point_in_polygon_boundary_included",
  "confidence_filter": {"min_modis_confidence": null, "viirs_confidence_classes": []},
  "observation_filters": {"min_frp_native": null, "daynight": null, "min_modis_confidence": null, "viirs_confidence_classes": []},
  "method_version": "calendar-v0",
  "series": [
    {
      "sensor": "VIIRS",
      "platform": "Suomi-NPP",
      "product_id": "exact-product-id",
      "values": [
        {
          "period_start": "2024-01-01T00:00:00Z",
          "period_end": "2024-02-01T00:00:00Z",
          "observation_count": 0,
          "coverage_status": "no_records_returned_coverage_unverified",
          "source_snapshot_ids": []
        }
      ]
    }
  ],
  "provenance": {
    "source_snapshot_ids": ["snapshot-id"],
    "generated_at": "2026-01-01T00:00:00Z"
  },
  "limitations": ["Illustrative schema only; not real data."]
}
```

The example contains placeholders and deliberately does not imply any real data values. Production responses must use actual `coverage_status` values derived from verified coverage logic. Do not use zero as a placeholder for unknown activity in production.

## 5. Coverage response

Coverage endpoint should distinguish source-service date availability from evidence about actual sensor observation opportunities:
- product has data available for the requested date range;
- source explicitly reports missing data;
- records are present in the selected AOI;
- query returned no records, but observation completeness is not established;
- source/product is outside its temporal or geographic availability.

FIRMS date availability is not clear-sky or valid-pixel coverage. Return the source/status evidence and its limits. For an empty hotspot query, use `no_records_returned_coverage_unverified`; reserve `zero_detections_with_valid_observation_coverage` for a separately supported case.

`GET /api/v1/coverage` accepts optional `start` and `end` ISO-8601 bounds (`end` exclusive) alongside `sensor`, `platform`, and `product_id`. A record is returned when its reported date or inclusive interval overlaps the requested range. `aoi_id` is descriptive context only: FIRMS availability and missing-day records are global product/platform source-service evidence, not AOI-specific observation coverage. The response note must say so.

## 6. Observation response

A list row should include at least:
- observation ID;
- acquisition timestamp UTC;
- latitude/longitude;
- sensor/platform/product/version;
- confidence raw value and semantics;
- FRP and unit when present;
- source snapshot/fingerprint;
- source-native attributes only when requested.

Detail view should expose all available native fields and the provenance trail.

## 7. Export request contract

An export request should identify:
- dataset type: observations, calendar, seasonality, hotspot groups, etc.;
- AOI reference/geometry;
- date range;
- sensors/platforms/products;
- processing level;
- filters and count unit;
- format: CSV, JSON, GeoJSON; Parquet may be a research option;
- requested metadata inclusion.

For the frozen national snapshot, return bounded exports directly with a metadata manifest when measured size/runtime is reasonable. Add asynchronous job/status/download endpoints only if profiling shows a real need; do not introduce a queue preemptively. Calendar values include the snapshot IDs that contributed to that month; top-level provenance is limited to snapshots contributing to the requested result.

## 8. Export metadata requirements

Every export must include a metadata manifest (sidecar or embedded properties) with:
- project/product name and schema version;
- creation time;
- AOI description, geometry source, and CRS;
- date range and time zone;
- filters/sensors/platforms/products/processing levels;
- source snapshots, source URLs, and product versions;
- processing/method versions and code revision if available;
- units and count definition;
- coverage/missingness method;
- NASA attribution and source citation;
- scientific limitations and interpretation warning.

### Prototype response encoding

- CSV is returned as `text/csv` with a final `# metadata_manifest: {JSON}` line. Client applications should remove that trailer before saving the tabular CSV and expose the parsed manifest separately.
- JSON is returned as `{ "data": [...], "metadata_manifest": {...} }`.
- GeoJSON is returned as a `FeatureCollection` with `metadata_manifest` at the top level. Calendar GeoJSON is rejected because calendar bins do not have point coordinates.
- The manifest lists only snapshots contributing to the exported rows. Snapshot file paths are reduced to their basenames, and MAP_KEY-shaped URL path segments are redacted. AOI metadata includes geometry type, bbox, source, and source version where available.
- An empty CSV still contains the dataset schema header and a zero-row manifest.

## 9. Error contract

Error responses use this envelope for application errors, request validation failures, HTTP 404/405 responses, and unexpected server failures. Each response includes the matching `X-Request-ID` header. Unexpected failures use a generic public message; diagnostic details stay in server logs.

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "The end date must be later than the start date.",
    "request_id": "request-id",
    "details": {}
  }
}
```

Use proper HTTP status codes. Never return HTTP 200 with a hidden ingestion or database failure.

## 10. Security and limits

- Keep FIRMS MAP_KEY server-side.
- Rate-limit expensive endpoints and export creation.
- Bound AOI vertex count and maximum date span where needed.
- Validate GeoJSON type, coordinate ranges, and geometry validity.
- Apply pagination and query timeouts.
- `/api/v1/hotspot-groups` is limited to 90-day windows and 50,000 matching source observations. It requires an AOI and date range; optional area bounds and clustering thresholds are returned with the result and remain experimental pending sensitivity evaluation.
- Ensure error details do not reveal secrets, SQL, or internal paths.
