import { useMemo, useState } from 'react';
import type { PlaceItem } from './PlaceSearch';
import type { AreaBounds } from '../map/HotspotMap';
import type {
  CalendarResponse,
  ObservationListItem,
} from '../lib/types';
import type { QualityFilters } from './FilterDock';
import type { SensorFilter } from '../sensors/SensorFilters';
import { CalendarMatrix } from '../calendar/CalendarMatrix';
import { SeasonalityProfile } from '../calendar/SeasonalityProfile';
import { ObservationDetailPanel } from '../observations/ObservationDetail';
import { ExportPanel } from '../exports/ExportPanel';
import { FilterDock } from './FilterDock';
import { PlaceSearch } from './PlaceSearch';

export type WorkspaceTab = 'overview' | 'activity' | 'trends';

export interface PlaceAnalysisWorkspaceProps {
  isOpen: boolean;
  place: PlaceItem | null;
  onClose: () => void;
  onSelectPlace: (place: PlaceItem, applyAsFilter?: boolean) => void;

  // Active data
  calendar: CalendarResponse | null;
  observations: ObservationListItem[];
  observationTotal: number;
  selectedObservation: string | null;
  onSelectObservation: (id: string | null) => void;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  loading: boolean;

  // Filters & Options
  sensorOptions: { sensors: string[]; platforms: string[]; products: string[] };
  sensorsFilter: SensorFilter;
  onSensorsChange: (filter: SensorFilter) => void;
  appliedStart: string;
  appliedEnd: string;
  onPeriodChange: (start: string, end: string) => void;
  qualityFilters: QualityFilters;
  onQualityFiltersChange: (filters: QualityFilters) => void;

