import type { HealthResponse, DataSourcesResponse, Aoi, CoverageResponse, ObservationsResponse, ObservationDetail, CalendarResponse, ExportResponse } from './types';
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers??{}) }, ...init });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = (j as {error?:{message?:string}}).error?.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}
export const api = {
  health: () => req<HealthResponse>('/api/v1/health'),
  dataSources: () => req<DataSourcesResponse>('/api/v1/data-sources'),
  aois: () => req<{items: Aoi[]}|Aoi>('/api/v1/aois'),
  coverage: (q: URLSearchParams) => req<CoverageResponse>(`/api/v1/coverage?${q}`),
  observations: (q: URLSearchParams) => req<ObservationsResponse>(`/api/v1/observations?${q}`),
  observationDetail: (id: string) => req<ObservationDetail>(`/api/v1/observations/${encodeURIComponent(id)}`),
  calendar: (q: URLSearchParams) => req<CalendarResponse>(`/api/v1/calendar?${q}`),
  postExport: (body: Record<string, unknown>) => req<ExportResponse>('/api/v1/exports', { method: 'POST', body: JSON.stringify(body) }),
  exportDownloadUrl: (id: string) => `${BASE}/api/v1/exports/${encodeURIComponent(id)}/download`,
};
export { BASE };
export function coverageStatusLabel(status: string): string {
  const map: Record<string,string> = {
    records_present: 'Records present',
    no_records_returned_coverage_unverified: 'No source records returned; observation coverage unknown',
    source_data_gap: 'Source data gap',
    product_unavailable: 'Product unavailable',
    partial_source_data: 'Partial source data',
    coverage_unknown: 'Coverage unknown',
    zero_detections_with_valid_observation_coverage: 'Zero detections with valid observation coverage',
  };
  return map[status] ?? status;
}
