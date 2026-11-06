// Types matching docs/API_SPECIFICATION.md + DATA_DICTIONARY.md
export interface HealthResponse { status: string; [k: string]: unknown; }
export interface DataSource { product_id: string; sensor: string; platform: string; product_name?: string; [k: string]: unknown; }
export interface DataSourcesResponse { items: DataSource[]; sources?: DataSource[]; snapshots?: DataSource[]; [k: string]: unknown; }
export interface Aoi { aoi_id: string; name: string; crs: string; geometry?: GeoJSON.Geometry; geometry_source?: string; [k: string]: unknown; }
export interface CoverageItem { status: string; period_start?: string; period_end?: string; sensor?: string; product_id?: string; [k: string]: unknown; }
export interface CoverageResponse { items: CoverageItem[]; coverage?: CoverageItem[]; availability?: CoverageItem[]; [k: string]: unknown; }
export interface ObservationListItem { observation_id: string; acquired_at_utc: string; latitude: number; longitude: number; sensor: string; platform: string; product_id: string; collection_version: string|null; confidence_raw: string|number|null; confidence_semantics: string; frp_native: number|null; frp_mw: number|null; source_snapshot_id: string; source_row_fingerprint?: string; [k: string]: unknown; }
export interface ObservationDetail extends ObservationListItem { source_attributes?: Record<string, unknown>; provenance?: Record<string, unknown>; native_fields?: Record<string, unknown>; [k: string]: unknown; }
export interface ObservationsResponse { items: ObservationListItem[]; total: number; page: number; page_size: number; data?: ObservationListItem[]; pagination?: { page: number; page_size: number; total: number }; [k: string]: unknown; }
export interface CalendarValue { period_start: string; period_end: string; observation_count: number; coverage_status: string; [k: string]: unknown; }
export interface CalendarSeries { sensor: string; platform: string; product_id: string; values: CalendarValue[]; [k: string]: unknown; }
export interface CalendarResponse { aoi: { aoi_id: string; name: string; crs: string }; period: { start: string; end: string; time_zone: string }; time_bin: string; count_unit: string; spatial_rule: string; confidence_filter: string|null; method_version: string; series: CalendarSeries[]; provenance: { source_snapshot_ids: string[]; generated_at: string }; limitations: string[]; [k: string]: unknown; }
export interface ExportManifest { [k: string]: unknown; }
export interface ExportResponse { export_id?: string; file_name?: string; download_url?: string; manifest?: ExportManifest; metadata?: ExportManifest; data?: unknown; [k: string]: unknown; }
export interface ApiError { error: { code: string; message: string; request_id?: string; details?: unknown } }
