# Data Dictionary and Canonical Observation Contract

**Status:** Schema and source mappings for the frozen Bangladesh snapshot. The active scope is the task-specified Bangladesh bounding box and 2010-01-01–2026-07-31 MODIS_SP + VIIRS_SNPP_SP snapshot; it is not an authoritative national boundary. Product-native FRP and confidence fields remain distinct from any normalized values. See `DATA_SOURCE_REGISTER.md` §10 and `docs/STATUS.md`.

## 1. Design principles

- The source payload is authoritative for what NASA distributed.
- Canonical fields support cross-product querying but never replace source-native fields.
- Null means unknown/not supplied; zero is a real numeric value only when the source says it is.
- Every record has provenance to a snapshot/file/row or deterministic fingerprint.
- Product/version, sensor, and platform are explicit, not inferred from a UI label.

## 2. Recommended entities

### `source_snapshot`

| Field | Type | Meaning |
|---|---|---|
| `source_snapshot_id` | UUID/string | Unique ingestion snapshot identifier |
| `provider` | string | e.g. NASA FIRMS |
| `source_endpoint` | string | Exact URL/template or archive source |
| `product_id` | string | Source product identifier |
| `processing_level` | string | NRT, standard/science quality, or source-defined label |
| `collection_version` | string/null | Collection or product version, if supplied |
| `platform` | string | Terra, Aqua, Suomi-NPP, NOAA-20, NOAA-21, etc. |
| `sensor` | string | MODIS, VIIRS, or other source sensor |
| `requested_aoi` | JSON/string | Query geometry or named AOI reference |
| `requested_start_utc` | datetime/null | Requested interval start |
| `requested_end_utc` | datetime/null | Requested interval end |
| `retrieved_at_utc` | datetime | Retrieval time |
| `source_file_uri` | string | Internal relative path/object key; no secrets |
| `sha256` | string | Content checksum |
| `row_count` | integer | Source row count, if tabular |
| `documentation_url` | string | Product/API docs used |
| `documentation_checked_at` | datetime | Date docs were checked |
| `ingestion_run_id` | UUID/string | Run that created snapshot |

### `fire_observation`

One row represents one source observation/detection, not one real-world fire.

| Canonical field | Type | Required | Meaning |
|---|---|---:|---|
| `observation_id` | UUID/string | yes | Internal stable ID |
| `source_snapshot_id` | FK | yes | Snapshot provenance |
| `source_row_fingerprint` | string | yes | Deterministic source-row fingerprint scoped to product/version; not a NASA incident ID |
| `source_record_id` | string/null | no | Upstream ID only if source actually provides one |
| `provider` | string | yes | NASA FIRMS |
| `product_id` | string | yes | Exact product name/code |
| `collection_version` | string/null | no | Exact source version |
| `processing_level` | string/null | no | Standard/NRT/etc. |
| `sensor` | enum/string | yes | MODIS / VIIRS |
| `platform` | string | yes | Terra / Aqua / S-NPP / NOAA-20 / NOAA-21 |
| `instrument` | string/null | no | Source instrument field |
| `acquired_at_utc` | datetime | yes | Acquisition timestamp normalized to UTC |
| `acq_date_native` | string/date | yes | Source-native date |
| `acq_time_native` | string/null | no | Source-native time representation |
| `latitude` | float | yes | Decimal degrees, valid -90..90 |
| `longitude` | float | yes | Decimal degrees, valid -180..180 |
| `geometry` | Point | derived | Geometry created from lon/lat, with CRS declared |
| `brightness_primary_native` | number/null | no | Source-specific brightness field; preserve name/units |
| `brightness_secondary_native` | number/null | no | Source-specific secondary brightness, if supplied |
| `frp_native` | number/null | no | Original fire radiative power value |
| `frp_unit_native` | string/null | no | Source-defined unit |
| `frp_mw` | number/null | derived | Converted FRP in MW only when conversion is defined |
| `confidence_raw` | string/number/null | no | Exact source-native confidence value |
| `confidence_semantics` | string | yes | Numeric score, categorical class, product-defined, unknown |
| `confidence_class_native` | string/null | no | Native VIIRS class or other label |
| `daynight_native` | string/null | no | Native day/night value |
| `scan_native` | number/null | no | Native scan dimension/value |
| `track_native` | number/null | no | Native track dimension/value |
| `source_attributes` | JSON | yes | Remaining source-native attributes not mapped elsewhere |
| `ingested_at_utc` | datetime | yes | Time row entered canonical store |
| `normalization_version` | string | yes | Canonical mapping version |

