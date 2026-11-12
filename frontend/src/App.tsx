import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaceSearch, type PlaceItem } from './components/PlaceSearch';
import { FilterDock, type QualityFilters } from './components/FilterDock';
import { FloatingControls } from './components/FloatingControls';
import { AnalyticsDrawer, type CalendarInspection } from './components/AnalyticsDrawer';
import { PlaceAnalysisWorkspace } from './components/PlaceAnalysisWorkspace';
import { HistoryPlayback } from './features/HistoryPlayback';
import { api } from './lib/apiClient';
import type {
  Aoi,
  CalendarResponse,
  CalendarSeries,
  CalendarValue,
  CoverageResponse,
  MapDensityCell,
  ObservationListItem,
} from './lib/types';
import type { SensorFilter } from './sensors/SensorFilters';
import type { AreaBounds, HotspotMapHandle } from './map/HotspotMap';

const INITIAL_START = '2010-01-01';
const INITIAL_END = '2026-07-31';
const DEMO_BOUNDS: AreaBounds = [88.0, 20.5, 92.7, 26.7];
const PAGE_SIZE = 100;

const HotspotMap = lazy(() => import('./map/HotspotMap').then(module => ({ default: module.HotspotMap })));

const EMPTY_QUALITY_FILTERS: QualityFilters = {
  min_frp_native: '',
  daynight: '',
  min_modis_confidence: '',
  viirs_confidence_classes: [],
};

