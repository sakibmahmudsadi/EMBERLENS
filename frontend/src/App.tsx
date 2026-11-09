import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarMatrix } from './calendar/CalendarMatrix';
import { SeasonalityProfile } from './calendar/SeasonalityProfile';
import { SensorFilters, SENSOR_EXPLAINER, type SensorFilter } from './sensors/SensorFilters';
import { ObservationDetailPanel } from './observations/ObservationDetail';
import { ExportPanel } from './exports/ExportPanel';
import { Disclosure } from './components/Disclosure';
import { HotspotGroupsPanel } from './features/HotspotGroupsPanel';
import { HistoryPlayback } from './features/HistoryPlayback';
import { Empty, Loading } from './components/States';
import { api, coverageStatusLabel } from './lib/apiClient';
import type { Aoi, CalendarResponse, CalendarSeries, CalendarValue, CoverageResponse, MapDensityCell, ObservationListItem } from './lib/types';

const INITIAL_START = '2010-01-01';
const INITIAL_END = '2026-07-31';
const DEMO_BOUNDS: AreaBounds = [88, 20.5, 92.7, 26.7];
const PAGE_SIZE = 100;
const HotspotMap = lazy(() => import('./map/HotspotMap').then(module => ({ default: module.HotspotMap })));
type QualityFilters = { min_frp_native: string; daynight: string; min_modis_confidence: string; viirs_confidence_classes: string[] };
type AreaBounds = [number, number, number, number];
type CalendarInspection = { series: CalendarSeries; value: CalendarValue };
const EMPTY_QUALITY_FILTERS: QualityFilters = { min_frp_native: '', daynight: '', min_modis_confidence: '', viirs_confidence_classes: [] };
function fallbackDensity(rows: ObservationListItem[]): MapDensityCell[] {
  const grouped = new Map<string, MapDensityCell>();
  for (const row of rows) {
    const key = `${row.latitude}:${row.longitude}`;
    let cell = grouped.get(key);
    if (!cell) {
      cell = { latitude: row.latitude, longitude: row.longitude, max_series_count: 0, series: [] };
      grouped.set(key, cell);
    }
    let series = cell.series.find(item => item.sensor === row.sensor && item.platform === row.platform && item.product_id === row.product_id);
    if (!series) {
      series = { sensor: row.sensor, platform: row.platform, product_id: row.product_id, observation_count: 0 };
      cell.series.push(series);
    }
    series.observation_count += 1;
    cell.max_series_count = Math.max(cell.max_series_count, series.observation_count);
  }
  return [...grouped.values()];
}
const apiExclusiveEnd = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};
const inclusiveDateBefore = (exclusiveDate: string) => {
  const value = new Date(`${exclusiveDate.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

function aoiFromResponse(value: { items?: Aoi[] } | Aoi[] | Aoi): Aoi | null {
  const items = Array.isArray(value) ? value : 'items' in value && Array.isArray(value.items) ? value.items : [value as Aoi];
  // The Sundarbans store is a retired prototype. Never silently present it as
  // the active national Bangladesh scope.
  return items.find(item => item.aoi_id === 'bangladesh-bd') ?? null;
}

export default function App() {
  const [health, setHealth] = useState('checking');
  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [sensorOptions, setSensorOptions] = useState({ sensors: [] as string[], platforms: [] as string[], products: [] as string[] });
  const [filters, setFilters] = useState<SensorFilter>({ sensors: [], platforms: [], products: [] });
  const [qualityFilters, setQualityFilters] = useState<QualityFilters>(EMPTY_QUALITY_FILTERS);
  const [draftStart, setDraftStart] = useState(INITIAL_START);
  const [draftEnd, setDraftEnd] = useState(INITIAL_END);
  const [appliedStart, setAppliedStart] = useState(INITIAL_START);
  const [appliedEnd, setAppliedEnd] = useState(INITIAL_END);
  const [observations, setObservations] = useState<ObservationListItem[]>([]);
  const [mapCells, setMapCells] = useState<MapDensityCell[]>([]);
  const [mapViewBounds, setMapViewBounds] = useState<AreaBounds | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<AreaBounds | null>(null);
  const [mapWarning, setMapWarning] = useState('');
  const [mapDensitySupported, setMapDensitySupported] = useState<boolean | null>(null);
  const [playbackYear, setPlaybackYear] = useState<number | null>(null);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [observationTotal, setObservationTotal] = useState(0);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<string | null>(null);
  const [calendarInspection, setCalendarInspection] = useState<CalendarInspection | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const requestSequence = useRef(0);
  const playbackRequestSequence = useRef(0);
  const playbackTimer = useRef<number | null>(null);
  const playbackRunning = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.aois(), api.dataSources()]).then(([h, a, sources]) => {
      if (cancelled) return;
      setHealth(String(h.status ?? 'ok'));
      const nationalAoi = aoiFromResponse(a);
      setAoi(nationalAoi);
      if (!nationalAoi) {
        setError('The Bangladesh national dataset is not loaded in the active database yet. The legacy Sundarbans sample is kept separate.');
        setLoading(false);
      }
      const items = sources.items ?? sources.sources ?? sources.snapshots ?? [];
      setSensorOptions({
        sensors: [...new Set(items.map(item => item.sensor).filter(Boolean))],
        platforms: [...new Set(items.map(item => item.platform).filter(Boolean))],
        products: [...new Set(items.map(item => item.product_id).filter(Boolean))],
      });
    }).catch(e => {
      if (!cancelled) { setHealth('offline'); setError(e instanceof Error ? e.message : String(e)); }
    });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (nextPage = 1, inspection: CalendarInspection | null = null) => {
    if (!aoi) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    const base = new URLSearchParams({ aoi_id: aoi.aoi_id, start: appliedStart, end: apiExclusiveEnd(appliedEnd) });
    if (selectedBounds) base.set('bounds', selectedBounds.join(','));
    if (filters.sensors.length) base.set('sensors', filters.sensors.join(','));
    if (filters.platforms.length) base.set('platforms', filters.platforms.join(','));
    if (filters.products.length) base.set('products', filters.products.join(','));
    if (qualityFilters.min_frp_native !== '') base.set('min_frp_native', qualityFilters.min_frp_native);
    if (qualityFilters.daynight) base.set('daynight', qualityFilters.daynight);
    if (qualityFilters.min_modis_confidence !== '') base.set('min_modis_confidence', qualityFilters.min_modis_confidence);
    if (qualityFilters.viirs_confidence_classes.length) base.set('viirs_confidence_classes', qualityFilters.viirs_confidence_classes.join(','));
    const observationQuery = new URLSearchParams(base);
    if (inspection) {
      observationQuery.set('start', inspection.value.period_start.slice(0, 10));
      observationQuery.set('end', inspection.value.period_end.slice(0, 10));
      observationQuery.set('sensors', inspection.series.sensor);
      observationQuery.set('platforms', inspection.series.platform);
      observationQuery.set('products', inspection.series.product_id);
    }
    observationQuery.set('page', String(nextPage));
    observationQuery.set('page_size', String(PAGE_SIZE));
    const coverageQuery = new URLSearchParams({ aoi_id: aoi.aoi_id });
    if (filters.sensors.length === 1) coverageQuery.set('sensor', filters.sensors[0]);
    if (filters.platforms.length) coverageQuery.set('platform', filters.platforms.join(','));
    if (filters.products.length) coverageQuery.set('product_id', filters.products.join(','));
    try {
      const [o, c, cov, map] = await Promise.all([
        api.observations(observationQuery),
        api.calendar(base),
        api.coverage(coverageQuery),
        api.mapDensity(base).then(value => ({ value, error: '' })).catch(ex => ({ value: null, error: ex instanceof Error ? ex.message : String(ex) })),
      ]);
      if (requestId !== requestSequence.current) return;
      const pageObservations = o.items ?? o.data ?? [];
      setObservations(pageObservations);
      setMapCells(map.value?.cells ?? fallbackDensity(pageObservations));
      setMapDensitySupported(Boolean(map.value));
      setMapWarning(map.value ? '' : 'The API needs a restart to load the full-dataset map and apply the new quality filters. The map is temporarily showing only the current observation page.');
      setObservationTotal(o.total ?? o.pagination?.total ?? 0);
      setCalendar(c);
      setCoverage(cov);
      setPage(nextPage);
    } catch (e) {
      if (requestId !== requestSequence.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setObservations([]);
      setMapCells([]);
      setMapWarning('Map data could not be loaded.');
      setCalendar(null);
      setCoverage(null);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [aoi, appliedStart, appliedEnd, filters, qualityFilters, selectedBounds]);

  useEffect(() => { if (aoi) void load(1, null); }, [aoi, load]);

  const sources = useMemo(() => [...new Set(observations.map(o => `${o.sensor} · ${o.platform}`))], [observations]);
  const recordYears = useMemo(() => {
    const years = new Set<string>();
    calendar?.series.forEach(series => series.values.forEach(value => {
      if (value.observation_count > 0) years.add(value.period_start.slice(0, 4));
    }));
    return [...years].sort();
  }, [calendar]);
  const playbackStartYear = Number(appliedStart.slice(0, 4));
  const playbackEndYear = Number(appliedEnd.slice(0, 4));
  const mappedRecordCount = useMemo(() => mapCells.reduce((total, cell) => total + cell.series.reduce((seriesTotal, series) => seriesTotal + series.observation_count, 0), 0), [mapCells]);
  const selectableBounds = mapViewBounds ? [
    Math.max(mapViewBounds[0], DEMO_BOUNDS[0]), Math.max(mapViewBounds[1], DEMO_BOUNDS[1]),
    Math.min(mapViewBounds[2], DEMO_BOUNDS[2]), Math.min(mapViewBounds[3], DEMO_BOUNDS[3]),
  ] as AreaBounds : null;
  const canSelectMapView = Boolean(selectableBounds && selectableBounds[0] < selectableBounds[2] && selectableBounds[1] < selectableBounds[3]);
  const mapPageObservations = useMemo(() => playbackYear === null ? observations : observations.filter(row => row.acquired_at_utc.slice(0, 4) === String(playbackYear)), [observations, playbackYear]);
  const coverageItems = coverage?.items ?? coverage?.coverage ?? coverage?.availability ?? [];
  const exportStart = calendarInspection?.value.period_start.slice(0, 10) ?? appliedStart;
  const exportEnd = calendarInspection ? inclusiveDateBefore(calendarInspection.value.period_end) : appliedEnd;
  const exportFilters = calendarInspection ? {
    sensors: [calendarInspection.series.sensor],
    platforms: [calendarInspection.series.platform],
    products: [calendarInspection.series.product_id],
  } : filters;
  const coverageSummary = [...new Set(coverageItems.map(item => item.product_id).filter((id): id is string => Boolean(id)))].map(productId => {
    const rows = coverageItems.filter(item => item.product_id === productId);
    const interval = rows.find(item => (item.availability_status ?? item.status) !== 'missing');
    const missingDays = rows.filter(item => (item.availability_status ?? item.status) === 'missing'
      && (!item.date_or_interval || (item.date_or_interval >= appliedStart && item.date_or_interval <= appliedEnd)));
    return { productId, platform: interval?.platform ?? rows[0]?.platform ?? 'Platform unavailable', interval: interval?.date_or_interval ?? 'No availability interval returned', status: interval?.availability_status ?? interval?.status ?? 'unknown', missingDays: missingDays.length };
  });
  const stopMapPlayback = useCallback(() => {
    playbackRunning.current = false;
    if (playbackTimer.current !== null) window.clearTimeout(playbackTimer.current);
    playbackTimer.current = null;
    setPlaybackPlaying(false);
  }, []);
  const resetMapPlayback = useCallback(() => {
    stopMapPlayback();
    playbackRequestSequence.current += 1;
    setPlaybackLoading(false);
    setPlaybackYear(null);
    setPlaybackError('');
  }, [stopMapPlayback]);
  const requestMapYear = useCallback(async (year: number) => {
    if (!aoi) return;
    const start = appliedStart > `${year}-01-01` ? appliedStart : `${year}-01-01`;
    const end = apiExclusiveEnd(appliedEnd) < `${year + 1}-01-01` ? apiExclusiveEnd(appliedEnd) : `${year + 1}-01-01`;
    if (start >= end) {
      stopMapPlayback();
      setPlaybackError(`Year ${year} is outside the selected date range.`);
      return;
    }
    const requestId = ++playbackRequestSequence.current;
    const query = new URLSearchParams({ aoi_id: aoi.aoi_id, start, end });
    if (selectedBounds) query.set('bounds', selectedBounds.join(','));
    if (filters.sensors.length) query.set('sensors', filters.sensors.join(','));
    if (filters.platforms.length) query.set('platforms', filters.platforms.join(','));
    if (filters.products.length) query.set('products', filters.products.join(','));
    if (qualityFilters.min_frp_native !== '') query.set('min_frp_native', qualityFilters.min_frp_native);
    if (qualityFilters.daynight) query.set('daynight', qualityFilters.daynight);
    if (qualityFilters.min_modis_confidence !== '') query.set('min_modis_confidence', qualityFilters.min_modis_confidence);
    if (qualityFilters.viirs_confidence_classes.length) query.set('viirs_confidence_classes', qualityFilters.viirs_confidence_classes.join(','));
    setPlaybackYear(year);
    setPlaybackLoading(true);
    setPlaybackError('');
    try {
      const response = await api.mapDensity(query);
      if (requestId !== playbackRequestSequence.current) return;
      setMapCells(response.cells ?? []);
      setMapDensitySupported(true);
      setMapWarning('');
      if (playbackRunning.current) {
        if (year >= playbackEndYear) {
          playbackRunning.current = false;
          setPlaybackPlaying(false);
        } else {
          playbackTimer.current = window.setTimeout(() => { void requestMapYear(year + 1); }, 850);
        }
      }
    } catch (cause) {
      if (requestId !== playbackRequestSequence.current) return;
      stopMapPlayback();
      setPlaybackError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === playbackRequestSequence.current) setPlaybackLoading(false);
    }
  }, [aoi, appliedStart, appliedEnd, filters, qualityFilters, playbackEndYear, stopMapPlayback, selectedBounds]);
  const playMapHistory = () => {
    if (playbackYear !== null && playbackYear < playbackEndYear) {
      playbackRunning.current = true;
      setPlaybackPlaying(true);
      void requestMapYear(playbackYear);
      return;
    }
    playbackRunning.current = true;
    setPlaybackPlaying(true);
    void requestMapYear(playbackStartYear);
  };
  const selectMapYear = (year: number) => {
    stopMapPlayback();
    void requestMapYear(year);
  };
  useEffect(() => () => {
    playbackRunning.current = false;
    if (playbackTimer.current !== null) window.clearTimeout(playbackTimer.current);
  }, []);
  const applyFilters = () => {
    if (draftStart > draftEnd) { setError('Start date must be on or before end date.'); return; }
    resetMapPlayback();
    setCalendarInspection(null);
    setAppliedStart(draftStart);
    setAppliedEnd(draftEnd);
  };
  const inspectCalendarCell = (series: CalendarSeries, value: CalendarValue) => {
    resetMapPlayback();
    const selection = { series, value };
    setCalendarInspection(selection);
    setSelectedObservation(null);
    void load(1, selection);
  };
  const clearCalendarInspection = () => {
    resetMapPlayback();
    setCalendarInspection(null);
    void load(1, null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="EMBERLENS home">EMBER<span>LENS</span></a>
        <div className="topbar-context"><span className="live-dot" /> Satellite fire observations <span className="context-divider">/</span> Bangladesh</div>
        <div className="topbar-actions">
          <span className={`status-pill ${health === 'ok' ? 'is-online' : ''}`}><i /> API {health}</span>
          {aoi && <span className="aoi-pill">{aoi.name}</span>}
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span>{(aoi || health === 'offline') && <button className="text-button" onClick={() => { resetMapPlayback(); aoi ? void load(page, calendarInspection) : window.location.reload(); }}>Retry</button>}</div>}

      <main id="top">
        <section className="map-stage" aria-label="National observation map">
          <Suspense fallback={<div className="map-wrap map-loading-shell" role="status">Loading map…</div>}>
            <HotspotMap cells={mapCells} observations={mapPageObservations} selectedBounds={selectedBounds} onViewBoundsChange={setMapViewBounds} onSelect={setSelectedObservation} />
          </Suspense>
          <div className="map-heading">
            <div className="eyebrow">OBSERVATION EXPLORER</div>
            <h1>Fire signals,<br /><em>in context.</em></h1>
            <p>Explore satellite thermal-anomaly detections across Bangladesh.</p>
          </div>
          <div className="map-caption"><span className="caption-mark" />{aoi?.aoi_id === 'bangladesh-bd' ? 'Bangladesh' : aoi?.name ?? 'Selected AOI'}{selectedBounds && <><span className="caption-sep">·</span>Selected bounds {selectedBounds.map(value => value.toFixed(3)).join(', ')}</>} · {playbackYear === null ? <>{appliedStart} — {appliedEnd}<span className="caption-sep">·</span>{observationTotal.toLocaleString()} records</> : playbackLoading ? `Loading ${playbackYear} annual map…` : <>{playbackYear} · {mappedRecordCount.toLocaleString()} mapped records{mappedRecordCount === 0 ? ' · observation coverage unknown' : ''}</>}</div>
          {mapWarning && <div className="map-capability-warning" role="status">{mapWarning}</div>}
          <HistoryPlayback startYear={playbackStartYear} endYear={playbackEndYear} year={playbackYear} playing={playbackPlaying} loading={playbackLoading} disabled={mapDensitySupported !== true || !aoi || Boolean(calendarInspection)} error={playbackError} onYearChange={selectMapYear} onPlay={playMapHistory} onPause={stopMapPlayback} onReset={() => { resetMapPlayback(); void load(1, null); }} />
          <div className="map-legend">
            <span className="legend-item"><span className="legend-dot" />{mapWarning ? 'Current page' : 'Grid cells (max series)'}</span>
            <span className="legend-item"><span className="legend-point" />{playbackYear === null ? 'Feed page' : `Page points · ${playbackYear}`}</span>
            <a className="legend-item legend-source-link" href="https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM0/" target="_blank" rel="noreferrer" aria-label="Bangladesh reference outline from geoBoundaries, 2015; display only" title="2015 reference outline for map context only; the query area remains the bounding box"><span className="legend-country-line" />geoBoundaries 2015</a>
            <span className="legend-item"><span className="legend-line" />Query bbox</span>
            {selectedBounds && <span className="legend-item"><span className="legend-selected-area" />Selected area</span>}
          </div>
          <div className="filter-dock" aria-label="Observation filters">
            <div className="dock-filter dock-sensors"><span className="dock-label">SENSORS</span><SensorFilters options={sensorOptions} value={filters} onChange={value => { resetMapPlayback(); setCalendarInspection(null); setFilters(value); }} compact /></div>
            <label className="dock-date"><span className="dock-label">FROM</span><input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)} /></label>
            <label className="dock-date"><span className="dock-label">TO</span><input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)} /></label>
            <button className="apply-button" onClick={applyFilters}>Update map <span>↗</span></button>
            <div className="dock-area-actions">
              {selectedBounds && <span className="dock-label">AREA FILTER ACTIVE</span>}
              <button type="button" className="outline-button" disabled={!canSelectMapView} onClick={() => { resetMapPlayback(); setCalendarInspection(null); setSelectedBounds(selectableBounds); }}>
                {selectedBounds ? 'Update selected area' : 'Use map view as area'}
              </button>
              {selectedBounds && <button type="button" className="text-button" onClick={() => { resetMapPlayback(); setCalendarInspection(null); setSelectedBounds(null); }}>Full Bangladesh</button>}
            </div>
          </div>
          {loading && <div className="map-loading"><span className="spinner" /> Updating observations…</div>}
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><div className="eyebrow">PLACE INTELLIGENCE</div><h2>{aoi?.name ?? 'Bangladesh'} <span>· Observed activity</span></h2></div>
            <div className="section-meta">{sources.length ? sources.join('  /  ') : 'MODIS + VIIRS'}<span>Counts remain sensor-specific</span></div>
          </div>
          <div className="summary-strip">
            <div className="summary-item"><span className="summary-label">SOURCE RECORDS</span><strong>{observationTotal.toLocaleString()}</strong><small>Across selected products · not fire incidents</small></div>
            <div className="summary-item"><span className="summary-label">OBSERVATIONS LOADED</span><strong>{observations.length.toLocaleString()}</strong><small>Current page of source records</small></div>
            <div className="summary-item"><span className="summary-label">QUERY WINDOW</span><strong>{appliedStart.slice(0, 4)} — {appliedEnd.slice(0, 4)}</strong><small>Selected dates · acquisition time UTC</small></div>
            <div className="summary-item"><span className="summary-label">RECORD YEARS</span><strong>{recordYears.length ? `${recordYears[0]} — ${recordYears[recordYears.length - 1]}` : 'No records'}</strong><small>Years with returned observations</small></div>
            <div className="summary-item"><span className="summary-label">PRODUCT SOURCES</span><strong>{sensorOptions.sensors.length || '—'}</strong><small>Sensor types available in this dataset</small></div>
          </div>

          <section className="quality-filter-panel" aria-label="Observation quality filters">
            <div><div className="eyebrow">OBSERVATION FILTERS</div><h3>Refine detections</h3><p>{mapWarning || 'Native thresholds stay sensor-specific. These filters update the map, feed, and calendar together.'}</p></div>
            <label>Minimum FRP (native)<input disabled={mapDensitySupported === false} type="number" min="0" step="any" value={qualityFilters.min_frp_native} onChange={e => { resetMapPlayback(); setCalendarInspection(null); setQualityFilters(v => ({ ...v, min_frp_native: e.target.value })); }} placeholder="Any" /></label>
            <label>Day / night<select disabled={mapDensitySupported === false} value={qualityFilters.daynight} onChange={e => { resetMapPlayback(); setCalendarInspection(null); setQualityFilters(v => ({ ...v, daynight: e.target.value })); }}><option value="">All</option><option value="D">Day</option><option value="N">Night</option></select></label>
            <label>MODIS numeric confidence ≥<input disabled={mapDensitySupported === false} type="number" min="0" max="100" step="1" value={qualityFilters.min_modis_confidence} onChange={e => { resetMapPlayback(); setCalendarInspection(null); setQualityFilters(v => ({ ...v, min_modis_confidence: e.target.value })); }} placeholder="Any" /></label>
            <label>VIIRS native class<select disabled={mapDensitySupported === false} value={qualityFilters.viirs_confidence_classes[0] ?? ''} onChange={e => { resetMapPlayback(); setCalendarInspection(null); setQualityFilters(v => ({ ...v, viirs_confidence_classes: e.target.value ? [e.target.value] : [] })); }}><option value="">All</option><option value="L">Low</option><option value="N">Nominal</option><option value="H">High</option></select></label>
            <button type="button" className="outline-button" onClick={() => { resetMapPlayback(); setCalendarInspection(null); setQualityFilters(EMPTY_QUALITY_FILTERS); }}>Clear quality filters</button>
          </section>

          {calendar ? <CalendarMatrix data={calendar} onInspect={inspectCalendarCell} /> : loading ? <section className="surface"><Loading /></section> : <section className="surface"><Empty msg="No calendar data is available for this selection." /></section>}
          {calendar && <SeasonalityProfile data={calendar} />}
          {aoi && <HotspotGroupsPanel aoiId={aoi.aoi_id} sensors={sensorOptions.sensors} bounds={selectedBounds} />}

          <div className="detail-grid">
            <section className="surface observations-panel">
              <div className="surface-heading"><div><div className="eyebrow">SOURCE RECORDS</div><h3>Observation feed</h3>{calendarInspection && <p className="feed-scope">{calendarInspection.series.sensor} · {calendarInspection.series.platform} · {calendarInspection.value.period_start.slice(0, 7)} <button type="button" className="text-button" onClick={clearCalendarInspection}>Clear month filter</button></p>}</div><span className="record-count">{observationTotal.toLocaleString()} records</span></div>
              {loading ? <Loading /> : observations.length === 0 ? <Empty msg="No source records returned; observation coverage unknown." /> : (
                <ul className="observation-list">{observations.map(o => <li key={o.observation_id}>
                  <button className="observation-row" onClick={() => setSelectedObservation(o.observation_id)}>
                    <span className="observation-time">{o.acquired_at_utc.replace('T', ' ').replace('Z', ' UTC')}</span>
                    <span className="observation-source">{o.sensor} <i>·</i> {o.platform}</span>
                    <span className="observation-location">{o.latitude.toFixed(3)}, {o.longitude.toFixed(3)}</span>
                    <span className="row-arrow">↗</span>
                  </button>
                </li>)}</ul>
              )}
              <div className="pagination"><button className="outline-button" disabled={page <= 1 || loading} onClick={() => { resetMapPlayback(); void load(page - 1, calendarInspection); }}>Previous</button><span>Page {page}</span><button className="outline-button" disabled={observations.length < PAGE_SIZE || loading} onClick={() => { resetMapPlayback(); void load(page + 1, calendarInspection); }}>Next</button></div>
            </section>
            <aside className="side-column">
              <ObservationDetailPanel id={selectedObservation} />
              <ExportPanel aoiId={aoi?.aoi_id ?? ''} bounds={selectedBounds} start={exportStart} end={exportEnd} filters={exportFilters} qualityFilters={qualityFilters} qualityFilteringAvailable={mapDensitySupported !== false} />
              <section className="surface coverage-panel"><div className="eyebrow">SOURCE AVAILABILITY</div><h3>Coverage notes</h3><p>FIRMS availability describes data in the source service; it does not confirm clear-sky or valid-pixel observation opportunities.</p>
                {coverageSummary.length === 0 ? <small>No source-availability evidence returned.</small> : <ul>{coverageSummary.map(item => <li key={item.productId}><span>{item.productId} · {item.platform}</span><span>{item.interval} · {coverageStatusLabel(item.status)} · {item.missingDays} FIRMS-reported missing day{item.missingDays === 1 ? '' : 's'}</span></li>)}</ul>}
              </section>
            </aside>
          </div>
          <p className="sensor-note">{SENSOR_EXPLAINER}</p>
        </section>
      </main>
      <Disclosure />
    </div>
  );
}