  // Export parameters
  aoiId: string;
  selectedBounds: AreaBounds | null;
  previewImage: string | null;
  qualityFilteringAvailable: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SERIES_COLORS = ['#ff642d', '#ff9d3d', '#ffd166', '#e98237', '#f6bd60'];

export function PlaceAnalysisWorkspace({
  isOpen,
  place,
  onClose,
  onSelectPlace,
  calendar,
  observations,
  observationTotal,
  selectedObservation,
  onSelectObservation,
  page,
  pageSize,
  onPageChange,
  loading,
  sensorOptions,
  sensorsFilter,
  onSensorsChange,
  appliedStart,
  appliedEnd,
  onPeriodChange,
  qualityFilters,
  onQualityFiltersChange,
  aoiId,
  selectedBounds,
  previewImage,
  qualityFilteringAvailable,
}: PlaceAnalysisWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [yearWindow, setYearWindow] = useState<'all' | '10' | '5'>('all');
  const [activityPageIndex, setActivityPageIndex] = useState(0);

  // Active place metadata
  const placeName = place?.name ?? 'Bangladesh · National Query Area';
  const centerLat = place?.center[1] ?? 23.6;
  const centerLng = place?.center[0] ?? 90.35;
  const bounds = place?.bounds ?? selectedBounds ?? [88.0, 20.5, 92.7, 26.7];
  const placeDescription = place?.description ??
    'National Bangladesh task-specific rectangular query area. The box includes nearby border regions and is not an authoritative national boundary.';

  // Start & End years for labels
  const startYearNum = Number(appliedStart.slice(0, 4)) || 2010;
  const endYearNum = Number(appliedEnd.slice(0, 4)) || 2026;
  const periodLabel = `${startYearNum} – ${endYearNum}`;

  // Derive annual activity data per series from calendar response
  const annualActivity = useMemo(() => {
    const yearsMap = new Map<number, { [seriesKey: string]: number }>();

    for (let y = startYearNum; y <= endYearNum; y++) {
      yearsMap.set(y, {});
    }

    if (calendar && calendar.series.length) {
      for (const s of calendar.series) {
        const seriesKey = `${s.sensor} · ${s.platform}`;
        for (const val of s.values) {
          const y = Number(val.period_start.slice(0, 4));
          if (yearsMap.has(y)) {
            const entry = yearsMap.get(y)!;
            entry[seriesKey] = (entry[seriesKey] ?? 0) + val.observation_count;
          }
        }
      }
    }

    return Array.from(yearsMap.entries()).map(([year, seriesCounts]) => {
      return {
        year,
        counts: seriesCounts,
      };
    });
  }, [calendar, startYearNum, endYearNum]);

  // Derive peak year and detections
  const { peakYear, peakCount, peakSeries } = useMemo(() => {
    let bestYear: number | null = null;
    let bestSeries: string | null = null;
    let maxCount = 0;

    for (const item of annualActivity) {
      for (const [series, count] of Object.entries(item.counts)) {
        if (count > maxCount) {
          maxCount = count;
          bestYear = item.year;
          bestSeries = series;
        }
      }
    }

    return { peakYear: bestYear, peakCount: maxCount, peakSeries: bestSeries };
  }, [annualActivity]);

  // Derive monthly seasonality aggregates across series
  const monthlySeasonality = useMemo<Array<{ month: string; counts: Record<string, number> }>>(() => {
    if (!calendar || !calendar.series.length) {
      return MONTH_NAMES.map(name => ({
        month: name,
        counts: {},
      }));
    }

    return MONTH_NAMES.map((monthName, idx) => {
      const monthNum = idx + 1;
      const seriesCounts: Record<string, number> = {};

      for (const s of calendar.series) {
        const matchingValues = s.values.filter(v => Number(v.period_start.slice(5, 7)) === monthNum);
        seriesCounts[`${s.sensor} · ${s.platform}`] = matchingValues.reduce((sum, v) => sum + v.observation_count, 0);
      }

      return {
        month: monthName,
        counts: seriesCounts,
      };
    });
  }, [calendar]);

  // Derive confidence distribution
  const confidenceBySensor = useMemo(() => {
    const result: Record<string, { sample: number; withConfidence: number; low: number; nominal: number; high: number; numericBins: number[] }> = {};
    for (const observation of observations) {
      const sensor = observation.sensor.toUpperCase().includes('VIIRS') || observation.product_id?.includes('VIIRS') ? 'VIIRS' : 'MODIS';
      const entry = result[sensor] ?? (result[sensor] = { sample: 0, withConfidence: 0, low: 0, nominal: 0, high: 0, numericBins: [0, 0, 0, 0, 0] });
      entry.sample += 1;
      if (sensor === 'VIIRS') {
        const category = String(observation.confidence_class ?? observation.confidence_class_native ?? '').toUpperCase();
        if (category === 'H') { entry.withConfidence += 1; entry.high += 1; }
        else if (category === 'L') { entry.withConfidence += 1; entry.low += 1; }
        else if (category === 'N') { entry.withConfidence += 1; entry.nominal += 1; }
      } else {
        const raw = observation.confidence ?? observation.confidence_raw;
        if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) {
          entry.withConfidence += 1;
          entry.numericBins[Math.min(4, Math.floor(Number(raw) / 20))] += 1;
        }
      }
    }
    return result;
  }, [observations]);

  // Derived Active Area in km² (based on occupied 0.08° grid cells, ~64 km² per cell)
  const activeAreaKm2 = useMemo(() => {
    const [west, south, east, north] = bounds;
    const widthKm = (east - west) * 111.32 * Math.cos(((north + south) / 2 * Math.PI) / 180);
    const heightKm = (north - south) * 110.574;
    return Math.round(widthKm * heightKm);
  }, [bounds]);

