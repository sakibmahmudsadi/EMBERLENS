import { useState } from 'react';
import { CalendarMatrix } from '../calendar/CalendarMatrix';
import { SeasonalityProfile } from '../calendar/SeasonalityProfile';
import { ObservationDetailPanel } from '../observations/ObservationDetail';
import { ExportPanel } from '../exports/ExportPanel';
import { HotspotGroupsPanel } from '../features/HotspotGroupsPanel';
import { Disclosure } from './Disclosure';
import { Empty, Loading } from './States';
import { coverageStatusLabel } from '../lib/apiClient';
import type { Aoi, CalendarResponse, CalendarSeries, CalendarValue, ObservationListItem } from '../lib/types';
import type { QualityFilters } from './FilterDock';
import type { SensorFilter } from '../sensors/SensorFilters';
import type { AreaBounds } from '../map/HotspotMap';

export interface CalendarInspection {
  series: CalendarSeries;
  value: CalendarValue;
}

export interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  calendar: CalendarResponse | null;
  calendarInspection: CalendarInspection | null;
  onInspectCalendarCell: (series: CalendarSeries, value: CalendarValue) => void;
  onClearCalendarInspection: () => void;
  observations: ObservationListItem[];
  observationTotal: number;
  selectedObservation: string | null;
  onSelectObservation: (id: string | null) => void;
  page: number;
  onPageChange: (nextPage: number) => void;
  loading: boolean;
  aoi: Aoi | null;
  selectedBounds: AreaBounds | null;
  sensorOptions: { sensors: string[]; platforms: string[]; products: string[] };
  appliedStart: string;
  appliedEnd: string;
  exportStart: string;
  exportEnd: string;
  exportFilters: SensorFilter;
  qualityFilters: QualityFilters;
  mapDensitySupported: boolean | null;
  apiHealth?: string;
  coverageSummary: Array<{
    productId: string;
    platform: string;
    interval: string;
    status: string;
    missingDays: number;
  }>;
}

export type DrawerTab = 'calendar' | 'seasonality' | 'observations' | 'hotspots' | 'export' | 'disclosures';

