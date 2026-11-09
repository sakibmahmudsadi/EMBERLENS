import { useState } from 'react';
import { api, BASE } from '../lib/apiClient';
import type { ExportResponse } from '../lib/types';
import { ErrorState } from '../components/States';

type GeneratedExport = ExportResponse & { rawContent?: string };

export function ExportPanel({ aoiId, bounds, start, end, filters, qualityFilters, qualityFilteringAvailable }: { aoiId: string; bounds: [number, number, number, number] | null; start: string; end: string; filters: { sensors: string[]; platforms: string[]; products: string[] }; qualityFilters: { min_frp_native: string; daynight: string; min_modis_confidence: string; viirs_confidence_classes: string[] }; qualityFilteringAvailable: boolean }) {
  const [dataset, setDataset] = useState('observations');
  const [format, setFormat] = useState('csv');
  const [result, setResult] = useState<GeneratedExport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const exclusiveEnd = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setResult(null);
    if (dataset === 'calendar' && format === 'geojson') {
      setErr('Calendar GeoJSON is not supported — calendar bins have no coordinates. Use Observations + GeoJSON for points, or Calendar + CSV/JSON for bins.');
      setBusy(false);
      return;
    }
    const hasQualityFilters = Boolean(qualityFilters.min_frp_native || qualityFilters.daynight || qualityFilters.min_modis_confidence || qualityFilters.viirs_confidence_classes.length);
    if (hasQualityFilters && !qualityFilteringAvailable) {
      setErr('Restart the backend to enable these quality filters in exported data.');
      setBusy(false);
      return;
    }
    try {
      const response = await api.postExport({ dataset_type: dataset, format, aoi_id: aoiId, bounds: bounds?.join(','), start, end: exclusiveEnd(end), sensors: filters.sensors, platforms: filters.platforms, products: filters.products, min_frp_native: qualityFilters.min_frp_native !== '' ? Number(qualityFilters.min_frp_native) : null, daynight: qualityFilters.daynight || null, min_modis_confidence: qualityFilters.min_modis_confidence !== '' ? Number(qualityFilters.min_modis_confidence) : null, viirs_confidence_classes: qualityFilters.viirs_confidence_classes, include_metadata: true });
      const raw = await response.text();
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = JSON.parse(raw) as { detail?: { error?: { message?: string } }; error?: { message?: string } };
          message = body.detail?.error?.message ?? body.error?.message ?? message;
        } catch { /* keep the HTTP status for non-JSON errors */ }
        throw new Error(message);
      }

      let manifest: ExportResponse['manifest'] | undefined;
      let data: unknown = raw;
      let downloadContent = raw;
      if (format === 'csv') {
        const marker = '\n# metadata_manifest:';
        const markerIndex = raw.lastIndexOf(marker);
        if (markerIndex >= 0) {
          manifest = JSON.parse(raw.slice(markerIndex + marker.length).trim()) as ExportResponse['manifest'];
          downloadContent = raw.slice(0, markerIndex).replace(/[\r\n]+$/, '') + '\n';
        }
        data = downloadContent;
      } else {
        const parsed = JSON.parse(raw) as { data?: unknown; metadata_manifest?: ExportResponse['manifest']; manifest?: ExportResponse['manifest'] };
        manifest = parsed.metadata_manifest ?? parsed.manifest;
        data = parsed.data ?? parsed;
      }
      // The API embeds its manifest in CSV responses. Keep the spreadsheet file
      // rectangular, and offer the parsed manifest as a separate JSON sidecar.
      setResult({ file_name: `emberlens-${dataset}.${format}`, manifest, data, rawContent: downloadContent });
    } catch (ex) { setErr(String(ex)); } finally { setBusy(false); }
  }

  function download() {
    if (!result) return;
    const url = result.download_url ?? (result.export_id ? api.exportDownloadUrl(result.export_id) : null);
    if (url) { window.open(url.startsWith('http') ? url : `${BASE}${url}`, '_blank'); return; }
    const content = result.rawContent
      ?? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? {}, null, 2));
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : format === 'geojson' ? 'application/geo+json' : 'application/json';
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = result.file_name ?? `emberlens-export.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadManifest() {
    if (!result?.manifest) return;
    const content = JSON.stringify(result.manifest, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.file_name?.replace(/\.[^.]+$/, '') ?? 'emberlens-export'}.metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel" aria-label="Export">
      <h2>Export</h2>
      <form onSubmit={submit} className="filters">
        <label>Dataset <select value={dataset} onChange={e => setDataset(e.target.value)} aria-label="Dataset type"><option value="observations">Observations</option><option value="calendar">Calendar</option></select></label>
        <label>Format <select value={format} onChange={e => setFormat(e.target.value)} aria-label="Format"><option value="csv">CSV</option><option value="json">JSON</option><option value="geojson">GeoJSON</option></select></label>
        <button className="btn" type="submit" disabled={busy || !aoiId}>{busy ? 'Preparing…' : !aoiId ? 'National data unavailable' : 'Generate export'}</button>
      </form>
      {!dataset || dataset === 'observations' ? null : null}
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>AOI: {aoiId}{bounds ? ` · map area ${bounds.map(value => value.toFixed(3)).join(', ')}` : ' · full query area'} · {start} → {end} · Sensors: {filters.sensors.join(', ') || 'all returned'} · Platforms: {filters.platforms.join(', ') || 'all returned'} · Active quality filters are recorded in the export manifest.</p>
      {dataset === 'calendar' && format === 'geojson' && <p className="export-note">Calendar + GeoJSON is not supported (bins have no coordinates). Use Observations + GeoJSON for points, or Calendar + CSV/JSON for bins.</p>}
      {err && <ErrorState msg={err} />}
      {result && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{result.file_name ?? 'Export ready'}</strong>
            <button className="btn ghost" type="button" onClick={download}>{format === 'csv' ? 'Download CSV' : 'Download data'}</button>
            {format === 'csv' && result.manifest && <button className="outline-button" type="button" onClick={downloadManifest}>Download metadata JSON</button>}
          </div>
          {format === 'csv' && <p className="export-note">The CSV stays spreadsheet-ready. Its metadata manifest is available as a separate JSON file.</p>}
          <h3>Metadata manifest</h3>
          <pre className="json">{JSON.stringify(result.manifest ?? result.metadata ?? { note: 'No manifest returned' }, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