### `data_availability`

| Field | Type | Meaning |
|---|---|---|
| `availability_id` | UUID/string | Internal row ID |
| `product_id` | string | Exact FIRMS product |
| `platform` | string | Platform |
| `date_or_interval` | date/range | Coverage interval represented |
| `availability_status` | enum | Source-service date status: available, unavailable, missing, partial, unknown; not cloud-free or complete observation opportunity |
| `source_reference` | string | FIRMS availability/missing-data reference |
| `checked_at_utc` | datetime | Check time |
| `notes` | text/null | Qualification |

FIRMS date-availability and missing-data checks describe source-service date coverage, not clear-sky or valid-pixel observation opportunities. Do not infer observation completeness from the absence of hotspot rows. In the prototype, show **“No source records returned; observation coverage unknown”** unless independent observation-coverage evidence is available.

### `aoi`

| Field | Type | Meaning |
|---|---|---|
| `aoi_id` | UUID/string | Stable AOI identifier |
| `name` | string | User-facing name |
| `geometry` | Polygon/MultiPolygon | Geometry with CRS |
| `crs` | string | CRS identifier |
| `source` | string | Drawn, user-uploaded, boundary dataset, geocoder, etc. |
| `source_version` | string/null | Boundary data version |
| `created_at_utc` | datetime | Creation time |

### `calendar_aggregate`

| Field | Type | Meaning |
|---|---|---|
| `aggregate_id` | UUID/string | Stable derived ID |
| `aoi_id` | FK/string | AOI used |
| `period_start_utc` | datetime/date | Period start |
| `period_end_utc` | datetime/date | Period end (exclusive recommended) |
| `time_bin` | enum/string | month for the prototype; any other bin must be explicitly defined |
| `sensor` | string | Sensor/platform/product dimension; do not discard |
| `observation_count` | integer | Count of source rows in the fixed interval; zero means no rows in the ingested snapshot, not proof of no fire activity |
| `count_unit` | string | `source_observation_rows_after_exact_deduplication_within_product_snapshot` for the prototype |
| `coverage_status` | enum | records_present, no_records_returned_coverage_unverified, source_data_gap, product_unavailable, partial_source_data, coverage_unknown, zero_detections_with_valid_observation_coverage (only with independent evidence) |
| `source_data_availability_fraction` | number/null | Optional ratio of expected source dates present, only if denominator is defined; never a sensor-observation fraction |
| `coverage_evidence` | JSON/string | Source-service availability evidence and its limits; not valid-observation coverage |
| `source_snapshot_ids` | array | Input snapshots |
| `method_version` | string | Aggregation method version |
| `generated_at_utc` | datetime | Output generation |

### `hotspot_group` (optional P1)

| Field | Type | Meaning |
|---|---|---|
| `group_id` | UUID/string | Algorithmic group ID |
| `method_name` | string | Clustering method |
| `method_version` | string | Version/parameters |
| `time_start_utc` / `time_end_utc` | datetime | Group interval |
| `geometry` | Geometry/null | Derived spatial representation; not a fire perimeter |
| `observation_count` | integer | Contributing source observation count |
| `sensor_scope` | string | within-sensor or cross-sensor association method |
| `interpretation_label` | string | “algorithmic hotspot group” |

A join table must link group IDs to observation IDs. Never delete underlying observations after grouping.

## 3. Source-to-canonical mapping workflow

For each product/version:

1. Download a small real sample and the associated product/attribute documentation.
2. Record exact column names, value types, units, allowed values, and null behavior.
3. Build an explicit mapping table from source field to canonical field.
4. Preserve unmapped attributes under `source_attributes`.
5. Test representative rows and edge cases.
6. Store mapping version and source guide URL.

Do not assume two products use identical names or meanings because the fields look similar.

## 4. Identity and duplicate policy

If NASA does not supply a unique observation identifier, generate a deterministic fingerprint from a documented set of source fields. Scope its uniqueness by product and product version. Record the hashing algorithm/version. Do not use coordinates alone as identity. A changed source product/collection can legitimately reprocess a row; keep the source snapshot and version context.

## 5. Export field groups

An observation export should include canonical fields, important native fields, and lineage columns. A derived-calendar export should include AOI and interval identifiers, sensor/platform/product, exact count unit, coverage status, method version, and input snapshot IDs.

The export metadata must accompany the rows; see `docs/API_SPECIFICATION.md` and `docs/DATA_PIPELINE.md`.
