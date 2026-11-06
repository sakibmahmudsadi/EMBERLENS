import { api } from '../lib/apiClient';
import type { ObservationDetail as Detail } from '../lib/types';
import { Loading, ErrorState, Empty } from '../components/States';
import { useEffect, useState } from 'react';

export function ObservationDetailPanel({ id }: { id: string | null }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    setLoading(true); setErr('');
    api.observationDetail(id).then(d => setDetail(d)).catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [id]);

  if (!id) return <section className="panel"><h2>Observation detail</h2><Empty msg="Select a point on the map or a row in the list to inspect provenance." /></section>;
  if (loading) return <section className="panel"><h2>Observation detail</h2><Loading label={`Loading ${id}…`} /></section>;
  if (err) return <section className="panel"><h2>Observation detail</h2><ErrorState msg={err} /></section>;
  if (!detail) return <section className="panel"><h2>Observation detail</h2><Empty /></section>;

  const frp = detail.frp_mw ?? detail.frp_native;
  const native = { ...((detail.native_fields as Record<string, unknown>) ?? {}), ...((detail.source_attributes as Record<string, unknown>) ?? {}) };
  const keys = Object.keys(native);

  return (
    <section className="panel" aria-label="Observation detail">
      <h2>Observation detail</h2>
      <dl className="kv">
        <dt>ID</dt><dd className="mono">{detail.observation_id}</dd>
        <dt>Sensor / platform</dt><dd>{detail.sensor} · {detail.platform}</dd>
        <dt>Product</dt><dd>{detail.product_id} {detail.collection_version ? `(v{detail.collection_version})` : ''}</dd>
        <dt>Acquired (UTC)</dt><dd>{detail.acquired_at_utc}</dd>
        <dt>Location</dt><dd>{detail.latitude}, {detail.longitude}</dd>
        <dt>Confidence</dt><dd>Raw: <code className="mono">{String(detail.confidence_raw ?? '—')}</code> · Semantics: {detail.confidence_semantics}</dd>
        <dt>FRP</dt><dd>{frp != null ? `${frp} MW (source-native ${detail.frp_native ?? '—'})` : 'Not supplied by source (null ≠ zero)'}</dd>
        <dt>Snapshot</dt><dd className="mono">{detail.source_snapshot_id}</dd>
        <dt>Fingerprint</dt><dd className="mono">{detail.source_row_fingerprint ?? '—'}</dd>
      </dl>
      <h3>Native fields</h3>
      {keys.length ? <dl className="kv">{keys.map(k => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd className="mono">{String(native[k] ?? '—')}</dd></div>)}</dl> : <p style={{ fontSize: 13, color: 'var(--muted)' }}>No native fields returned.</p>}
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>A hotspot is a thermal-anomaly detection, not a confirmed wildfire. Coordinates are nominal pixel centres.</p>
    </section>
  );
}
