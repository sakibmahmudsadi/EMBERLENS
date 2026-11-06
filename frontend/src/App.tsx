import { useEffect, useState } from 'react';
import { HotspotMap } from './map/HotspotMap';
import { CalendarMatrix } from './calendar/CalendarMatrix';
import { SensorFilters, SENSOR_EXPLAINER, type SensorFilter } from './sensors/SensorFilters';
import { ObservationDetailPanel } from './observations/ObservationDetail';
import { ExportPanel } from './exports/ExportPanel';
import { Disclosure } from './components/Disclosure';
import { Loading, Empty } from './components/States';
import { api, coverageStatusLabel } from './lib/apiClient';
import type { ObservationListItem, CalendarResponse, CoverageResponse } from './lib/types';

export default function App() {
  const [health, setHealth] = useState('');
  const [aoi, setAoi] = useState<{ aoi_id: string; name: string } | null>(null);
  const [sensorOpts, setSensorOpts] = useState({ sensors: [] as string[], platforms: [] as string[], products: [] as string[] });
  const [filters, setFilters] = useState<SensorFilter>({ sensors: [], platforms: [], products: [] });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [obs, setObs] = useState<ObservationListItem[]>([]);
  const [obsTotal, setObsTotal] = useState(0);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load(pg = 1) {
    setLoading(true); setErr('');
    try {
      const h = await api.health();
      setHealth(String((h as { status?: string }).status ?? 'ok'));
      const a = await api.aois();
      const first = Array.isArray(a) ? (a[0] as { aoi_id: string; name: string }) : ((a as { items?: { aoi_id: string; name: string }[] }).items?.[0] ?? null);
      if (first) setAoi(first);
      const ds = await api.dataSources();
      const items = ds.items ?? ds.sources ?? ds.snapshots ?? [];
      setSensorOpts({ sensors: [...new Set(items.map(i => i.sensor).filter(Boolean))], platforms: [...new Set(items.map(i => i.platform).filter(Boolean))], products: [...new Set(items.map(i => i.product_id).filter(Boolean))] });
      const q = new URLSearchParams();
      if (first?.aoi_id) q.set('aoi_id', first.aoi_id);
      if (filters.sensors.length) q.set('sensors', filters.sensors.join(','));
      if (filters.platforms.length) q.set('platforms', filters.platforms.join(','));
      if (filters.products.length) q.set('products', filters.products.join(','));
      if (start) q.set('start', start);
      if (end) q.set('end', end);
      q.set('page', String(pg)); q.set('page_size', '100');
      const o = await api.observations(q);
      setObs(o.items ?? o.data ?? []); setObsTotal(o.total ?? o.pagination?.total ?? 0); setPage(pg);
      const c = await api.calendar(new URLSearchParams(q.toString().replace(/page.*/, '')));
      setCalendar(c);
      if (!start) setStart(c.period.start); if (!end) setEnd(c.period.end);
      try { const cov = await api.coverage(q); setCoverage(cov); } catch { setCoverage(null); }
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }

  useEffect(() => { load(1); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">EMBER<span>LENS</span></div>
        <span className="tag">Sundarbans demo · MODIS + VIIRS hotspot observations</span>
        <span className="pill" aria-live="polite">API: {health || '…'}</span>
        {aoi && <span className="pill">{aoi.name} ({aoi.aoi_id})</span>}
      </header>

      {err && <div className="banner" role="alert">Backend error: {err} — <button className="btn ghost" onClick={() => load(page)}>Retry</button></div>}
      <div className="banner info">Provisional boundary: the Sundarbans outline shown is a best-effort demo polygon, not an official boundary. Calendar shows sensor-specific counts only — MODIS and VIIRS are never merged. Missing records ≠ zero activity.</div>

      <div className="layout">
        <main className="map-col">
          <HotspotMap observations={obs} onSelect={setSelected} />
          <section className="panel" aria-label="Filters">
            <h2>Sensor / platform filters</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{SENSOR_EXPLAINER}</p>
            <SensorFilters options={sensorOpts} value={filters} onChange={setFilters} />
            <div className="filters" style={{ marginTop: 12 }}>
              <label>Start <input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Start date" /></label>
              <label>End <input type="date" value={end} onChange={e => setEnd(e.target.value)} aria-label="End date" /></label>
              <button className="btn" onClick={() => load(1)}>Apply filters</button>
            </div>
          </section>

          {coverage && (
            <section className="panel" aria-label="Coverage">
              <h2>Coverage</h2>
              {(coverage.items ?? coverage.coverage ?? coverage.availability ?? []).length === 0 ? <Empty msg="Coverage endpoint returned no items." /> :
                <ul className="list">{(coverage.items ?? coverage.coverage ?? coverage.availability ?? []).slice(0, 20).map((c, i) => (
                  <li key={i}><span>{c.sensor ?? ''} {c.product_id ?? ''} · {c.period_start ?? ''} → {c.period_end ?? ''}</span><span className="pill">{coverageStatusLabel(c.status)}</span></li>
                ))}</ul>}
            </section>
          )}

          <section className="panel" aria-label="Observations">
            <h2>Observations ({obsTotal} total)</h2>
            {loading && <Loading />}
            {!loading && !err && obs.length === 0 && <Empty msg="No source records returned; observation coverage unknown" />}
            <ul className="list">
              {obs.map(o => (
                <li key={o.observation_id}>
                  <button onClick={() => setSelected(o.observation_id)}>{o.acquired_at_utc} · {o.sensor} · {o.platform} · {o.product_id}</button>
                  <span className="pill">{o.latitude.toFixed(3)}, {o.longitude.toFixed(3)}</span>
                </li>
              ))}
            </ul>
            <div className="filters" style={{ marginTop: 10 }}>
              <button className="btn ghost" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
              <span>Page {page}</span>
              <button className="btn ghost" disabled={obs.length < 100} onClick={() => load(page + 1)}>Next</button>
            </div>
          </section>

          {calendar ? <CalendarMatrix data={calendar} /> : !loading && !err && <div className="panel"><Empty msg="No calendar data yet — use Apply filters." /></div>}
        </main>

        <aside className="side">
          <ObservationDetailPanel id={selected} />
          <ExportPanel aoiId={aoi?.aoi_id ?? 'demo-aoi'} start={start} end={end} filters={filters} />
        </aside>
      </div>
      <Disclosure />
    </div>
  );
}
