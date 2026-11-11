import { useEffect, useRef, useState } from 'react';
import type { SensorFilter } from '../sensors/SensorFilters';

export interface QualityFilters {
  min_frp_native: string;
  daynight: string;
  min_modis_confidence: string;
  viirs_confidence_classes: string[];
}

export interface FilterDockProps {
  // Sensor options & active filter
  sensorOptions: { sensors: string[]; platforms: string[]; products: string[] };
  sensorsFilter: SensorFilter;
  onSensorsChange: (filter: SensorFilter) => void;

  // Period / Date range
  appliedStart: string;
  appliedEnd: string;
  onPeriodChange: (start: string, end: string) => void;

  // Confidence & Quality filters
  qualityFilters: QualityFilters;
  onQualityFiltersChange: (filters: QualityFilters) => void;

  // Drawer expansion state
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;

  // Loading state indicator
  loading?: boolean;
}

export function FilterDock({
  sensorOptions,
  sensorsFilter,
  onSensorsChange,
  appliedStart,
  appliedEnd,
  onPeriodChange,
  qualityFilters,
  onQualityFiltersChange,
  isDrawerOpen,
  onToggleDrawer,
  loading = false,
}: FilterDockProps) {
  const [activePopover, setActivePopover] = useState<'sensors' | 'period' | 'confidence' | 'activity' | null>(null);

  // Temporary local state for popover editing before apply
  const [draftStart, setDraftStart] = useState(appliedStart);
  const [draftEnd, setDraftEnd] = useState(appliedEnd);

  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftStart(appliedStart);
    setDraftEnd(appliedEnd);
  }, [appliedStart, appliedEnd]);

  // Click outside to close popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute summary labels for the 4 segments
  const sensorsSummary = (() => {
    if (sensorsFilter.sensors.length === 0 && sensorsFilter.platforms.length === 0) {
      return 'MODIS, VIIRS';
    }
    const parts: string[] = [];
    if (sensorsFilter.sensors.includes('MODIS')) parts.push('MODIS');
    if (sensorsFilter.sensors.includes('VIIRS')) parts.push('VIIRS');
    if (sensorsFilter.platforms.length > 0 && parts.length === 0) {
      return sensorsFilter.platforms.join(', ');
    }
    return parts.length ? parts.join(', ') : 'All Sensors';
  })();

  const periodSummary = (() => {
    const startYear = appliedStart.slice(0, 4);
    const endYear = appliedEnd.slice(0, 4);
    if (startYear === '2010' && appliedEnd.startsWith('2026')) {
      return '2010 – 2026';
    }
    if (startYear === endYear) {
      const startMonth = appliedStart.slice(5, 7);
      const endMonth = appliedEnd.slice(5, 7);
      if (startMonth === endMonth) {
        return `${appliedStart.slice(0, 7)}`;
      }
      return `${appliedStart.slice(0, 7)} — ${appliedEnd.slice(0, 7)}`;
    }
    return `${startYear} – ${endYear}`;
  })();

  const confidenceSummary = (() => {
    const modisSet = qualityFilters.min_modis_confidence !== '';
    const viirsSet = qualityFilters.viirs_confidence_classes.length > 0;
    if (!modisSet && !viirsSet) return 'All';
    if (modisSet && !viirsSet) return `MODIS ≥ ${qualityFilters.min_modis_confidence}`;
    if (!modisSet && viirsSet) return `VIIRS ${qualityFilters.viirs_confidence_classes.join(',')}`;
    return 'Custom';
  })();

  const activitySummary = (() => {
    const frpSet = qualityFilters.min_frp_native !== '';
    const dnSet = qualityFilters.daynight !== '';
    if (!frpSet && !dnSet) return 'All';
    if (frpSet && !dnSet) return `FRP ≥ ${qualityFilters.min_frp_native} MW`;
    if (!frpSet && dnSet) return qualityFilters.daynight === 'D' ? 'Day Only' : 'Night Only';
    return 'Filtered';
  })();

  const toggleSegment = (segment: 'sensors' | 'period' | 'confidence' | 'activity') => {
    setActivePopover(current => (current === segment ? null : segment));
  };

  const handleApplyPeriod = () => {
    onPeriodChange(draftStart, draftEnd);
    setActivePopover(null);
  };

  const setPeriodPreset = (start: string, end: string) => {
    setDraftStart(start);
    setDraftEnd(end);
    onPeriodChange(start, end);
    setActivePopover(null);
  };

  const toggleSensor = (sensor: string) => {
    const current = sensorsFilter.sensors;
    const next = current.includes(sensor) ? current.filter(s => s !== sensor) : [...current, sensor];
    onSensorsChange({ ...sensorsFilter, sensors: next });
  };

  const togglePlatform = (platform: string) => {
    const current = sensorsFilter.platforms;
    const next = current.includes(platform) ? current.filter(p => p !== platform) : [...current, platform];
    onSensorsChange({ ...sensorsFilter, platforms: next });
  };

  const toggleViirsClass = (cls: string) => {
    const current = qualityFilters.viirs_confidence_classes;
    const next = current.includes(cls) ? current.filter(c => c !== cls) : [...current, cls];
    onQualityFiltersChange({ ...qualityFilters, viirs_confidence_classes: next });
  };

  return (
    <div ref={dockRef} className="floating-filter-dock-wrapper">
      {/* Popovers anchored above dock */}
      {activePopover === 'sensors' && (
        <div className="dock-popover sensors-popover" role="dialog" aria-label="Select Sensors">
          <div className="popover-header">
            <h4>Satellite Sensors & Platforms</h4>
            <span className="popover-badge">Standard Science Products</span>
          </div>
          <p className="popover-desc">
            Select NASA active-fire observation sources. Series are kept strictly separated and never summed.
          </p>

          <div className="popover-section">
            <span className="popover-label">SENSORS</span>
            <div className="popover-chips">
              <button
                type="button"
                className={`popover-chip ${sensorsFilter.sensors.length === 0 || sensorsFilter.sensors.includes('MODIS') ? 'is-active' : ''}`}
                onClick={() => toggleSensor('MODIS')}
              >
                <span className="chip-indicator" />
                MODIS (Terra & Aqua)
              </button>
              <button
                type="button"
                className={`popover-chip ${sensorsFilter.sensors.length === 0 || sensorsFilter.sensors.includes('VIIRS') ? 'is-active' : ''}`}
                onClick={() => toggleSensor('VIIRS')}
              >
                <span className="chip-indicator" />
                VIIRS (Suomi-NPP 375m)
              </button>
            </div>
          </div>

          <div className="popover-section">
            <span className="popover-label">PLATFORMS</span>
            <div className="popover-chips">
              {(sensorOptions.platforms.length ? sensorOptions.platforms : ['Terra', 'Aqua', 'Suomi-NPP']).map(plat => (
                <button
                  key={plat}
                  type="button"
                  className={`popover-chip ${sensorsFilter.platforms.includes(plat) ? 'is-active' : ''}`}
                  onClick={() => togglePlatform(plat)}
                >
                  {plat}
                </button>
              ))}
            </div>
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-reset-btn"
              onClick={() => onSensorsChange({ sensors: [], platforms: [], products: [] })}
            >
              Reset to Both Sensors
            </button>
            <button type="button" className="popover-done-btn" onClick={() => setActivePopover(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {activePopover === 'period' && (
        <div className="dock-popover period-popover" role="dialog" aria-label="Select Period">
          <div className="popover-header">
            <h4>Observation Time Window</h4>
            <span className="popover-badge">2010-01-01 → 2026-07-31</span>
          </div>
          <p className="popover-desc">
            Verified NASA FIRMS Standard product snapshot window for Bangladesh national bounding box.
          </p>

          <div className="popover-section">
            <span className="popover-label">PRESETS</span>
            <div className="popover-chips">
              <button
                type="button"
                className="popover-chip"
                onClick={() => setPeriodPreset('2010-01-01', '2026-07-31')}
              >
                Full Archive (2010–2026)
              </button>
              <button
                type="button"
                className="popover-chip"
                onClick={() => setPeriodPreset('2020-03-01', '2020-03-31')}
              >
                Peak Season (Mar 2020)
              </button>
              <button
                type="button"
                className="popover-chip"
                onClick={() => setPeriodPreset('2021-01-01', '2026-07-31')}
              >
                Recent 5 Years (2021–2026)
              </button>
              <button
                type="button"
                className="popover-chip"
                onClick={() => setPeriodPreset('2010-01-01', '2011-12-31')}
              >
                MODIS-Only Era (2010–2011)
              </button>
            </div>
          </div>

          <div className="popover-section date-range-inputs">
            <label className="popover-date-field">
              <span className="popover-label">FROM (UTC)</span>
              <input
                type="date"
                min="2010-01-01"
                max="2026-07-31"
                value={draftStart}
                onChange={e => setDraftStart(e.target.value)}
              />
            </label>
            <span className="date-range-sep">→</span>
            <label className="popover-date-field">
              <span className="popover-label">TO (UTC)</span>
              <input
                type="date"
                min="2010-01-01"
                max="2026-07-31"
                value={draftEnd}
                onChange={e => setDraftEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-reset-btn"
              onClick={() => setPeriodPreset('2010-01-01', '2026-07-31')}
            >
              Reset to Full Archive
            </button>
            <button type="button" className="popover-done-btn is-primary" onClick={handleApplyPeriod}>
              Apply Period
            </button>
          </div>
        </div>
      )}

      {activePopover === 'confidence' && (
        <div className="dock-popover confidence-popover" role="dialog" aria-label="Select Confidence">
          <div className="popover-header">
            <h4>Native Confidence Filters</h4>
            <span className="popover-badge">Sensor-Specific</span>
          </div>
          <p className="popover-desc">
            MODIS uses a 0–100 numeric score. VIIRS uses native categorical classes (L, N, H). They are not equated.
          </p>

          <div className="popover-section">
            <span className="popover-label">MODIS NUMERIC CONFIDENCE (0–100)</span>
            <div className="confidence-slider-group">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={qualityFilters.min_modis_confidence || '0'}
                onChange={e =>
                  onQualityFiltersChange({
                    ...qualityFilters,
                    min_modis_confidence: e.target.value === '0' ? '' : e.target.value,
                  })
                }
              />
              <div className="slider-labels">
                <span>Any (0)</span>
                <span className="current-val">
                  {qualityFilters.min_modis_confidence ? `≥ ${qualityFilters.min_modis_confidence}%` : 'No filter'}
                </span>
                <span>100%</span>
              </div>
            </div>
            <div className="quick-threshold-buttons">
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_modis_confidence === '30' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_modis_confidence: '30' })}
              >
                ≥ 30%
              </button>
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_modis_confidence === '50' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_modis_confidence: '50' })}
              >
                ≥ 50%
              </button>
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_modis_confidence === '80' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_modis_confidence: '80' })}
              >
                ≥ 80% (High)
              </button>
            </div>
          </div>

          <div className="popover-section">
            <span className="popover-label">VIIRS NATIVE CATEGORIES</span>
            <div className="popover-chips">
              {[
                { key: 'L', label: 'Low (L)' },
                { key: 'N', label: 'Nominal (N)' },
                { key: 'H', label: 'High (H)' },
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`popover-chip ${qualityFilters.viirs_confidence_classes.includes(item.key) ? 'is-active' : ''}`}
                  onClick={() => toggleViirsClass(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-reset-btn"
              onClick={() =>
                onQualityFiltersChange({
                  ...qualityFilters,
                  min_modis_confidence: '',
                  viirs_confidence_classes: [],
                })
              }
            >
              Clear Confidence
            </button>
            <button type="button" className="popover-done-btn" onClick={() => setActivePopover(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {activePopover === 'activity' && (
        <div className="dock-popover activity-popover" role="dialog" aria-label="Select Fire Activity">
          <div className="popover-header">
            <h4>Fire Activity & FRP</h4>
            <span className="popover-badge">Radiative Energy</span>
          </div>
          <p className="popover-desc">
            Filter by native Fire Radiative Power (MW) and satellite overpass day/night conditions.
          </p>

          <div className="popover-section">
            <span className="popover-label">MINIMUM FIRE RADIATIVE POWER (FRP, MW)</span>
            <div className="frp-input-row">
              <input
                type="number"
                min="0"
                step="5"
                placeholder="Any MW (0)"
                className="popover-text-input"
                value={qualityFilters.min_frp_native}
                onChange={e =>
                  onQualityFiltersChange({
                    ...qualityFilters,
                    min_frp_native: e.target.value,
                  })
                }
              />
              <span className="unit-label">MW</span>
            </div>
            <div className="quick-threshold-buttons">
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_frp_native === '5' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_frp_native: '5' })}
              >
                ≥ 5 MW
              </button>
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_frp_native === '20' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_frp_native: '20' })}
              >
                ≥ 20 MW
              </button>
              <button
                type="button"
                className={`popover-chip is-sm ${qualityFilters.min_frp_native === '50' ? 'is-active' : ''}`}
                onClick={() => onQualityFiltersChange({ ...qualityFilters, min_frp_native: '50' })}
              >
                ≥ 50 MW
              </button>
            </div>
          </div>

          <div className="popover-section">
            <span className="popover-label">DAY / NIGHT SATELLITE PASS</span>
            <div className="popover-chips">
              {[
                { key: '', label: 'All Passes' },
                { key: 'D', label: 'Day Passes Only (D)' },
                { key: 'N', label: 'Night Passes Only (N)' },
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`popover-chip ${qualityFilters.daynight === item.key ? 'is-active' : ''}`}
                  onClick={() => onQualityFiltersChange({ ...qualityFilters, daynight: item.key })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="popover-footer">
            <button
              type="button"
              className="popover-reset-btn"
              onClick={() =>
                onQualityFiltersChange({
                  ...qualityFilters,
                  min_frp_native: '',
                  daynight: '',
                })
              }
            >
              Clear Activity
            </button>
            <button type="button" className="popover-done-btn" onClick={() => setActivePopover(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main Floating Dock Container */}
      <nav className={`floating-filter-dock ${isDrawerOpen ? 'is-expanded-drawer' : ''}`} aria-label="Map Filters">
        {/* Top Upward Toggle Chevron */}
        <button
          type="button"
          className="dock-expand-toggle"
          onClick={onToggleDrawer}
          title={isDrawerOpen ? 'Collapse Analytics Drawer' : 'Expand Monthly Calendar & Analytics'}
          aria-expanded={isDrawerOpen}
        >
          <svg
            className={`dock-chevron-icon ${isDrawerOpen ? 'is-flipped' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <div className="dock-segments-row">
          {/* Segment 1: Sensors */}
          <div
            className={`dock-segment ${activePopover === 'sensors' ? 'is-active' : ''}`}
            onClick={() => toggleSegment('sensors')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && toggleSegment('sensors')}
          >
            <span className="dock-segment-label">Sensors</span>
            <div className="dock-segment-value-row">
              <span className="dock-segment-value">{sensorsSummary}</span>
              <svg className="segment-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="dock-segment-divider" />

          {/* Segment 2: Period */}
          <div
            className={`dock-segment ${activePopover === 'period' ? 'is-active' : ''}`}
            onClick={() => toggleSegment('period')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && toggleSegment('period')}
          >
            <span className="dock-segment-label">Period</span>
            <div className="dock-segment-value-row">
              <span className="dock-segment-value">{periodSummary}</span>
              <svg className="segment-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="dock-segment-divider" />

          {/* Segment 3: Confidence */}
          <div
            className={`dock-segment ${activePopover === 'confidence' ? 'is-active' : ''}`}
            onClick={() => toggleSegment('confidence')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && toggleSegment('confidence')}
          >
            <span className="dock-segment-label">Confidence</span>
            <div className="dock-segment-value-row">
              <span className="dock-segment-value">{confidenceSummary}</span>
              <svg className="segment-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="dock-segment-divider" />

          {/* Segment 4: Fire Activity */}
          <div
            className={`dock-segment ${activePopover === 'activity' ? 'is-active' : ''}`}
            onClick={() => toggleSegment('activity')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && toggleSegment('activity')}
          >
            <span className="dock-segment-label">Fire Activity</span>
            <div className="dock-segment-value-row">
              <span className="dock-segment-value">{activitySummary}</span>
              <svg className="segment-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {loading && <div className="dock-loading-pulse" title="Updating observation data..." />}
      </nav>
    </div>
  );
}