function fallbackDensity(rows: ObservationListItem[]): MapDensityCell[] {
  const grouped = new Map<string, MapDensityCell>();
  for (const row of rows) {
    const key = `${row.latitude}:${row.longitude}`;
    let cell = grouped.get(key);
    if (!cell) {
      cell = { latitude: row.latitude, longitude: row.longitude, max_series_count: 0, series: [] };
      grouped.set(key, cell);
    }
    let series = cell.series.find(
      item => item.sensor === row.sensor && item.platform === row.platform && item.product_id === row.product_id,
    );
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
  return items.find(item => item.aoi_id === 'bangladesh-bd') ?? null;
}

export default function App() {
  const [health, setHealth] = useState('checking');
  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [sensorOptions, setSensorOptions] = useState({
    sensors: [] as string[],
    platforms: [] as string[],
    products: [] as string[],
  });
  const [filters, setFilters] = useState<SensorFilter>({ sensors: [], platforms: [], products: [] });
  const [qualityFilters, setQualityFilters] = useState<QualityFilters>(EMPTY_QUALITY_FILTERS);
  const [appliedStart, setAppliedStart] = useState(INITIAL_START);
  const [appliedEnd, setAppliedEnd] = useState(INITIAL_END);
  const [observations, setObservations] = useState<ObservationListItem[]>([]);
  const [analysisObservations, setAnalysisObservations] = useState<ObservationListItem[]>([]);
  const [analysisCalendar, setAnalysisCalendar] = useState<CalendarResponse | null>(null);
  const [analysisObservationTotal, setAnalysisObservationTotal] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisPage, setAnalysisPage] = useState(1);
  const [mapCells, setMapCells] = useState<MapDensityCell[]>([]);
  const [mapViewBounds, setMapViewBounds] = useState<AreaBounds | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<AreaBounds | null>(null);
  const [mapWarning, setMapWarning] = useState('');
  const [mapDensitySupported, setMapDensitySupported] = useState<boolean | null>(null);

  // Playback state
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackYear, setPlaybackYear] = useState<number | null>(null);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');

  // Main counts & analytical responses
  const [observationTotal, setObservationTotal] = useState(0);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<string | null>(null);
  const [calendarInspection, setCalendarInspection] = useState<CalendarInspection | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Drawer expansion state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Place Analysis Workspace state
  const [isPlaceAnalysisOpen, setIsPlaceAnalysisOpen] = useState(false);
  const [analyzedPlace, setAnalyzedPlace] = useState<PlaceItem | null>(null);
  const [analysisPreviewImage, setAnalysisPreviewImage] = useState<string | null>(null);

  // Map handle ref for zoom & flyTo
  const mapRef = useRef<HotspotMapHandle>(null);

  const requestSequence = useRef(0);
  const analysisRequestSequence = useRef(0);
  const playbackRequestSequence = useRef(0);
  const playbackTimer = useRef<number | null>(null);
  const playbackRunning = useRef(false);

  // Initial load: health, AOIs, and data-source snapshots
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.aois(), api.dataSources()])
      .then(([h, a, sources]) => {
        if (cancelled) return;
        setHealth(String(h.status ?? 'ok'));
        const nationalAoi = aoiFromResponse(a);
        setAoi(nationalAoi);
        if (!nationalAoi) {
          setError(
            'The Bangladesh national dataset is not loaded in the active database yet. The legacy Sundarbans sample is kept separate.',
          );
          setLoading(false);
        }
        const items = sources.items ?? sources.sources ?? sources.snapshots ?? [];
        setSensorOptions({
          sensors: [...new Set(items.map(item => item.sensor).filter(Boolean))],
          platforms: [...new Set(items.map(item => item.platform).filter(Boolean))],
          products: [...new Set(items.map(item => item.product_id).filter(Boolean))],
        });
      })
      .catch(e => {
        if (!cancelled) {
          setHealth('offline');
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Main data loader function
  const load = useCallback(
    async (nextPage = 1, inspection: CalendarInspection | null = null) => {
      if (!aoi) return;
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError('');

      const base = new URLSearchParams({
        aoi_id: aoi.aoi_id,
        start: appliedStart,
        end: apiExclusiveEnd(appliedEnd),
      });
      if (selectedBounds) base.set('bounds', selectedBounds.join(','));
      if (filters.sensors.length) base.set('sensors', filters.sensors.join(','));
      if (filters.platforms.length) base.set('platforms', filters.platforms.join(','));
      if (filters.products.length) base.set('products', filters.products.join(','));
      if (qualityFilters.min_frp_native !== '') base.set('min_frp_native', qualityFilters.min_frp_native);
      if (qualityFilters.daynight) base.set('daynight', qualityFilters.daynight);
      if (qualityFilters.min_modis_confidence !== '') base.set('min_modis_confidence', qualityFilters.min_modis_confidence);
      if (qualityFilters.viirs_confidence_classes.length)
        base.set('viirs_confidence_classes', qualityFilters.viirs_confidence_classes.join(','));

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
          api
            .mapDensity(base)
            .then(value => ({ value, error: '' }))
            .catch(ex => ({ value: null, error: ex instanceof Error ? ex.message : String(ex) })),
        ]);
        if (requestId !== requestSequence.current) return;
        const pageObservations = o.items ?? o.data ?? [];
        setObservations(pageObservations);
        setMapCells(map.value?.cells ?? fallbackDensity(pageObservations));
        setMapDensitySupported(Boolean(map.value));
        setMapWarning(
          map.value
            ? ''
            : 'The API needs a restart to load the full-dataset map. The map is temporarily showing only the current observation page.',
        );
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
    },
    [aoi, appliedStart, appliedEnd, filters, qualityFilters, selectedBounds],
  );

  useEffect(() => {
    if (aoi) void load(1, null);
  }, [aoi, load]);

  // Place Analysis has its own spatial query scope so searching never changes
  // the map's explicit Set Area Bbox filter or the map's loaded observations.
  const analysisBounds = analyzedPlace?.bounds ?? DEMO_BOUNDS;
  useEffect(() => {
    if (!isPlaceAnalysisOpen || !aoi) return;
    const requestId = ++analysisRequestSequence.current;
    const query = new URLSearchParams({
      aoi_id: aoi.aoi_id,
      start: appliedStart,
      end: apiExclusiveEnd(appliedEnd),
      bounds: analysisBounds.join(','),
      page: String(analysisPage),
      page_size: String(PAGE_SIZE),
    });
    if (filters.sensors.length) query.set('sensors', filters.sensors.join(','));
    if (filters.platforms.length) query.set('platforms', filters.platforms.join(','));
    if (filters.products.length) query.set('products', filters.products.join(','));
    if (qualityFilters.min_frp_native !== '') query.set('min_frp_native', qualityFilters.min_frp_native);
    if (qualityFilters.daynight) query.set('daynight', qualityFilters.daynight);
    if (qualityFilters.min_modis_confidence !== '') query.set('min_modis_confidence', qualityFilters.min_modis_confidence);
    if (qualityFilters.viirs_confidence_classes.length)
      query.set('viirs_confidence_classes', qualityFilters.viirs_confidence_classes.join(','));

    setAnalysisLoading(true);
    Promise.all([api.observations(query), api.calendar(query)])
      .then(([result, calendarResult]) => {
        if (requestId !== analysisRequestSequence.current) return;
        setAnalysisObservations(result.items ?? result.data ?? []);
        setAnalysisObservationTotal(result.total ?? result.pagination?.total ?? 0);
        setAnalysisCalendar(calendarResult);
      })
      .catch(cause => {
        if (requestId !== analysisRequestSequence.current) return;
        setAnalysisObservations([]);
        setAnalysisObservationTotal(0);
        setAnalysisCalendar(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (requestId === analysisRequestSequence.current) setAnalysisLoading(false);
      });
    return () => { analysisRequestSequence.current += 1; };
  }, [isPlaceAnalysisOpen, aoi, analysisBounds, appliedStart, appliedEnd, filters, qualityFilters, analysisPage]);

  useEffect(() => {
    if (!isPlaceAnalysisOpen) return;
    let cancelled = false;
    void mapRef.current?.capturePreview().then(image => {
      if (!cancelled) setAnalysisPreviewImage(image);
    });
    return () => { cancelled = true; };
  }, [isPlaceAnalysisOpen, analyzedPlace]);

  const playbackStartYear = Number(appliedStart.slice(0, 4));
  const playbackEndYear = Number(appliedEnd.slice(0, 4));
  const mappedRecordCount = useMemo(
    () =>
      mapCells.reduce(
        (total, cell) =>
          total + cell.series.reduce((seriesTotal, series) => seriesTotal + series.observation_count, 0),
        0,
      ),
    [mapCells],
  );

  const selectableBounds = mapViewBounds
    ? ([
        Math.max(mapViewBounds[0], DEMO_BOUNDS[0]),
        Math.max(mapViewBounds[1], DEMO_BOUNDS[1]),
        Math.min(mapViewBounds[2], DEMO_BOUNDS[2]),
        Math.min(mapViewBounds[3], DEMO_BOUNDS[3]),
      ] as AreaBounds)
    : null;
  const canSelectMapView = Boolean(
    selectableBounds && selectableBounds[0] < selectableBounds[2] && selectableBounds[1] < selectableBounds[3],
  );

  const mapPageObservations = useMemo(
    () =>
      playbackYear === null
        ? observations
        : observations.filter(row => row.acquired_at_utc.slice(0, 4) === String(playbackYear)),
    [observations, playbackYear],
  );

  const coverageItems = coverage?.items ?? coverage?.coverage ?? coverage?.availability ?? [];
  const exportStart = calendarInspection?.value.period_start.slice(0, 10) ?? appliedStart;
  const exportEnd = calendarInspection ? inclusiveDateBefore(calendarInspection.value.period_end) : appliedEnd;
  const exportFilters = calendarInspection
    ? {
        sensors: [calendarInspection.series.sensor],
        platforms: [calendarInspection.series.platform],
        products: [calendarInspection.series.product_id],
      }
    : filters;

  const coverageSummary = [
    ...new Set(coverageItems.map(item => item.product_id).filter((id): id is string => Boolean(id))),
  ].map(productId => {
    const rows = coverageItems.filter(item => item.product_id === productId);
    const interval = rows.find(item => (item.availability_status ?? item.status) !== 'missing');
    const missingDays = rows.filter(
      item =>
        (item.availability_status ?? item.status) === 'missing' &&
        (!item.date_or_interval || (item.date_or_interval >= appliedStart && item.date_or_interval <= appliedEnd)),
    );
    return {
      productId,
      platform: interval?.platform ?? rows[0]?.platform ?? 'Platform unavailable',
      interval: interval?.date_or_interval ?? 'No availability interval returned',
      status: interval?.availability_status ?? interval?.status ?? 'unknown',
      missingDays: missingDays.length,
    };
  });

  // Playback handlers
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

  const requestMapYear = useCallback(
    async (year: number) => {
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
      if (qualityFilters.min_modis_confidence !== '')
        query.set('min_modis_confidence', qualityFilters.min_modis_confidence);
      if (qualityFilters.viirs_confidence_classes.length)
        query.set('viirs_confidence_classes', qualityFilters.viirs_confidence_classes.join(','));

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
            playbackTimer.current = window.setTimeout(() => {
              void requestMapYear(year + 1);
            }, 850);
          }
        }
      } catch (cause) {
        if (requestId !== playbackRequestSequence.current) return;
        stopMapPlayback();
        setPlaybackError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (requestId === playbackRequestSequence.current) setPlaybackLoading(false);
      }
    },
    [aoi, appliedStart, appliedEnd, filters, qualityFilters, playbackEndYear, stopMapPlayback, selectedBounds],
  );

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

  useEffect(
    () => () => {
      playbackRunning.current = false;
      if (playbackTimer.current !== null) window.clearTimeout(playbackTimer.current);
    },
    [],
  );

  // Filter dock handlers
  const handlePeriodChange = (start: string, end: string) => {
    if (start > end) {
      setError('Start date must be on or before end date.');
      return;
    }
    resetMapPlayback();
    setAnalysisPage(1);
    setCalendarInspection(null);
    setAppliedStart(start);
    setAppliedEnd(end);
  };

  const handleSensorsChange = (newFilters: SensorFilter) => {
    resetMapPlayback();
    setAnalysisPage(1);
    setCalendarInspection(null);
    setFilters(newFilters);
  };

  const handleQualityFiltersChange = (newQuality: QualityFilters) => {
    resetMapPlayback();
    setAnalysisPage(1);
    setCalendarInspection(null);
    setQualityFilters(newQuality);
  };

  // Place search selection handler
  const handleSelectPlace = (place: PlaceItem, applyAsAreaFilter = false) => {
    if (place.bounds) mapRef.current?.fitBounds(place.bounds, place.zoom);
    else mapRef.current?.flyTo(place.center, place.zoom);
    setAnalyzedPlace(place);
    setAnalysisPage(1);
    if (applyAsAreaFilter && place.bounds) {
      resetMapPlayback();
      setCalendarInspection(null);
      setSelectedBounds(place.bounds);
    }
  };

  // Calendar inspection handlers
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
    <div className="emberlens-app">
      {/* 1. Fullscreen Map Layer */}
      <section className="map-fullscreen-stage" aria-label="Satellite Active-Fire Observations Map">
        <Suspense fallback={<div className="map-loading-shell">Initialising geospatial engine…</div>}>
          <HotspotMap
            ref={mapRef}
            cells={mapCells}
            observations={mapPageObservations}
            selectedBounds={selectedBounds}
            focusBounds={analyzedPlace?.bounds ?? null}
            focusBoundaryIds={analyzedPlace?.boundaryIds ?? []}
            onViewBoundsChange={setMapViewBounds}
            onSelect={id => {
              setSelectedObservation(id);
              setIsDrawerOpen(true);
            }}
          />
        </Suspense>
      </section>

      {/* 2. Top Navigation Bar (floating directly over map) */}
      <header className="map-topbar">
        <div className="brand-group">
          <a className="brand-mark" href="#top" aria-label="EMBERLENS Home">
            EMBERLENS
          </a>
        </div>

        <div className="topbar-right-group">
          {/* Functional Place Search */}
          <PlaceSearch onSelectPlace={handleSelectPlace} selectedPlace={analyzedPlace} />

          {/* Quick Analytics & Calendar Trigger Button */}
          <button
            type="button"
            className={`topbar-action-btn ${isDrawerOpen ? 'is-active' : ''}`}
            onClick={() => setIsDrawerOpen(prev => !prev)}
            aria-expanded={isDrawerOpen}
            title="Toggle Monthly Activity Calendar & Analytics Drawer"
          >
            <span className="btn-icon">📅</span>
            <span className="btn-text">Analytics & Calendar</span>
            {calendarInspection && <span className="active-dot" />}
          </button>
        </div>
      </header>

      {/* Error alert toast */}
      {error && (
        <div className="floating-error-toast" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="toast-retry-btn"
            onClick={() => {
              resetMapPlayback();
              aoi ? void load(page, calendarInspection) : window.location.reload();
            }}
          >
            Retry
          </button>
          <button type="button" className="toast-dismiss-btn" onClick={() => setError('')}>
            ✕
          </button>
        </div>
      )}

      {/* Map Capability Warning */}
      {mapWarning && (
        <div className="floating-warning-toast" role="status">
          <span>{mapWarning}</span>
        </div>
      )}

      {/* 3. Floating Bottom-Center Filter Dock */}
      <FilterDock
        sensorOptions={sensorOptions}
        sensorsFilter={filters}
        onSensorsChange={handleSensorsChange}
        appliedStart={appliedStart}
        appliedEnd={appliedEnd}
        onPeriodChange={handlePeriodChange}
        qualityFilters={qualityFilters}
        onQualityFiltersChange={handleQualityFiltersChange}
        isDrawerOpen={isPlaceAnalysisOpen}
        onToggleDrawer={() => {
          setIsDrawerOpen(false);
          setIsPlaceAnalysisOpen(prev => !prev);
        }}
        loading={loading}
      />

      {/* 4. Floating Map Controls (Zoom, Scale, Layers, Area) */}
      <FloatingControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onResetView={() => mapRef.current?.resetView()}
        selectedBounds={selectedBounds}
        onClearSelectedBounds={() => {
          resetMapPlayback();
          setCalendarInspection(null);
          setSelectedBounds(null);
        }}
        canSelectMapView={canSelectMapView}
        onSelectCurrentView={() => {
          resetMapPlayback();
          setCalendarInspection(null);
          setSelectedBounds(selectableBounds);
        }}
        observationCount={observationTotal}
        mappedCount={mappedRecordCount}
        isPlaybackActive={isPlaybackActive}
        onTogglePlayback={() => setIsPlaybackActive(prev => !prev)}
        playbackYear={playbackYear}
      />

      {/* 5. Floating Annual History Playback Bar (when active) */}
      {isPlaybackActive && (
        <div className="floating-playback-wrapper">
          <HistoryPlayback
            startYear={playbackStartYear}
            endYear={playbackEndYear}
            year={playbackYear}
            playing={playbackPlaying}
            loading={playbackLoading}
            disabled={mapDensitySupported !== true || !aoi || Boolean(calendarInspection)}
            error={playbackError}
            onYearChange={selectMapYear}
            onPlay={playMapHistory}
            onPause={stopMapPlayback}
            onReset={() => {
              resetMapPlayback();
              void load(1, null);
            }}
          />
        </div>
      )}

      {/* 6. Expandable Analytics & Calendar Drawer */}
      <AnalyticsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        apiHealth={health}
        calendar={calendar}
        calendarInspection={calendarInspection}
        onInspectCalendarCell={inspectCalendarCell}
        onClearCalendarInspection={clearCalendarInspection}
        observations={observations}
        observationTotal={observationTotal}
        selectedObservation={selectedObservation}
        onSelectObservation={setSelectedObservation}
        page={page}
        onPageChange={nextPage => {
          resetMapPlayback();
          void load(nextPage, calendarInspection);
        }}
        loading={loading}
        aoi={aoi}
        selectedBounds={selectedBounds}
        sensorOptions={sensorOptions}
        appliedStart={appliedStart}
        appliedEnd={appliedEnd}
        exportStart={exportStart}
        exportEnd={exportEnd}
        exportFilters={exportFilters}
        qualityFilters={qualityFilters}
        mapDensitySupported={mapDensitySupported}
        coverageSummary={coverageSummary}
      />

      {/* 7. Contextual Place Analysis Workspace (Experience B) */}
      <PlaceAnalysisWorkspace
        isOpen={isPlaceAnalysisOpen}
        place={analyzedPlace}
        onClose={() => setIsPlaceAnalysisOpen(false)}
        onSelectPlace={handleSelectPlace}
        calendar={analysisCalendar}
        observations={analysisObservations}
        observationTotal={analysisObservationTotal}
        selectedObservation={selectedObservation}
        onSelectObservation={setSelectedObservation}
        page={analysisPage}
        pageSize={PAGE_SIZE}
        onPageChange={setAnalysisPage}
        loading={analysisLoading}
        sensorOptions={sensorOptions}
        sensorsFilter={filters}
        onSensorsChange={handleSensorsChange}
        appliedStart={appliedStart}
        appliedEnd={appliedEnd}
        onPeriodChange={handlePeriodChange}
        qualityFilters={qualityFilters}
        onQualityFiltersChange={handleQualityFiltersChange}
        aoiId={aoi?.aoi_id ?? 'bangladesh-bd'}
        selectedBounds={analysisBounds}
        previewImage={analysisPreviewImage}
        qualityFilteringAvailable={mapDensitySupported ?? false}
      />
    </div>
  );
}
