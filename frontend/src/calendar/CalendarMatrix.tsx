import { useMemo, useState } from 'react';
import type { CalendarResponse, CalendarSeries, CalendarValue } from '../lib/types';
import { coverageStatusLabel } from '../lib/apiClient';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HISTORICAL_CONTEXT_METHOD = 'observed-count-prior-month-IQR-v1';

function shade(count: number, max: number): string {
  if (count === 0 || max === 0) return 'transparent';
  const t = count / max;
  return `rgba(249,115,22,${(0.12 + 0.7 * t).toFixed(2)})`;
}

type HistoricalContext =
  | { state: 'unavailable'; reason: string }
  | { state: 'insufficient'; sampleCount: number; years: number[] }
  | { state: 'compared'; sampleCount: number; years: number[]; median: number; lower: number; upper: number; label: string; snapshotIds: string[] };

function quantile(sorted: number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const fraction = position - lowerIndex;
  return Math.round(sorted[lowerIndex] + (sorted[Math.ceil(position)] - sorted[lowerIndex]) * fraction);
}

function historicalContext(series: CalendarSeries, selected: CalendarValue): HistoricalContext {
  if (selected.coverage_status !== 'records_present' || selected.observation_count <= 0) {
    return {
      state: 'unavailable',
      reason: selected.coverage_status === 'partial_source_data' || selected.coverage_status === 'source_data_gap'
        ? 'Comparison withheld because FIRMS reports a source-data gap in this month.'
        : 'No source records were returned for this month; AOI observation coverage is unknown.',
    };
  }

  const selectedYear = Number(selected.period_start.slice(0, 4));
  const selectedMonth = selected.period_start.slice(5, 7);
  const reference = series.values.filter(value =>
    value.period_start.slice(5, 7) === selectedMonth
    && Number(value.period_start.slice(0, 4)) < selectedYear
    && value.coverage_status === 'records_present'
    && value.observation_count > 0,
  );
  const years = reference.map(value => Number(value.period_start.slice(0, 4))).sort((a, b) => a - b);
  if (reference.length < 5) return { state: 'insufficient', sampleCount: reference.length, years };

  const counts = reference.map(value => value.observation_count).sort((a, b) => a - b);
  const lower = quantile(counts, 0.25);
  const upper = quantile(counts, 0.75);
  const median = quantile(counts, 0.5);
  const label = selected.observation_count > upper
    ? 'Above the observed middle range'
    : selected.observation_count < lower
      ? 'Below the observed middle range'
      : 'Within the observed middle range';
  const snapshotIds = [...new Set(reference.flatMap(value => value.source_snapshot_ids ?? []))].sort();
  return { state: 'compared', sampleCount: reference.length, years, median, lower, upper, label, snapshotIds };
}

