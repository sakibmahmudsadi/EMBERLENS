import { useState } from 'react';
import type { AreaBounds } from '../map/HotspotMap';

export interface FloatingControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  selectedBounds: AreaBounds | null;
  onClearSelectedBounds: () => void;
  canSelectMapView: boolean;
  onSelectCurrentView: () => void;
  observationCount: number;
  mappedCount: number;
  isPlaybackActive: boolean;
  onTogglePlayback: () => void;
  playbackYear: number | null;
}

export function FloatingControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  selectedBounds,
  onClearSelectedBounds,
  canSelectMapView,
  onSelectCurrentView,
  observationCount,
  mappedCount,
  isPlaybackActive,
  onTogglePlayback,
  playbackYear,
}: FloatingControlsProps) {
  const [showLegend, setShowLegend] = useState(false);

  return (
    <>
      {/* Floating Sub-Area / Playback Active Indicator */}
      {(selectedBounds || playbackYear !== null) && (
        <div className="floating-context-badge">
          <span className="context-indicator" />
          <span className="context-records">
            {playbackYear !== null
              ? `${playbackYear} Playback · ${mappedCount.toLocaleString()} observations`
              : `Sub-area Filtered · ${observationCount.toLocaleString()} observations`}
          </span>
          {selectedBounds && (
            <>
              <button
                type="button"
                className="clear-subarea-btn"
                onClick={onClearSelectedBounds}
                title="Reset to full Bangladesh"
              >
                ✕ Reset Area
              </button>
            </>
          )}
        </div>
      )}

      {/* Floating Bottom-Right Controls Stack */}
      <div className="floating-bottom-right-stack">
        {/* Playback Toggle Button */}
        <button
          type="button"
          className={`floating-tool-btn ${isPlaybackActive ? 'is-active' : ''}`}
          onClick={onTogglePlayback}
          title="Toggle Annual History Playback"
          aria-label="Annual History Playback"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="tool-btn-label">Playback</span>
        </button>

        {/* Legend / Layers Toggle */}
        <button
          type="button"
          className={`floating-tool-btn ${showLegend ? 'is-active' : ''}`}
          onClick={() => setShowLegend(prev => !prev)}
          title="Map Layers & Legend"
          aria-label="Map Layers and Legend"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span className="tool-btn-label">Layers</span>
        </button>

        {/* Area Bounds Filter Button */}
        <button
          type="button"
          className={`floating-tool-btn ${selectedBounds ? 'is-active' : ''}`}
          disabled={!canSelectMapView && !selectedBounds}
          onClick={selectedBounds ? onClearSelectedBounds : onSelectCurrentView}
          title={selectedBounds ? 'Clear Sub-Area Filter' : 'Filter Observations to Current Viewport'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="3 3" />
          </svg>
          <span className="tool-btn-label">{selectedBounds ? 'Reset Area' : 'Filter View'}</span>
        </button>

        {/* Zoom Controls: +, -, Recenter */}
        <div className="floating-zoom-card">
          <button type="button" className="zoom-btn" onClick={onZoomIn} title="Zoom In" aria-label="Zoom in">
            +
          </button>
          <div className="zoom-divider" />
          <button type="button" className="zoom-btn" onClick={onZoomOut} title="Zoom Out" aria-label="Zoom out">
            −
          </button>
          <div className="zoom-divider" />
          <button
            type="button"
            className="zoom-btn is-recenter"
            onClick={onResetView}
            title="Recenter to Bangladesh National View"
            aria-label="Recenter view"
          >
            ⊙
          </button>
        </div>
      </div>

      {/* Floating Legend Popover */}
      {showLegend && (
        <aside className="floating-legend-card" role="region" aria-label="Map Legend">
          <div className="legend-header">
            <h5>Map Layers & Scientific Legend</h5>
            <button type="button" className="close-legend-btn" onClick={() => setShowLegend(false)}>
              ✕
            </button>
          </div>
          <div className="legend-list">
            <div className="legend-entry">
              <span className="legend-sample-point" />
              <div>
                <strong>Spatial Density Cells (0.08° Grid)</strong>
                <p>
                  Aggregated detection counts scaled by the maximum single-sensor/platform series.
                  Represents detection frequency—<strong>not</strong> fire intensity, burned area, fire severity, or an incident perimeter. MODIS and VIIRS counts are never summed.
                </p>
              </div>
            </div>
            <div className="legend-entry">
              <span className="legend-sample-page-point" />
              <div>
                <strong>Source-Observation Drilldown</strong>
                <p>
                  Exact satellite detection coordinates (MODIS 1 km / VIIRS 375 m nominal pixel centers) currently loaded in the paginated inspection feed. Distinct from aggregated grid cells.
                </p>
              </div>
            </div>
            <div className="legend-entry">
              <span className="legend-sample-country-line" />
              <div>
                <strong>geoBoundaries 2015 Outline</strong>
                <p>
                  Display-only reference outline (geoBoundaries 2015 ADM0, CC0 1.0) indicating Bangladesh landmass. Display reference only; does <strong>not</strong> clip data or alter query counts.
                </p>
              </div>
            </div>
            <div className="legend-entry">
              <span className="legend-sample-bbox-line" />
              <div>
                <strong>Task-Specified Query Bounding Box</strong>
                <p>
                  National showcase bounding box [88.0°E, 20.5°N, 92.7°E, 26.7°N]. Includes adjacent border territory in India, Myanmar, and the Bay of Bengal; <strong>not</strong> an authoritative national polygon. Empty cells indicate unverified observation coverage, not zero fires.
                </p>
              </div>
            </div>
            {selectedBounds && (
              <div className="legend-entry">
                <span className="legend-sample-selected-line" />
                <div>
                  <strong>Active Sub-Area Filter</strong>
                  <p>
                    Rectangular query bounding box [{selectedBounds.map(n => n.toFixed(2)).join(', ')}]. Filters map density, calendar matrix, and observations to this sub-area.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
