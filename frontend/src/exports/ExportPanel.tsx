import { useState } from 'react';
import { api, BASE } from '../lib/apiClient';
import type { ExportResponse } from '../lib/types';
import { ErrorState } from '../components/States';

export function ExportPanel({ aoiId, start, end, filters }: { aoiId: string; start: string; end: string; filters: { sensors: string[]; platforms: string[]; products: string[] } }) {
  const [dataset, setDataset] = useState('observations');
  const [format, setFormat] = useState('csv');
  const [result, setResult] = useState<ExportResponse | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setResult(null);
    try {
      const res = await api.postExport({ dataset_type: dataset, format, aoi_id: aoiId, start, end, sensors: filters.sensors, platforms: filters.platforms, products: filters.products, include_metadata: true });
      setResult(res);
    } catch (ex) { setErr(String(ex)); } finally { setBusy(false); }
  }

  function download() {
    if (!result) return;
    const url = result.download_url ?? (result.export_id ? api.exportDownloadUrl(result.export_id) : null);
    if (url) { window.open(url.startsWith('http') ? url : `${BASE}${url}`, '_blank'); return; }
    const text = result.data != null ? JSON.stringify(result.data, null, 2) : `${result.file_name ?? 'export'}: no inline data; use download_url`;
    const blob = new Blob([text], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = result.file_name ?? `emberlens-export.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="panel" aria-label="Export">
      <h2>Export</h2>
      <form onSubmit={submit} className="filters">
        <label>Dataset <select value={dataset} onChange={e => setDataset(e.target.value)} aria-label="Dataset type"><option value="observations">Observations</option><option value="calendar">Calendar</option></select></label>
        <label>Format <select value={format} onChange={e => setFormat(e.target.value)} aria-label="Format"><option value="csv">CSV</option><option value="json">JSON</option><option value="geojson">GeoJSON</option></select></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Preparing…' : 'Generate export'}</button>
      </form>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>AOI: {aoiId} · {start} → {end} · Sensors: {filters.sensors.join(', ') || 'all returned'} · Platforms: {filters.platforms.join(', ') || 'all returned'}</p>
      {err && <ErrorState msg={err} />}
      {result && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{result.file_name ?? 'Export ready'}</strong>
            <button className="btn ghost" type="button" onClick={download}>Download</button>
          </div>
          <h3>Metadata manifest</h3>
          <pre className="json">{JSON.stringify(result.manifest ?? result.metadata ?? { note: 'No manifest returned' }, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