export function CalendarMatrix({ data, onInspect }: {
  data: CalendarResponse;
  onInspect?: (series: CalendarSeries, value: CalendarValue) => void;
}) {
  const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const seriesKey = (value: CalendarSeries) => `${value.sensor}-${value.platform}-${value.product_id}`;
  const rememberedIndex = data.series.findIndex(value => seriesKey(value) === activeSeriesKey);
  const activeSeries = rememberedIndex >= 0 ? rememberedIndex : 0;
  const series = data.series[activeSeries];
  const selected = selectedPeriod ? series?.values.find(value => value.period_start === selectedPeriod) ?? null : null;
  const years = useMemo(() => {
    const s = new Set<string>();
    series?.values.forEach(v => s.add(v.period_start.slice(0, 4)));
    return Array.from(s).sort();
  }, [series]);
  if (!data.series.length) return <div className="state">No calendar series returned.</div>;
  if (!series) return <div className="state">Select a sensor series.</div>;
  const max = Math.max(0, ...series.values.map(v => v.observation_count));
  const comparison = selected ? historicalContext(series, selected) : null;

  return (
    <section className="panel" aria-label="Burning-activity calendar">
      <div className="calendar-heading"><h2>Burning activity · month × year</h2><span>199 months</span></div>
      <div className="cal-tabs" role="tablist" aria-label="Sensor series">
        {data.series.map((s, i) => (
          <button key={`${seriesKey(s)}-${i}`} type="button" role="tab" aria-selected={i === activeSeries} className="chip" onClick={() => { setActiveSeriesKey(seriesKey(s)); setSelectedPeriod(null); }}>
            {s.sensor} · {s.platform} · {s.product_id}
          </button>
        ))}
      </div>
      <p className="calendar-intro" title="Monthly satellite observation records. Shading is scaled within the selected sensor series; compare sensors separately.">
        {data.aoi.name} · monthly source records · scale is relative to the selected sensor
      </p>
      <details className="calendar-method">
        <summary>Reading the shading & coverage</summary>
        <p>Counts are source observation records after exact deduplication within each product snapshot. Sensors are never merged. Solid left bar means records were returned; an amber outline marks FIRMS-reported missing source dates; hatching means no records were returned. Empty months do not mean zero fire activity.</p>
        <p className="calendar-metadata">Period: {data.period.start} → {data.period.end} ({data.period.time_zone}) · Time bin: {data.time_bin} · Spatial rule: {data.spatial_rule} · Method: {data.method_version} · Count unit: <code className="mono">{data.count_unit}</code></p>
        {data.limitations.length > 0 && <p>Limitations: {data.limitations.join('; ')}</p>}
      </details>
      <div className="cal-grid-scroll-region">
        <div className="cal-grid" role="grid" aria-label={`Calendar for ${series.sensor} ${series.platform}`}>
          <div className="cal-head">YEAR</div>
          {MONTHS.map(m => <div key={m} className="cal-head" aria-hidden>{m}</div>)}
          {years.map(y => {
            const cells = MONTHS.map((m, mi) => {
              const v = series.values.find(x => x.period_start.startsWith(`${y}-${String(mi + 1).padStart(2, '0')}`));
              const countLabel = !v || (v.observation_count === 0 && v.coverage_status !== 'records_present')
                ? '—'
                : v.observation_count.toLocaleString();
              return (
                <button key={`${y}-${mi}`} type="button" role="gridcell" className="cal-cell" data-status={v?.coverage_status ?? 'coverage_unknown'}
                  style={{ backgroundColor: v ? shade(v.observation_count, max) : undefined, opacity: v ? 1 : 0.5 }}
                  aria-selected={Boolean(v && selected?.period_start === v.period_start)}
                  aria-label={`${m} ${y}: ${v ? v.observation_count === 0 && v.coverage_status !== 'records_present' ? `no source records returned; ${coverageStatusLabel(v.coverage_status)}` : `${v.observation_count} observations, ${coverageStatusLabel(v.coverage_status)}` : 'no source data returned; coverage unknown'}`}
                  title={`${m} ${y}: ${v ? `${countLabel} records · ${coverageStatusLabel(v.coverage_status)}` : 'No source data returned · coverage unknown'}`}
                  onClick={() => v && setSelectedPeriod(v.period_start)}>
                  <span className="cnt">{countLabel}</span>
                  <span className="st">{v ? coverageStatusLabel(v.coverage_status) : 'No data'}</span>
                </button>
              );
            });
            return <div key={y} style={{ display: 'contents' }}><div className="cal-head" style={{ textAlign: 'right', paddingRight: 8 }}>{y}</div>{cells}</div>;
          })}
        </div>
      </div>
      {selected && (
        <details className="cal-detail" aria-live="polite">
          <summary>{selected.period_start.slice(0, 7)} · {selected.observation_count === 0 && selected.coverage_status !== 'records_present' ? 'no source records' : `${selected.observation_count.toLocaleString()} records`} · {coverageStatusLabel(selected.coverage_status)} <span>Open provenance &amp; context</span></summary>
          <h3>{series.sensor} · {series.platform} · {series.product_id}</h3>
          <dl className="kv">
            <dt>Period</dt><dd>{selected.period_start} → {selected.period_end}</dd>
            <dt>Observation records</dt><dd>{selected.observation_count.toLocaleString()}</dd>
            <dt>Coverage status</dt><dd>{coverageStatusLabel(selected.coverage_status)} <code className="mono">({selected.coverage_status})</code></dd>
            <dt>Provenance</dt><dd>Snapshots: {selected.source_snapshot_ids?.join(', ') || '—'} · Generated: {data.provenance.generated_at}</dd>
            <dt>AOI</dt><dd>{data.aoi.name} ({data.aoi.aoi_id}) · {data.aoi.crs}</dd>
          </dl>
          {comparison && <section className="historical-context" aria-label="Historical count context">
            <h4>Historical count context</h4>
            <p className="historical-method">Method: <code className="mono">{HISTORICAL_CONTEXT_METHOD}</code></p>
            {comparison.state === 'unavailable' && <p>{comparison.reason}</p>}
            {comparison.state === 'insufficient' && <p>Not enough earlier same-month records in this calendar window ({comparison.sampleCount} eligible years; 5 required).</p>}
            {comparison.state === 'compared' && <>
              <strong>{comparison.label}</strong>
              <dl className="kv historical-kv">
                <dt>Observed count</dt><dd>{selected.observation_count.toLocaleString()} source records</dd>
                <dt>Earlier same-month sample</dt><dd>{comparison.sampleCount} years ({comparison.years.join(', ')})</dd>
                <dt>Historical median</dt><dd>{comparison.median.toLocaleString()} source records</dd>
                <dt>Observed middle range</dt><dd>{comparison.lower.toLocaleString()}–{comparison.upper.toLocaleString()} source records (25th–75th percentile)</dd>
                <dt>Reference snapshots</dt><dd>{comparison.snapshotIds.join(', ') || 'Not listed'}</dd>
              </dl>
            </>}
            <p className="historical-caveat">Descriptive comparison only. It uses earlier same-month bins in the selected calendar window with returned records and no known FIRMS source gap; valid-pixel observation opportunity is unknown. This is not an anomaly score, expected fire activity, or risk signal.</p>
          </section>}
          {selected.coverage_status === 'no_records_returned_coverage_unverified' && <p style={{ color: '#fdba74', fontSize: 13 }}>No source records returned; observation coverage unknown. Do not read as verified zero activity.</p>}
          <button type="button" className="outline-button" onClick={() => onInspect?.(series, selected)}>
            Inspect source observations for this month
          </button>
        </details>
      )}
    </section>
  );
}