export function AnalyticsDrawer({
  isOpen,
  onClose,
  calendar,
  calendarInspection,
  onInspectCalendarCell,
  onClearCalendarInspection,
  observations,
  observationTotal,
  selectedObservation,
  onSelectObservation,
  page,
  onPageChange,
  loading,
  aoi,
  selectedBounds,
  sensorOptions,
  appliedStart,
  appliedEnd,
  exportStart,
  exportEnd,
  exportFilters,
  qualityFilters,
  mapDensitySupported,
  apiHealth = 'ok',
  coverageSummary,
}: AnalyticsDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('calendar');

  if (!isOpen) return null;

  return (
    <div className="analytics-drawer-backdrop" onClick={onClose}>
      <aside
        className="analytics-drawer-card"
        onClick={e => e.stopPropagation()}
        role="region"
        aria-label="Scientific Analytics & Calendar Workspace"
      >
        {/* Drawer Header & Tab Navigation */}
        <header className="drawer-header">
          <div className="drawer-title-group">
            <div className="drawer-eyebrow">
              GEOSPATIAL INTELLIGENCE & REPRODUCIBLE SCIENCE · API {apiHealth.toUpperCase()}
            </div>
            <h3 className="drawer-title">
              Place Analytics <span>· {aoi?.name ?? 'Bangladesh National Bbox'}</span>
            </h3>
          </div>

          {/* Navigation Tabs */}
          <nav className="drawer-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'calendar'}
              className={`drawer-tab-btn ${activeTab === 'calendar' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('calendar')}
            >
              <span className="tab-icon">📅</span> Monthly Calendar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'seasonality'}
              className={`drawer-tab-btn ${activeTab === 'seasonality' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('seasonality')}
            >
              <span className="tab-icon">📊</span> Seasonality
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'observations'}
              className={`drawer-tab-btn ${activeTab === 'observations' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('observations')}
            >
              <span className="tab-icon">🔬</span> Observations
              {observationTotal > 0 && <span className="tab-badge">{observationTotal.toLocaleString()}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'hotspots'}
              className={`drawer-tab-btn ${activeTab === 'hotspots' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('hotspots')}
            >
              <span className="tab-icon">🧭</span> Hotspot Clusters
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'export'}
              className={`drawer-tab-btn ${activeTab === 'export' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <span className="tab-icon">📥</span> Data Export
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'disclosures'}
              className={`drawer-tab-btn ${activeTab === 'disclosures' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('disclosures')}
            >
              <span className="tab-icon">📜</span> Disclosures
            </button>
          </nav>

          {/* Right Header Actions */}
          <div className="drawer-header-actions">
            {calendarInspection && (
              <div className="inspection-indicator">
                <span className="inspection-label">Month Filter:</span>
                <strong>
                  {calendarInspection.series.sensor} · {calendarInspection.value.period_start.slice(0, 7)} (
                  {calendarInspection.value.observation_count.toLocaleString()})
                </strong>
                <button
                  type="button"
                  className="clear-inspection-btn"
                  onClick={onClearCalendarInspection}
                  title="Clear month drilldown"
                >
                  ✕
                </button>
              </div>
            )}
            <button type="button" className="drawer-close-btn" onClick={onClose} title="Collapse to Fullscreen Map">
              <span className="close-text">Map View</span>
              <span className="close-icon">✕</span>
            </button>
          </div>
        </header>

        {/* Drawer Body Content */}
        <div className="drawer-body">
          {/* TAB 1: Monthly Burning Activity Calendar */}
          {activeTab === 'calendar' && (
            <div className="drawer-tab-pane">
              <div className="pane-summary-strip">
                <div className="pane-stat">
                  <span className="stat-label">OBSERVATION WINDOW</span>
                  <strong>
                    {appliedStart.slice(0, 4)} — {appliedEnd.slice(0, 4)}
                  </strong>
                  <small>Standard Science Products</small>
                </div>
                <div className="pane-stat">
                  <span className="stat-label">TOTAL OBSERVATIONS</span>
                  <strong>{observationTotal.toLocaleString()}</strong>
                  <small>Deduplicated within snapshot</small>
                </div>
                <div className="pane-stat">
                  <span className="stat-label">AVAILABLE SENSORS</span>
                  <strong>{sensorOptions.sensors.join(' & ') || 'MODIS + VIIRS'}</strong>
                  <small>Never summed across sensors</small>
                </div>
                <div className="pane-stat">
                  <span className="stat-label">COVERAGE HONESTY</span>
                  <strong>Unverified ≠ Zero</strong>
                  <small>No records = coverage unknown</small>
                </div>
              </div>

              {calendar ? (
                <CalendarMatrix
                  data={calendar}
                  onInspect={(series, val) => {
                    onInspectCalendarCell(series, val);
                    setActiveTab('observations');
                  }}
                />
              ) : loading ? (
                <div className="loading-card">
                  <Loading />
                </div>
              ) : (
                <Empty msg="No calendar data returned for this query." />
              )}
            </div>
          )}

          {/* TAB 2: Seasonality Profile & Summary */}
          {activeTab === 'seasonality' && (
            <div className="drawer-tab-pane">
              {calendar ? (
                <SeasonalityProfile data={calendar} />
              ) : loading ? (
                <div className="loading-card">
                  <Loading />
                </div>
              ) : (
                <Empty msg="Calendar data is required to construct seasonal profiles." />
              )}
            </div>
          )}

          {/* TAB 3: Source Observation Feed & Details */}
          {activeTab === 'observations' && (
            <div className="drawer-tab-pane observations-layout">
              <div className="observations-pane-main">
                <div className="feed-heading-row">
                  <div>
                    <h4>Satellite Observation Feed</h4>
                    <p className="feed-subtext">
                      {calendarInspection
                        ? `Filtered to ${calendarInspection.series.sensor} ${calendarInspection.series.platform} for ${calendarInspection.value.period_start.slice(0, 7)}`
                        : `All observations for ${appliedStart} → ${appliedEnd}`}
                    </p>
                  </div>
                  <span className="feed-total-pill">{observationTotal.toLocaleString()} total</span>
                </div>

                {loading ? (
                  <Loading />
                ) : observations.length === 0 ? (
                  <Empty msg="No source records returned; observation coverage unknown." />
                ) : (
                  <ul className="observation-list">
                    {observations.map(o => (
                      <li key={o.observation_id}>
                        <button
                          type="button"
                          className={`observation-row ${selectedObservation === o.observation_id ? 'is-selected' : ''}`}
                          onClick={() => onSelectObservation(o.observation_id)}
                        >
                          <span className="observation-time">
                            {o.acquired_at_utc.replace('T', ' ').replace('Z', ' UTC')}
                          </span>
                          <span className="observation-source">
                            {o.sensor} <i>·</i> {o.platform}
                          </span>
                          <span className="observation-location">
                            {o.latitude.toFixed(4)}°N, {o.longitude.toFixed(4)}°E
                          </span>
                          <span className="observation-frp">{o.frp_native != null ? `${o.frp_native} MW` : '—'}</span>
                          <span className="row-arrow">↗</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pagination">
                  <button
                    type="button"
                    className="outline-button"
                    disabled={page <= 1 || loading}
                    onClick={() => onPageChange(page - 1)}
                  >
                    Previous
                  </button>
                  <span className="page-indicator">Page {page}</span>
                  <button
                    type="button"
                    className="outline-button"
                    disabled={observations.length < 100 || loading}
                    onClick={() => onPageChange(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>

              <aside className="observations-pane-sidebar">
                <ObservationDetailPanel id={selectedObservation} />

                <div className="coverage-mini-card">
                  <h5>Source Availability Summary</h5>
                  <p className="coverage-disclaimer">
                    FIRMS availability registers source service dates, not cloud-free or sensor overpass opportunities
                    over Bangladesh.
                  </p>
                  {coverageSummary.length === 0 ? (
                    <small>No coverage records returned.</small>
                  ) : (
                    <ul className="coverage-mini-list">
                      {coverageSummary.map(item => (
                        <li key={item.productId}>
                          <strong>
                            {item.productId} · {item.platform}
                          </strong>
                          <span>
                            {item.interval} · {coverageStatusLabel(item.status)} ({item.missingDays} missing days)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* TAB 4: Algorithmic Hotspot Groups */}
          {activeTab === 'hotspots' && (
            <div className="drawer-tab-pane">
              {aoi ? (
                <HotspotGroupsPanel aoiId={aoi.aoi_id} sensors={sensorOptions.sensors} bounds={selectedBounds} />
              ) : (
                <Empty msg="AOI not ready." />
              )}
            </div>
          )}

          {/* TAB 5: Metadata-Backed Data Export */}
          {activeTab === 'export' && (
            <div className="drawer-tab-pane export-layout">
              <ExportPanel
                aoiId={aoi?.aoi_id ?? ''}
                bounds={selectedBounds}
                start={exportStart}
                end={exportEnd}
                filters={exportFilters}
                qualityFilters={qualityFilters}
                qualityFilteringAvailable={mapDensitySupported !== false}
              />
            </div>
          )}

          {/* TAB 6: Scientific Disclosures & Methodology */}
          {activeTab === 'disclosures' && (
            <div className="drawer-tab-pane disclosures-layout">
              <Disclosure />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
