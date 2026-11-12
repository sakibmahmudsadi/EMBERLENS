import { api } from '../lib/apiClient';
import type { ObservationDetail as Detail } from '../lib/types';
import { Loading, ErrorState, Empty } from '../components/States';
import { useEffect, useState } from 'react';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Preserve the detail panel when older APIs return malformed native JSON.
    }
  }
  return {};
}

export function ObservationDetailPanel({ id }: { id: string | null }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    setLoading(true); setErr('');
    api.observationDetail(id).then(d => setDetail(d)).catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [id]);

  if (!id) return <section className="panel observation-detail-panel"><h2>Observation detail</h2><Empty msg="Select a point on the map or a row in the list to inspect provenance." /></section>;
  if (loading) return <section className="panel observation-detail-panel"><h2>Observation detail</h2><Loading label={`Loading ${id}…`} /></section>;
  if (err) return <section className="panel observation-detail-panel"><h2>Observation detail</h2><ErrorState msg={err} /></section>;
  if (!detail) return <section className="panel observation-detail-panel"><h2>Observation detail</h2><Empty /></section>;

  const frp = detail.frp_mw ?? detail.frp_native;
  const native = { ...asRecord(detail.native_fields), ...asRecord(detail.source_attributes) };
  const keys = Object.keys(native);

  return (
    <section className="panel observation-detail-panel" aria-label="Observation detail">
      <div className="detail-panel-heading"><div><span className="activity-insight-kicker"><i /> SOURCE RECORD</span><h2>Observation detail</h2></div><span className="detail-sensor-tag">{detail.sensor} · {detail.platform}</span></div>
      <div className="observation-detail-primary">
        <div><span>ACQUIRED · UTC</span><strong>{detail.acquired_at_utc}</strong></div>
        <div><span>COORDINATES</span><strong>{detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)}</strong></div>
        <div><span>FRP</span><strong>{frp != null ? `${frp} MW` : 'Not supplied'}</strong><small>{frp != null ? `Source native: ${detail.frp_native ?? '—'} MW` : 'Null is not zero'}</small></div>
        <div><span>CONFIDENCE</span><strong>{String(detail.confidence_raw ?? '—')}</strong><small>{detail.confidence_semantics}</small></div>
      </div>
      <details className="detail-disclosure"><summary>Product &amp; provenance</summary><dl className="kv">
        <dt>ID</dt><dd className="mono">{detail.observation_id}</dd>
        <dt>Product</dt><dd>{detail.product_id}{detail.collection_version ? ` · ${detail.collection_version}` : ''}</dd>
        <dt>Snapshot</dt><dd className="mono">{detail.source_snapshot_id}</dd>
        <dt>Fingerprint</dt><dd className="mono">{detail.source_row_fingerprint ?? '—'}</dd>
      </dl></details>
      <details className="detail-disclosure"><summary>Native source fields <span>{keys.length}</span></summary>
        {keys.length ? <dl className="kv">{keys.map(k => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd className="mono">{String(native[k] ?? '—')}</dd></div>)}</dl> : <p>No native fields returned.</p>}
      </details>
    </section>
  );
}
