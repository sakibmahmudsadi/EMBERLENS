import { useState } from 'react';
import { api } from '../lib/apiClient';
import type { HotspotGroupsResponse } from '../lib/types';
import { ErrorState } from '../components/States';

const inclusiveToExclusive = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function HotspotGroupsPanel({ aoiId, sensors }: { aoiId: string; sensors: string[] }) {
  const [start, setStart] = useState('2026-06-01');
  const [end, setEnd] = useState('2026-06-07');
  const [sensor, setSensor] = useState('VIIRS');
  const [gap, setGap] = useState(24);
  const [format, setFormat] = useState<'json' | 'csv' | 'geojson'>('json');
  const [result, setResult] = useState<HotspotGroupsResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setResult(null);
    if (!aoiId || !start || !end || new Date(`${end}T00:00:00Z`) < new Date(`${start}T00:00:00Z`)) {
      setError('Choose a valid inclusive date range.'); return;
    }
    const span = (Date.parse(`${inclusiveToExclusive(end)}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    if (span > 90) { setError('Choose a period of 90 days or less.'); return; }
    setBusy(true);
    const q = new URLSearchParams({ aoi_id: aoiId, start, end: inclusiveToExclusive(end), max_gap_hours: String(gap) });
    if (sensor) q.set('sensor', sensor);
    try { setResult(await api.hotspotGroups(q)); }
    catch (ex) { setError(ex instanceof Error ? ex.message : String(ex)); }
    finally { setBusy(false); }
  }

  function download() {
    if (!result) return;
    const manifest = {
      project: 'EMBERLENS', dataset_type: 'experimental_hotspot_groups',
      created_at_utc: new Date().toISOString(), aoi: result.aoi,
      date_range: { start_utc: result.period.start, end_exclusive_utc: result.period.end, end_inclusive_utc: end, time_zone: result.period.time_zone },
      filters: result.filters,
      method: result.method,
      source_snapshot_ids: result.source_snapshot_ids,
      source_attribution: 'NASA FIRMS active fire data, derived from MODIS and VIIRS observations. Observation detections are not confirmed fire incidents.',
      matching_observations: result.matching_observations,
      group_count: result.group_count,
      geometry_note: format === 'geojson' ? 'Point geometries are group centroids, not fire perimeters. Coordinate reference system: WGS 84 (EPSG:4326).' : undefined,
      limitations: result.limitations,
    };
    let body: string;
    let mime: string;
    if (format === 'geojson') {
      body = JSON.stringify({
        type: 'FeatureCollection', metadata_manifest: manifest,
        features: result.groups.map(group => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [group.centroid.longitude, group.centroid.latitude] },
          properties: group,
        })),
      }, null, 2);
      mime = 'application/geo+json';
    } else if (format === 'csv') {
      const safe = (value: unknown) => {
        let text = String(value ?? '');
        if (/^[=+@\-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const fields = ['group_id', 'label', 'sensor', 'platform', 'product_id', 'observation_count', 'start_utc', 'end_utc', 'duration_hours', 'centroid_latitude', 'centroid_longitude', 'bbox', 'observation_ids', 'source_snapshot_ids'];
      const lines = [fields.join(',')];
      for (const group of result.groups) {
        const row: Record<string, unknown> = { ...group, centroid_latitude: group.centroid.latitude, centroid_longitude: group.centroid.longitude, bbox: group.bbox.join(';'), observation_ids: group.observation_ids.join(';'), source_snapshot_ids: group.source_snapshot_ids.join(';') };
        lines.push(fields.map(field => safe(row[field])).join(','));
      }
      body = `${lines.join('\r\n')}\r\n# metadata_manifest: ${JSON.stringify(manifest)}\r\n`;
      mime = 'text/csv;charset=utf-8';
    } else {
      body = JSON.stringify({ data: result.groups, metadata_manifest: manifest, limitations: result.limitations }, null, 2);
      mime = 'application/json';
    }
    const blob = new Blob([body], { type: mime });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `emberlens-hotspot-groups-${start}-${end}.${format === 'geojson' ? 'geojson' : format}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <section className="panel groups-panel" aria-label="Experimental hotspot groups">
      <div className="surface-heading">
        <div><div className="eyebrow">RECONSTRUCT · EXPERIMENTAL</div><h2>Algorithmic hotspot groups</h2></div>
      </div>
      <p className="groups-note">Nearby detections are grouped by sensor, platform, and product. These experimental groups are not confirmed fires or perimeters. Results are parameter-sensitive and source gaps do not establish observation opportunity.</p>
      <form className="groups-form" onSubmit={run}>
        <label>From<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Through<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>Sensor<select value={sensor} onChange={e => setSensor(e.target.value)}><option value="">All</option>{sensors.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
        <label>Max gap (hours)<input type="number" min="1" max="72" value={gap} onChange={e => setGap(Number(e.target.value))} /></label>
        <button className="apply-button" type="submit" disabled={busy || !aoiId}>{busy ? 'Grouping…' : 'Find groups'}</button>
      </form>
      {error && <ErrorState msg={error} />}
      {result && <div className="groups-results" aria-live="polite">
        <p><strong>{result.group_count.toLocaleString()}</strong> groups from {result.matching_observations.toLocaleString()} observations · {result.method.id} · {result.method.status}</p>
        <p className="groups-note">Pair distance: {typeof result.method.candidate_distance_m === 'number' ? `${result.method.candidate_distance_m} m` : result.method.candidate_distance_m}; component duration cap: {result.method.max_component_duration_hours} h. Each row carries source observation and snapshot IDs.</p>
        <div className="groups-download"><label>Export format<select value={format} onChange={e => setFormat(e.target.value as 'json' | 'csv' | 'geojson')}><option value="json">JSON</option><option value="csv">CSV</option><option value="geojson">GeoJSON (centroids)</option></select></label><button className="btn" type="button" onClick={download}>Download groups</button></div>
        {result.groups.length ? <ul className="group-list">{result.groups.slice(0, 100).map(group => <li key={group.group_id}>
          <div><strong>{group.observation_count} observations</strong><span>{group.sensor} · {group.platform} · {group.product_id}</span></div>
          <div><span>{group.start_utc.replace('T', ' ').slice(0, 16)} → {group.end_utc.replace('T', ' ').slice(0, 16)} UTC</span><span>{group.duration_hours} h · {group.centroid.latitude.toFixed(3)}, {group.centroid.longitude.toFixed(3)}</span></div>
          <details><summary>Evidence: {group.observation_ids.length} observation IDs · {group.source_snapshot_ids.length} snapshot IDs</summary><code>{group.observation_ids.join(', ')}</code><br /><code>{group.source_snapshot_ids.join(', ')}</code></details>
        </li>)}</ul> : <p>No groups met the minimum two-observation rule for this query.</p>}
        {result.groups.length > 100 && <small>Showing first 100 groups; refine the date range or use the API response for the complete result.</small>}
      </div>}
    </section>
  );
}
