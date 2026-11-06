# API Specification (Proposed)

**Status:** Contract proposal only. Endpoint names and response shapes must be matched to the implementation after the repository audit.

## 1. API principles

- Prefix routes with `/api/v1`.
- Validate query parameters and request bodies.
- Use UTC ISO-8601 timestamps in machine responses.
- Paginate observation results.
- Limit the prototype to one configured AOI and a fixed date window of no more than 24 months. Reject requests outside the frozen demo window.
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
| GET | `/api/v1/coverage` | Coverage by AOI, date range, sensor/product | P0 |
| GET | `/api/v1/observations` | Paginated source-linked observations | P0 |
| GET | `/api/v1/observations/{observation_id}` | Observation detail and provenance | P0 |
| GET | `/api/v1/calendar` | Calendar aggregates and coverage states | P0 |
| GET | `/api/v1/seasonality` | Historical month/season summaries | P1 |
| GET | `/api/v1/baselines` | Baseline summaries | P1 |
| GET | `/api/v1/anomalies` | Explained anomaly results | P1 |
| GET | `/api/v1/hotspot-groups` | Algorithmic groups, if validated | P1 |
| POST | `/api/v1/exports` | Generate a bounded export directly with its metadata manifest | P0 |
| GET | `/api/v1/exports/{export_id}` | Track an asynchronous export job, only if profiling shows direct export is too slow | P2 / conditional |
| GET | `/api/v1/exports/{export_id}/download` | Download an asynchronous export, only if a job endpoint is needed | P2 / conditional |

## 3. Common query parameters

Where appropriate:
- the configured demo `aoi_id`;
- `start` and `end` as ISO-8601 (end-exclusive recommended), constrained to the frozen window of at most 24 months;
- `sensors` / `platforms` / `products` as enumerated filters;
- `processing_level`;
- `page`, `page_size`, or cursor;
- `sort` with an allowlist;
- `include_native_fields` boolean, default false for list views.

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
  "confidence_filter": null,
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
          "coverage_status": "no_records_returned_coverage_unverified"
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

For the prototype's bounded two-year dataset, return the export directly with a metadata manifest when measured size/runtime is reasonable. Add asynchronous job/status/download endpoints only if profiling shows a real need; do not introduce a queue preemptively.

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

## 9. Error contract

Recommended envelope:

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
- Ensure error details do not reveal secrets, SQL, or internal paths.
