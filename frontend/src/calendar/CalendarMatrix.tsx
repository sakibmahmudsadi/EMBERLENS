import { useMemo, useState } from 'react';
import type { CalendarResponse, CalendarValue } from '../lib/types';
import { coverageStatusLabel } from '../lib/apiClient';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function shade(count: number, max: number): string {
  if (count === 0 || max === 0) return 'transparent';
  const t = count / max;
  return `rgba(249,115,22,${(0.12 + 0.7 * t).toFixed(2)})`;
}

export function CalendarMatrix({ data }: { data: CalendarResponse }) {
  const [activeSeries, setActiveSeries] = useState(0);
  const [selected, setSelected] = useState<CalendarValue | null>(null);
  const series = data.series[activeSeries];
  const years = useMemo(() => {
    const s = new Set<string>();
    series?.values.forEach(v => s.add(v.period_start.slice(0, 4)));
    return Array.from(s).sort();
  }, [series]);
  if (!data.series.length) return <div className="state">No calendar series returned.</div>;
  if (!series) return <div className="state">Select a sensor series.</div>;
  const max = Math.max(0, ...series.values.map(v => v.observation_count));

  return (
    <section className="panel" aria-label="Burning-activity calendar">
      <h2>Burning-activity calendar — month × year</h2>
      <div className="cal-tabs" role="tablist" aria-label="Sensor series">
        {data.series.map((s, i) => (
          <button key={`${s.sensor}-${s.platform}-${s.product_id}-${i}`} type="button" role="tab" aria-selected={i === activeSeries} className="chip" onClick={() => { setActiveSeries(i); setSelected(null); }}>
            {s.sensor} · {s.platform} · {s.product_id}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
        Count unit: <code className="mono">{data.count_unit}</code> · Time bin: {data.time_bin} · Spatial rule: {data.spatial_rule} · Method: {data.method_version} ·
        Period: {data.period.start} → {data.period.end} ({data.period.time_zone})
        <br />Series are never merged across sensors. Shading = count scale <em>within this series only</em>. Solid left bar = records present. Hatched = no records returned.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div className="cal-grid" role="grid" aria-label={`Calendar for ${series.sensor} ${series.platform}`}>
          <div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" /><div className="cal-head" />
          {MONTHS.map(m => <div key={m} className="cal-head" aria-hidden>{m}</div>)}
          {years.map(y => {
            const cells = MONTHS.map((m, mi) => {
              const v = series.values.find(x => x.period_start.startsWith(`${y}-${String(mi + 1).padStart(2, '0')}`));
              return (
                <button key={`${y}-${mi}`} type="button" role="gridcell" className="cal-cell" data-status={v?.coverage_status ?? 'coverage_unknown'}
                  style={{ backgroundColor: v ? shade(v.observation_count, max) : undefined, opacity: v ? 1 : 0.5 }}
                  aria-selected={selected?.period_start === v?.period_start && selected?.observation_count === v?.observation_count}
                  aria-label={`${m} ${y}: ${v ? `${v.observation_count} observations, ${coverageStatusLabel(v.coverage_status)}` : 'no data'}`}
                  onClick={() => v && setSelected(v)}>
                  <span className="cnt">{v ? v.observation_count : '—'}</span>
                  <span className="st">{v ? coverageStatusLabel(v.coverage_status) : 'No data'}</span>
                </button>
              );
            });
            return [<div key={y} style={{ display: 'contents' }}><div className="cal-head" style={{ textAlign: 'right', paddingRight: 8 }}>{y}</div>{cells}</div>];
          })}
        </div>
      </div>
      {selected && (
        <div className="cal-detail" aria-live="polite">
          <h3>{series.sensor} · {series.platform} · {series.product_id}</h3>
          <dl className="kv">
            <dt>Period</dt><dd>{selected.period_start} → {selected.period_end}</dd>
            <dt>Count</dt><dd>{selected.observation_count} ({data.count_unit})</dd>
            <dt>Coverage status</dt><dd>{coverageStatusLabel(selected.coverage_status)} <code className="mono">({selected.coverage_status})</code></dd>
            <dt>Provenance</dt><dd>Snapshots: {data.provenance.source_snapshot_ids.join(', ') || '—'} · Generated: {data.provenance.generated_at}</dd>
            <dt>AOI</dt><dd>{data.aoi.name} ({data.aoi.aoi_id}) · {data.aoi.crs}</dd>
          </dl>
          {selected.coverage_status === 'no_records_returned_coverage_unverified' && <p style={{ color: '#fdba74', fontSize: 13 }}>No source records returned; observation coverage unknown. Do not read as verified zero activity.</p>}
        </div>
      )}
      {data.limitations.length > 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Limitations: {data.limitations.join('; ')}</p>}
    </section>
  );
}