  // Compute maximum annual count for chart scaling
  const maxAnnualCount = useMemo(() => {
    let max = 1;
    for (const item of annualActivity) {
      for (const count of Object.values(item.counts)) if (count > max) max = count;
    }
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 50) return 50;
    if (max <= 100) return 100;
    if (max <= 500) return 500;
    if (max <= 1000) return 1000;
    return Math.ceil(max / 500) * 500;
  }, [annualActivity]);
  const visibleAnnualActivity = yearWindow === 'all'
    ? annualActivity
    : annualActivity.filter(item => item.year >= endYearNum - Number(yearWindow) + 1);

  const confidencePanel = (
    <div className="confidence-card location-confidence-card">
      <div className="confidence-card-header"><h4 className="card-subheading">Native Confidence by Sensor</h4></div>
      <div className={`confidence-visuals ${Object.keys(confidenceBySensor).length === 1 ? 'is-single' : 'is-paired'}`}>
        {Object.entries(confidenceBySensor).length ? Object.entries(confidenceBySensor).map(([sensor, data]) => {
          const bins = sensor === 'VIIRS'
            ? [{ label: 'Low', count: data.low }, { label: 'Nominal', count: data.nominal }, { label: 'High', count: data.high }]
            : data.numericBins.map((count, index) => ({ label: `${index * 20}–${index * 20 + 19}`, count }));
          const total = bins.reduce((sum, bin) => sum + bin.count, 0);
          const palette = ['#f4511e', '#ff6d24', '#ff8f2f', '#ffb33d', '#ffd05a'];
          let edge = 0;
          const stops = bins.map((bin, index) => {
            const from = edge;
            edge += total ? (bin.count / total) * 100 : 0;
            return `${palette[index % palette.length]} ${from}% ${edge}%`;
          });
          return (
            <div className="confidence-sensor" key={sensor}>
              <div className="confidence-donut" style={{ background: total ? `conic-gradient(from -90deg, ${stops.join(', ')})` : 'conic-gradient(#28343d 0% 100%)' }}><span>{total}</span></div>
              <div className="confidence-legend">
                <strong>{sensor}{sensor === 'MODIS' ? ' · numeric' : ' · classes'}</strong>
                <div className="confidence-tooltip" role="tooltip">
                  {bins.map((bin, index) => <span key={bin.label}><i style={{ background: palette[index % palette.length] }} />{bin.label} <b>{bin.count}</b></span>)}
                </div>
              </div>
            </div>
          );
        }) : <p className="native-confidence-empty">No confidence values returned.</p>}
      </div>
    </div>
  );

  // The backend page remains intact; a small local page keeps the visible feed
  // readable while every returned observation is still reachable.
  const activityPageSize = 8;
  const activityPageCount = Math.max(1, Math.ceil(observations.length / activityPageSize));
  const visibleActivityPage = Math.min(activityPageIndex, activityPageCount - 1);
  const visibleObservations = observations.slice(
    visibleActivityPage * activityPageSize,
    (visibleActivityPage + 1) * activityPageSize,
  );
  const activityRangeStart = observations.length
    ? (page - 1) * pageSize + visibleActivityPage * activityPageSize + 1
    : 0;
  const activityRangeEnd = observations.length
    ? Math.min((page - 1) * pageSize + (visibleActivityPage + 1) * activityPageSize, observationTotal)
    : 0;
  const maxSampleFrp = observations.reduce((maximum, observation) => {
    const value = observation.frp_mw ?? observation.frp_native;
    return typeof value === 'number' ? Math.max(maximum, value) : maximum;
  }, 0);
  const sampleSensors = [...new Set(observations.map(observation => `${observation.sensor} · ${observation.platform}`))];
  const activityObservationDetail = selectedObservation ? (
    <div className="activity-location-detail">
      <ObservationDetailPanel id={selectedObservation} />
    </div>
  ) : (
    <section className="panel activity-insight-card activity-location-detail" aria-label="Observation sample summary">
      <div className="activity-insight-kicker"><i /> LIVE SAMPLE</div>
      <h2>Detection snapshot</h2>
      <div className="activity-insight-stats">
        <div><strong>{observationTotal.toLocaleString()}</strong><span>returned records</span></div>
        <div><strong>{maxSampleFrp ? `${maxSampleFrp.toFixed(1)} MW` : '—'}</strong><span>sample peak FRP</span></div>
      </div>
      <div className="activity-sensor-list">
        {sampleSensors.slice(0, 4).map(sensor => <span key={sensor}>{sensor}</span>)}
      </div>
      <p>Select a row to inspect its original values and source record.</p>
      <small>Thermal detections are satellite observations, not confirmed fires. Missing FRP is not zero.</small>
    </section>
  );

  if (!isOpen) return null;

  return (
    <div className="place-analysis-backdrop" role="dialog" aria-modal="true" aria-label={`Place Analysis for ${placeName}`}>
      <main className="place-analysis-workspace">
        {/* 1. Clean Top Bar */}
        <header className="workspace-topbar">
          <div className="workspace-brand">EMBERLENS</div>
          <div className="workspace-topbar-right">
            <PlaceSearch onSelectPlace={onSelectPlace} selectedPlace={place} />
          </div>
        </header>

        {/* 2. Main Flat Dashboard Grid */}
        <div className="workspace-dashboard-scrollable">
          <div className="workspace-grid-layout">
            {/* Left Location Card (Unified across tabs) */}
            <aside className="location-card">
              <div className="location-card-header">
                <div className="location-title-group">
                  <h2 className="location-name">{placeName.split('(')[0].trim()}</h2>
                  <div className="location-subtitle">
                    Bangladesh · {centerLat.toFixed(4)}° N, {centerLng.toFixed(4)}° E
                  </div>
                </div>
                <button
                  type="button"
                  className="location-card-close-btn"
                  onClick={onClose}
                  title="Close Place Analysis and return to map"
                  aria-label="Close Place Analysis"
                >
                  ✕
                </button>
              </div>

              {/* Inline Navigation Tabs */}
              <nav className="location-nav-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  data-tab="overview"
                  aria-selected={activeTab === 'overview'}
                  className={`location-tab-btn ${activeTab === 'overview' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  data-tab="activity"
                  aria-selected={activeTab === 'activity'}
                  className={`location-tab-btn ${activeTab === 'activity' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('activity')}
                >
                  Fire Activity
                </button>
                <button
                  type="button"
                  role="tab"
                  data-tab="trends"
                  aria-selected={activeTab === 'trends'}
                  className={`location-tab-btn ${activeTab === 'trends' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('trends')}
                >
                  Trends
                </button>
              </nav>

              {/* Map preview and place summary belong to Overview, not the record feed. */}
              {activeTab === 'overview' && <>
              <div className="location-minimap-box" title="Geographic query area preview">
                {previewImage ? <img className="location-real-map-preview" src={previewImage} alt={`Live map preview near ${placeName}`} /> :
                <svg viewBox="0 0 280 160" className="location-minimap-svg" preserveAspectRatio="none">
                  <defs>
                    <radialGradient id="minimap-bg" cx="50%" cy="50%" r="75%">
                      <stop offset="0%" stopColor="#0d251d" />
                      <stop offset="50%" stopColor="#081817" />
                      <stop offset="100%" stopColor="#050e14" />
                    </radialGradient>
                    <filter id="fire-glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="water-shadow">
                      <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000000" floodOpacity="0.6" />
                    </filter>
                  </defs>

                  {/* Terrain and Waterway geometry */}
                  <rect width="280" height="160" fill="url(#minimap-bg)" rx="8" />

                  {/* Organic delta waterways / coast */}
                  <path
                    d="M0,115 C45,120 70,105 110,125 C150,145 190,120 230,135 C255,145 270,140 280,142 L280,160 L0,160 Z"
                    fill="#051929"
                  />
                  <path
                    d="M75,0 C80,45 65,70 95,95 C115,110 100,130 90,160"
                    fill="none"
                    stroke="#08233a"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M165,0 C160,35 180,60 170,95 C160,120 180,140 175,160"
                    fill="none"
                    stroke="#08233a"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M130,50 C145,75 140,100 135,160"
                    fill="none"
                    stroke="#08233a"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M210,30 C225,65 215,90 220,135"
                    fill="none"
                    stroke="#08233a"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Dynamic or illustrative active fire markers */}
                  <g filter="url(#fire-glow)">
                    {observations.length > 0 ? (
                      observations.slice(0, 45).map((observation, idx) => {
                        const [w, s, e, n] = bounds;
                        const lonSpan = Math.max(0.01, e - w);
                        const latSpan = Math.max(0.01, n - s);
                        const x = Math.max(15, Math.min(265, ((observation.longitude - w) / lonSpan) * 250 + 15));
                        const y = Math.max(15, Math.min(145, ((n - observation.latitude) / latSpan) * 130 + 15));
                        return (
                          <circle
                            key={`${observation.latitude}-${observation.longitude}-${idx}`}
                            cx={x}
                            cy={y}
                            r={2.4}
                            fill="#f97316"
                            opacity={0.85}
                          />
                        );
                      })
                    ) : (
                      <text x="140" y="84" textAnchor="middle" fill="#94a3b8" fontSize="10">
                        No detections in returned sample
                      </text>
                    )}
                  </g>
                </svg>}

                {/* Top-Right Expand Icon */}
                <button
                  type="button"
                  className="minimap-expand-btn"
                  onClick={onClose}
                  title="Expand to Fullscreen Map"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>

                {/* Bottom-Left Scale Bar */}
                <div className="minimap-scale-bar">
                  <span className="scale-line" />
                  <span className="scale-text">20 km</span>
                </div>
              </div>

              {/* Description Paragraph */}
              <p className="location-description">{placeDescription}</p>
              </>}

              {activeTab === 'activity' ? activityObservationDetail : activeTab === 'overview' ? confidencePanel : null}
            </aside>

            {/* Main Stage: Changes based on selected tab */}
            <div className="workspace-main-stage">
              {/* TAB 1: OVERVIEW (Matches Reference Image) */}
              {activeTab === 'overview' && (
                <div className="overview-tab-content">
                  {/* Row 1: 4 Stat Cards */}
                  <div className="stat-cards-grid">
                    {/* Card 1: Total Detections */}
                    <div className="stat-card">
                      <div className="stat-card-header">
                        <svg className="stat-card-icon is-flame" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2c.5 3-1.5 5-1.5 7 0 2.5 2 4.5 4.5 4.5 3 0 5-2.5 5-5.5 0 6.5-5 12-11 12S3 16 3 11c0-4.5 3.5-8 7-9 0 2 .5 3.5 2 0z" />
                        </svg>
                        <span className="stat-card-title">Total Detections</span>
                      </div>
                      <div className="stat-card-number">
                        {observationTotal.toLocaleString()}
                      </div>
                      <div className="stat-card-sub">Returned product rows · {periodLabel}</div>
                    </div>

                    {/* Card 2: Peak Year */}
                    <div className="stat-card">
                      <div className="stat-card-header">
                        <svg className="stat-card-icon is-bar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <span className="stat-card-title">Peak Year</span>
                      </div>
                      <div className="stat-card-number">{peakYear ?? '—'}</div>
                      <div className="stat-card-sub">{peakSeries ?? 'No returned series'} · {peakCount.toLocaleString()} detections</div>
                    </div>

                    {/* Card 3: High Confidence */}
                    <div className="stat-card">
                      <div className="stat-card-header">
                        <svg className="stat-card-icon is-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="5" />
                          <circle cx="12" cy="12" r="1" fill="currentColor" />
                        </svg>
                        <span className="stat-card-title">Native Confidence</span>
                      </div>
                      <div className="stat-card-number">{observations.length.toLocaleString()}</div>
                      <div className="stat-card-sub">Returned observations with confidence fields</div>
                    </div>

                    {/* Card 4: Active Area (Approx.) */}
                    <div className="stat-card">
                      <div className="stat-card-header">
                        <svg className="stat-card-icon is-grid" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="6" cy="6" r="2" />
                          <circle cx="12" cy="6" r="2" />
                          <circle cx="18" cy="6" r="2" />
                          <circle cx="6" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="18" cy="12" r="2" />
                          <circle cx="6" cy="18" r="2" />
                          <circle cx="12" cy="18" r="2" />
                          <circle cx="18" cy="18" r="2" />
                        </svg>
                        <span className="stat-card-title">Query Box Area (Approx.)</span>
                      </div>
                      <div className="stat-card-number">{activeAreaKm2.toLocaleString()} km²</div>
                      <div className="stat-card-sub">Rectangular scope, not burned area</div>
                    </div>
                  </div>

                  {/* Row 2: Fire Activity Over Time Wide Chart */}
                  <div className="timeline-card">
                    <div className="timeline-card-header">
                      <h3 className="timeline-title">Fire Activity Over Time</h3>
                      <label className="timeline-dropdown-pill">
                        <select aria-label="Year range shown on annual chart" value={yearWindow} onChange={event => setYearWindow(event.target.value as 'all' | '10' | '5')}>
                          <option value="all">Yearly · All</option>
                          <option value="10">Yearly · 10 years</option>
                          <option value="5">Yearly · 5 years</option>
                        </select>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="6 9 12 15 18 9" /></svg>
                      </label>
                    </div>

                    <div className="timeline-svg-wrapper">
                      <svg viewBox="0 0 840 210" className="timeline-chart-svg" preserveAspectRatio="none">
                        {/* Horizontal gridlines and Y-axis ticks */}
                        <line x1="50" y1="20" x2="820" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                        <line x1="50" y1="65" x2="820" y2="65" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                        <line x1="50" y1="110" x2="820" y2="110" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                        <line x1="50" y1="155" x2="820" y2="155" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                        <line x1="50" y1="175" x2="820" y2="175" stroke="rgba(255,255,255,0.14)" />

                        {/* Y-axis values */}
                        <text x="42" y="24" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                          {Math.round(maxAnnualCount).toLocaleString()}
                        </text>
                        <text x="42" y="69" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                          {Math.round(maxAnnualCount * 0.75).toLocaleString()}
                        </text>
                        <text x="42" y="114" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                          {Math.round(maxAnnualCount * 0.5).toLocaleString()}
                        </text>
                        <text x="42" y="159" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                          {Math.round(maxAnnualCount * 0.25).toLocaleString()}
                        </text>
                        <text x="42" y="179" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                          0
                        </text>

                        {/* Bars for each year */}
                        {visibleAnnualActivity.map((d, i) => {
                          const count = visibleAnnualActivity.length || 1;
                          const groupWidth = 750 / count;
                          const seriesEntries = Object.entries(d.counts);
                          const barWidth = Math.max(3, Math.min(13, (groupWidth - 8) / Math.max(seriesEntries.length, 1) - 2));
                          const totalBarsWidth = seriesEntries.length * barWidth + Math.max(0, seriesEntries.length - 1) * 2;
                          const x = 55 + i * groupWidth + (groupWidth - totalBarsWidth) / 2;
                          const isHovered = hoveredYear === d.year;

                          return (
                            <g
                              key={d.year}
                              onMouseEnter={() => setHoveredYear(d.year)}
                              onMouseLeave={() => setHoveredYear(null)}
                              style={{ cursor: 'pointer' }}
                            >
                              {/* Background hover pillar */}
                              {isHovered && (
                                <rect
                                  x={55 + i * groupWidth}
                                  y={15}
                                  width={groupWidth}
                                  height={160}
                                  fill="rgba(255,255,255,0.04)"
                                  rx="4"
                                />
                              )}
                              {seriesEntries.map(([series, value], seriesIndex) => {
                                const barHeight = (value / maxAnnualCount) * 150;
                                return <rect key={series} x={x + seriesIndex * (barWidth + 2)} y={Math.min(174, 175 - barHeight)} width={barWidth} height={Math.max(1, barHeight)} fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]} rx="2" opacity={hoveredYear === null || isHovered ? 0.95 : 0.45} />;
                              })}
                              {/* Year label below */}
                              {(i % 2 === 0 || count < 14) && (
                                <text
                                  x={x + barWidth / 2}
                                  y={196}
                                  textAnchor="middle"
                                  fill={isHovered ? '#ffffff' : '#94a3b8'}
                                  fontSize="12"
                                  fontWeight="600"
                                  fontFamily="DM Mono, monospace"
                                >
                                  {d.year}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>

                      {/* Tooltip on hover */}
                      {hoveredYear !== null && (
                        <div className="timeline-tooltip">
                          <span className="tooltip-year">{hoveredYear}</span>
                          <span className="tooltip-val">
                            {Object.entries(visibleAnnualActivity.find(d => d.year === hoveredYear)?.counts ?? {}).map(([series, value]) => `${series}: ${value.toLocaleString()}`).join(' · ') || 'No source records'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="series-legend">
                      {(calendar?.series ?? []).map((series, index) => (
                        <span key={`${series.sensor}-${series.platform}-${series.product_id}`}><i style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />{series.sensor} · {series.platform}</span>
                      ))}
                    </div>
                  </div>

                  {/* Row 3: Lower Split Panels */}
                  <div className="lower-grid-row">
                    {/* Left: Fire Detections by Month */}
                    <div className="month-card">
                      <div className="month-card-header">
                        <h4 className="card-subheading">Fire Detections by Month</h4>
                      </div>

                      <div className="month-chart-wrapper">
                        <svg viewBox="0 0 500 170" className="month-chart-svg" preserveAspectRatio="none">
                          {/* Y-axis guidelines */}
                          <line x1="40" y1="20" x2="480" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                          <line x1="40" y1="65" x2="480" y2="65" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                          <line x1="40" y1="110" x2="480" y2="110" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                          <line x1="40" y1="140" x2="480" y2="140" stroke="rgba(255,255,255,0.12)" />

                          {(() => {
                            const maxVal = Math.max(...monthlySeasonality.flatMap(m => Object.values(m.counts)), 1);
                            return (
                              <>
                                <text x="32" y="24" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                                  {maxVal.toLocaleString()}
                                </text>
                                <text x="32" y="69" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                                  {Math.round(maxVal * 0.6).toLocaleString()}
                                </text>
                                <text x="32" y="114" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                                  {Math.round(maxVal * 0.3).toLocaleString()}
                                </text>
                                <text x="32" y="144" textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="DM Mono, monospace">
                                  0
                                </text>

                                {monthlySeasonality.map((m, idx) => {
                                  const groupWidth = 430 / 12;
                                  const entries = Object.entries(m.counts);
                                  const barW = Math.max(2, Math.min(8, (groupWidth - 3) / Math.max(entries.length, 1) - 1));
                                  const totalBarsWidth = entries.length * barW + Math.max(0, entries.length - 1);
                                  const x = 45 + idx * groupWidth + (groupWidth - totalBarsWidth) / 2;

                                  return (
                                    <g key={m.month}>
                                      {entries.map(([series, value], seriesIndex) => {
                                        const h = (value / maxVal) * 115;
                                        return <rect key={series} x={x + seriesIndex * (barW + 1)} y={Math.min(139, 140 - h)} width={barW} height={Math.max(1, h)} fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]} rx="2" opacity={0.9} />;
                                      })}
                                      <text
                                        x={x + totalBarsWidth / 2}
                                        y={158}
                                        textAnchor="middle"
                                        fill="#94a3b8"
                                        fontSize="12"
                                        fontWeight="600"
                                        fontFamily="DM Mono, monospace"
                                      >
                                        {m.month}
                                      </text>
                                    </g>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <div className="series-legend">
                        {(calendar?.series ?? []).map((series, index) => (
                          <span key={`${series.sensor}-${series.platform}-${series.product_id}`}><i style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />{series.sensor} · {series.platform}</span>
                        ))}
                      </div>
                    </div>


                  </div>
                </div>
              )}

              {/* TAB 2: FIRE ACTIVITY TABLE & DETAIL PANEL */}
              {activeTab === 'activity' && (
                <div className="workspace-tab-pane activity-pane">
                  <div className="activity-pane-header">
                    <div>
                      <h3 className="pane-title">Satellite observations</h3>
                    </div>
                    <div className="activity-header-count"><strong>{observationTotal.toLocaleString()}</strong><span>records</span></div>
                  </div>

                  <div className="observations-layout">
                    <div className="observations-table-container">
                      <table className="observations-table">
                        <thead>
                          <tr>
                            <th>Date / UTC</th>
                            <th>Sensor · Platform</th>
                            <th>Coordinates</th>
                            <th>FRP (MW)</th>
                            <th>Confidence</th>
                            <th>Pass</th>
                            <th aria-label="Inspect" />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleObservations.map(obs => {
                            const isSelected = selectedObservation === obs.observation_id;
                            const frp = obs.frp_mw ?? obs.frp_native;
                            const conf = obs.confidence_raw;
                            const daynightVal = (obs as Record<string, unknown>).daynight ?? (obs.source_attributes as Record<string, unknown> | undefined)?.daynight;
                            const datePart = obs.acquired_at_utc ? obs.acquired_at_utc.slice(0, 10) : '';
                            const timePart = obs.acquired_at_utc && obs.acquired_at_utc.length > 11 ? obs.acquired_at_utc.slice(11, 19) : '';

                            return (
                              <tr
                                key={obs.observation_id}
                                className={isSelected ? 'is-selected' : ''}
                                onClick={() => onSelectObservation(obs.observation_id)}
                              >
                                <td>
                                  <strong>{datePart || '—'}</strong>
                                  <small>{timePart ? `${timePart} UTC` : ''}</small>
                                </td>
                                <td>{obs.sensor} · {obs.platform}</td>
                                <td className="coords-cell">{obs.latitude.toFixed(4)}, {obs.longitude.toFixed(4)}</td>
                                <td>{typeof frp === 'number' ? `${frp.toFixed(1)} MW` : '—'}</td>
                                <td><span className="conf-badge">{String(conf ?? '—')}</span></td>
                                <td>{daynightVal === 'D' ? 'Day' : daynightVal === 'N' ? 'Night' : '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="view-point-btn"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onSelectObservation(obs.observation_id);
                                    }}
                                  >
                                    ↗
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pagination */}
                      <div className="table-pagination">
                        <button
                          type="button"
                          disabled={(page <= 1 && visibleActivityPage === 0) || loading}
                          onClick={() => {
                            if (visibleActivityPage > 0) setActivityPageIndex(visibleActivityPage - 1);
                            else if (page > 1) { onPageChange(page - 1); setActivityPageIndex(0); }
                          }}
                          className="pagination-btn"
                        >
                          ←
                        </button>
                        <span className="pagination-info">
                          {activityRangeStart.toLocaleString()}–{activityRangeEnd.toLocaleString()} of {observationTotal.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={(visibleActivityPage >= activityPageCount - 1 && page * pageSize >= observationTotal) || loading}
                          onClick={() => {
                            if (visibleActivityPage < activityPageCount - 1) setActivityPageIndex(visibleActivityPage + 1);
                            else if (page * pageSize < observationTotal) { onPageChange(page + 1); setActivityPageIndex(0); }
                          }}
                          className="pagination-btn"
                        >
                          →
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 3: TRENDS & SEASONALITY */}
              {activeTab === 'trends' && (
                <div className="workspace-tab-pane trends-pane">
                  <div className="trends-pane-header">
                    <div>
                      <h3 className="pane-title">Activity patterns</h3>
                      <p className="pane-desc">Monthly records and seasonal shape · {periodLabel}</p>
                    </div>
                  </div>

                  {calendar && (
                    <>
                      <div className="trends-section trends-calendar-section">
                        <CalendarMatrix data={calendar} />
                      </div>

                      <div className="trends-section trends-seasonality-section">
                        <SeasonalityProfile data={calendar} />
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* 3. Centered Bottom Filter Dock with Integrated Download Data Button */}
        <footer className="workspace-bottom-dock">
          <FilterDock
            sensorOptions={sensorOptions}
            sensorsFilter={sensorsFilter}
            onSensorsChange={onSensorsChange}
            appliedStart={appliedStart}
            appliedEnd={appliedEnd}
            onPeriodChange={onPeriodChange}
            qualityFilters={qualityFilters}
            onQualityFiltersChange={onQualityFiltersChange}
            isDrawerOpen={true}
            onToggleDrawer={onClose}
            loading={loading}
            extraAction={
              <button
                type="button"
                className="dock-download-btn"
                onClick={() => setShowExportModal(true)}
                title="Download metadata-backed dataset for this area"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Data</span>
              </button>
            }
          />
        </footer>

        {/* Export Modal */}
        {showExportModal && (
          <div className="workspace-export-modal-backdrop" onClick={() => setShowExportModal(false)}>
            <div className="workspace-export-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h4>Export Filtered Dataset · {placeName}</h4>
                  <p>Download observations or calendar aggregates with complete JSON manifest sidecar.</p>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setShowExportModal(false)}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <ExportPanel
                  aoiId={aoiId}
                  bounds={bounds}
                  start={appliedStart}
                  end={appliedEnd}
                  filters={sensorsFilter}
                  qualityFilters={qualityFilters}
                  qualityFilteringAvailable={qualityFilteringAvailable}
                />
              </div>
            </div>
          </div>
        )}

        {/* External Sources Modal */}
        {showSourcesModal && (
          <div className="workspace-export-modal-backdrop" onClick={() => setShowSourcesModal(false)}>
            <div className="workspace-export-modal sources-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h4>External Sources & Provenance · {placeName}</h4>
                  <p>Authoritative data providers and documentation for this query area.</p>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setShowSourcesModal(false)}>
                  ✕
                </button>
              </div>

              <div className="modal-body sources-modal-body">
                <ul className="sources-list">
                  <li>
                    <strong>NASA FIRMS (Fire Information for Resource Management System)</strong>
                    <p>Standard quality active fire products: MODIS (MCD14ML) Collection 6.1 and VIIRS 375m (VNP14IMGTDL_NRT / VNP14IMGT) Collection 1.</p>
                  </li>
                  <li>
                    <strong>NASA Earthdata & LANCE</strong>
                    <p>Near real-time and archive satellite observation processing for Earth observing missions.</p>
                  </li>
                  <li>
                    <strong>geoBoundaries (Runfola et al., 2020)</strong>
                    <p>Open Global Administrative Database. 2015 baseline boundary utilized for geographic display context.</p>
                  </li>
                  <li>
                    <strong>EMBERLENS Harmonization Layer</strong>
                    <p>Preserves sensor-specific overpass times, non-additive counts, and separate confidence scales.</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
