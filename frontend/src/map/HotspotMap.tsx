import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, Geometry, Position } from 'geojson';
import type { MapDensityCell, ObservationListItem } from '../lib/types';

maplibregl.setWorkerUrl(mapLibreWorkerUrl);

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AOI_URL = '/aoi/bangladesh-national.geojson';
const COUNTRY_OUTLINE_URL = '/aoi/bangladesh-country-outline.geojson';
const PLACE_BOUNDARIES_URL = '/aoi/search-place-boundaries.geojson';
export type AreaBounds = [number, number, number, number];
type PlaceBoundary = Feature<Geometry, { placeId?: string; boundaryName?: string }>;

export interface HotspotMapHandle {
  flyTo: (center: [number, number], zoom?: number) => void;
  fitBounds: (bounds: AreaBounds, maxZoom?: number) => void;
  capturePreview: () => Promise<string | null>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  resize: () => void;
}

export interface HotspotMapProps {
  cells: MapDensityCell[];
  observations: ObservationListItem[];
  selectedBounds: AreaBounds | null;
  focusBounds: AreaBounds | null;
  focusBoundaryIds: string[];
  onViewBoundsChange: (bounds: AreaBounds) => void;
  onSelect: (id: string) => void;
}

const DEFAULT_CENTER: [number, number] = [90.35, 23.6];
const DEFAULT_ZOOM = 6.2;

function areaFeatureCollection(bounds: AreaBounds | null, boundaries: PlaceBoundary[] = [], placeIds: string[] = []) {
  const placeFeatures = boundaries.filter(feature => feature.properties?.placeId && placeIds.includes(feature.properties.placeId));
  if (placeFeatures.length) return { type: 'FeatureCollection' as const, features: placeFeatures };
  if (!bounds || placeIds.length) return { type: 'FeatureCollection' as const, features: [] };
  const [west, south, east, north] = bounds;
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
      },
      properties: {},
    }],
  };
}

function pointInRing(point: [number, number], ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], rings: Position[][]): boolean {
  return Boolean(rings[0] && pointInRing(point, rings[0]) && !rings.slice(1).some(ring => pointInRing(point, ring)));
}

function pointInGeometry(point: [number, number], geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygon => pointInPolygon(point, polygon));
  return false;
}

function pointIsInFocus(
  point: [number, number],
  bounds: AreaBounds | null,
  boundaryIds: string[],
  boundaries: PlaceBoundary[],
): boolean {
  const geometries = boundaries
    .filter(feature => feature.properties?.placeId && boundaryIds.includes(feature.properties.placeId))
    .map(feature => feature.geometry);
  if (geometries.length) return geometries.some(geometry => pointInGeometry(point, geometry));
  if (!bounds) return true;
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}

function cellFeatureCollection(cells: MapDensityCell[], bounds: AreaBounds | null, ids: string[], boundaries: PlaceBoundary[]) {
  return {
    type: 'FeatureCollection' as const,
    features: cells
      .filter(cell => pointIsInFocus([cell.longitude, cell.latitude], bounds, ids, boundaries))
      .map(cell => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] as [number, number] },
        properties: { longitude: cell.longitude, latitude: cell.latitude, max_series_count: cell.max_series_count, series_json: JSON.stringify(cell.series) },
      })),
  };
}

function observationFeatureCollection(observations: ObservationListItem[], bounds: AreaBounds | null, ids: string[], boundaries: PlaceBoundary[]) {
  return {
    type: 'FeatureCollection' as const,
    features: observations
      .filter(observation => pointIsInFocus([observation.longitude, observation.latitude], bounds, ids, boundaries))
      .map(observation => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [observation.longitude, observation.latitude] as [number, number] },
        properties: { observation_id: observation.observation_id, longitude: observation.longitude, latitude: observation.latitude },
      })),
  };
}

export const HotspotMap = forwardRef<HotspotMapHandle, HotspotMapProps>(function HotspotMap(
  { cells, observations, selectedBounds, focusBounds, focusBoundaryIds, onViewBoundsChange, onSelect },
  ref,
) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [, setMapReady] = useState(false);

  // Keep references to latest data for initial map load synchronization
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const observationsRef = useRef(observations);
  observationsRef.current = observations;
  const selectedBoundsRef = useRef(selectedBounds);
  selectedBoundsRef.current = selectedBounds;
  const focusBoundsRef = useRef(focusBounds);
  focusBoundsRef.current = focusBounds;
  const focusBoundaryIdsRef = useRef(focusBoundaryIds);
  focusBoundaryIdsRef.current = focusBoundaryIds;
  const placeBoundariesRef = useRef<PlaceBoundary[]>([]);

  useImperativeHandle(ref, () => ({
    flyTo: (center: [number, number], zoom?: number) => {
      map.current?.flyTo({ center, zoom: zoom ?? 8.5, essential: true, duration: 1800 });
    },
    fitBounds: (bounds: AreaBounds, maxZoom?: number) => {
      const [west, south, east, north] = bounds;
      map.current?.fitBounds([[west, south], [east, north]], {
        padding: { top: 74, right: 96, bottom: 126, left: 96 },
        maxZoom: maxZoom ?? 9,
        duration: 1500,
      });
    },
    capturePreview: () => {
      const instance = map.current;
      if (!instance) return Promise.resolve(null);
      return new Promise(resolve => {
        const capture = () => {
          try { resolve(instance.getCanvas().toDataURL('image/png')); }
          catch { resolve(null); }
        };
        if (!instance.isMoving()) requestAnimationFrame(capture);
        else instance.once('moveend', () => requestAnimationFrame(capture));
      });
    },
    zoomIn: () => {
      map.current?.zoomIn({ duration: 300 });
    },
    zoomOut: () => {
      map.current?.zoomOut({ duration: 300 });
    },
    resetView: () => {
      map.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, essential: true, duration: 1600 });
    },
    resize: () => {
      map.current?.resize();
    },
  }));

  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.current = m;
    (window as unknown as { __emberlens_map?: maplibregl.Map }).__emberlens_map = m;

    m.on('error', (e) => {
      console.error('[MAPLIBRE ERROR EVENT]', e.error ? e.error.message : e);
    });

    // Add scale control to bottom-left as seen in the reference visual
    const scale = new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' });
    m.addControl(scale, 'bottom-left');
    m.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Place boundaries: geoBoundaries · Ramsar / WDPA',
    }), 'bottom-right');

    m.on('load', async () => {
      // Fine-tune Carto Dark Matter style for a cinematic satellite cartography appearance
      try {
        if (m.getLayer('background')) {
          m.setPaintProperty('background', 'background-color', '#070e17');
        }
        if (m.getLayer('water')) {
          m.setPaintProperty('water', 'fill-color', '#091624');
        }
        if (m.getLayer('waterway')) {
          m.setPaintProperty('waterway', 'line-color', '#0b1d30');
        }
        if (m.getLayer('boundary_country_outline')) {
          m.setPaintProperty('boundary_country_outline', 'line-color', '#223547');
          m.setPaintProperty('boundary_country_outline', 'line-width', 1);
        }
        if (m.getLayer('boundary_country_inner')) {
          m.setPaintProperty('boundary_country_inner', 'line-color', '#2b4258');
          m.setPaintProperty('boundary_country_inner', 'line-width', 1.2);
        }
        if (m.getLayer('place_country_1')) {
          m.setPaintProperty('place_country_1', 'text-color', '#9eb1c7');
          m.setPaintProperty('place_country_1', 'text-halo-color', '#070e17');
          m.setPaintProperty('place_country_1', 'text-halo-width', 1.5);
        }
        if (m.getLayer('place_country_2')) {
          m.setPaintProperty('place_country_2', 'text-color', '#8ca2b9');
          m.setPaintProperty('place_country_2', 'text-halo-color', '#070e17');
          m.setPaintProperty('place_country_2', 'text-halo-width', 1.2);
        }
        if (m.getLayer('watername_ocean')) {
          m.setPaintProperty('watername_ocean', 'text-color', '#50677d');
        }
        if (m.getLayer('watername_sea')) {
          m.setPaintProperty('watername_sea', 'text-color', '#556d84');
        }
      } catch {
        /* Optional style property adjustment */
      }

      // Add national query bbox
      try {
        const res = await fetch(AOI_URL);
        const gj = await res.json();
        m.addSource('aoi', { type: 'geojson', data: gj });
        m.addLayer({
          id: 'aoi-fill',
          type: 'fill',
          source: 'aoi',
          paint: { 'fill-color': '#ff7315', 'fill-opacity': 0.015 },
        });
        m.addLayer({
          id: 'aoi-line',
          type: 'line',
          source: 'aoi',
          paint: {
            'line-color': '#ff7315',
            'line-width': 1.0,
            'line-opacity': 0.0,
          },
        });
      } catch {
        /* AOI optional; map still usable */
      }

      // Add Bangladesh official reference outline (geoBoundaries 2015)
      try {
        const res = await fetch(COUNTRY_OUTLINE_URL);
        if (!res.ok) throw new Error(`Country outline request failed (${res.status})`);
        const outline = await res.json();
        m.addSource('country-outline', { type: 'geojson', data: outline });
        m.addLayer({
          id: 'country-outline-glow',
          type: 'line',
          source: 'country-outline',
          paint: {
            'line-color': '#6c8fa8',
            'line-width': 2.8,
            'line-opacity': 0.25,
            'line-blur': 1,
          },
        });
        m.addLayer({
          id: 'country-outline-line',
          type: 'line',
          source: 'country-outline',
          paint: {
            'line-color': '#9eb7ca',
            'line-width': 1.2,
            'line-opacity': 0.85,
          },
        });
      } catch {
        /* Reference outline is optional; query AOI remains visible */
      }

      try {
        const response = await fetch(PLACE_BOUNDARIES_URL);
        if (!response.ok) throw new Error(`Place boundary request failed (${response.status})`);
        const geojson = await response.json();
        placeBoundariesRef.current = Array.isArray(geojson.features) ? geojson.features as PlaceBoundary[] : [];
      } catch {
        /* The map stays usable with its curated search bounds if boundary data cannot load. */
      }

      const initialBounds = focusBoundsRef.current ?? selectedBoundsRef.current;
      const initialPlaceIds = focusBoundaryIdsRef.current;
      const initialCells = cellFeatureCollection(cellsRef.current, initialBounds, initialPlaceIds, placeBoundariesRef.current);
      const initialObservations = observationFeatureCollection(observationsRef.current, initialBounds, initialPlaceIds, placeBoundariesRef.current);

      // Hotspot density observation points - two layers for glowing ember effect
      m.addSource('density-cells', {
        type: 'geojson',
        data: initialCells,
      });

      // Layer 1: Radiant ember glow halo - zoom-dependent
      m.addLayer({
        id: 'density-cells-glow',
        type: 'circle',
        source: 'density-cells',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, ['step', ['get', 'max_series_count'], 2.4, 50, 3.2, 500, 4.5, 5000, 6.0],
            7.5, ['step', ['get', 'max_series_count'], 3.8, 50, 5.2, 500, 7.2, 5000, 9.5],
            10, ['step', ['get', 'max_series_count'], 5.5, 50, 8.0, 500, 11.0, 5000, 14.0],
          ],
          'circle-color': '#d95300',
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            5, 0.38,
            7.5, 0.42,
            10, 0.20,
          ],
          'circle-blur': 0.85,
        },
      });

      // Layer 2: Restrained amber density core - zoom-dependent
      m.addLayer({
        id: 'density-cells',
        type: 'circle',
        source: 'density-cells',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, ['step', ['get', 'max_series_count'], 1.2, 50, 1.8, 500, 2.4, 5000, 3.2],
            7.5, ['step', ['get', 'max_series_count'], 2.0, 50, 2.8, 500, 3.8, 5000, 5.0],
            10, ['step', ['get', 'max_series_count'], 3.2, 50, 4.4, 500, 5.8, 5000, 7.5],
          ],
          'circle-color': [
            'step', ['get', 'max_series_count'],
            '#bf4f00', 50,
            '#d96500', 500,
            '#ec7d0a', 5000,
            '#fa9426',
          ],
          'circle-stroke-color': '#140904',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            5, 0.3,
            8, 0.7,
            11, 1.0,
          ],
          'circle-stroke-opacity': 0.75,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            5, 0.90,
            8, 0.88,
            11, 0.75,
          ],
        },
      });

      // Page observations (active feed points drilldown - individual satellite pixels)
      m.addSource('page-observations', {
        type: 'geojson',
        data: initialObservations,
      });
      m.addLayer({
        id: 'page-observations-glow',
        type: 'circle',
        source: 'page-observations',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 5.0,
            9, 8.5,
            12, 12.0,
          ],
          'circle-color': '#38bdf8',
          'circle-opacity': 0.45,
          'circle-blur': 0.75,
        },
      });
      m.addLayer({
        id: 'page-observations',
        type: 'circle',
        source: 'page-observations',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 3.0,
            9, 4.5,
            12, 6.0,
          ],
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 2.0,
          'circle-opacity': 1.0,
        },
      });

      // Searched-place spotlight (or the explicitly selected map area).
      m.addSource('selected-area', {
        type: 'geojson',
        data: areaFeatureCollection(initialBounds, placeBoundariesRef.current, initialPlaceIds),
      });
      m.addLayer({
        id: 'selected-area-fill',
        type: 'fill',
        source: 'selected-area',
        paint: { 'fill-color': '#ff7b32', 'fill-opacity': 0.035 },
      });
      m.addLayer({
        id: 'selected-area-glow',
        type: 'line',
        source: 'selected-area',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff762d',
          'line-width': 8,
          'line-opacity': 0.38,
          'line-blur': 3.5,
          'line-dasharray': initialPlaceIds.length ? [0.15, 1.8] : [1, 0],
        },
      });
      m.addLayer({
        id: 'selected-area-line',
        type: 'line',
        source: 'selected-area',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff9a43',
          'line-width': 2.2,
          'line-opacity': 0.98,
          'line-dasharray': initialPlaceIds.length ? [0.15, 1.8] : [1, 0],
        },
      });

      // Interactions
      m.on('click', 'page-observations', e => {
        const id = e.features?.[0]?.properties?.observation_id;
        if (id) onSelect(String(id));
      });
      m.on('mouseenter', 'page-observations', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'page-observations', () => {
        m.getCanvas().style.cursor = '';
      });

      m.on('click', 'density-cells', e => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        let series: { sensor: string; platform: string; product_id: string; observation_count: number }[] = [];
        try {
          series = JSON.parse(String(f.properties.series_json ?? '[]'));
        } catch {
          /* invalid map property */
        }
        const content = document.createElement('div');
        content.className = 'map-cell-popup';
        const heading = document.createElement('strong');
        heading.textContent = 'Spatial Density Cell (0.08° Grid)';
        content.appendChild(heading);

        const sub = document.createElement('div');
        sub.className = 'map-cell-subheading';
        sub.textContent = 'Sensor-specific detection counts:';
        content.appendChild(sub);

        for (const item of series) {
          const row = document.createElement('p');
          row.textContent = `${item.sensor} · ${item.platform} · ${item.product_id}: ${item.observation_count.toLocaleString()}`;
          content.appendChild(row);
        }
        const note = document.createElement('small');
        note.textContent =
          'Marker represents detection frequency within cell, not fire intensity, burned area, or an incident perimeter. MODIS and VIIRS counts are never summed.';
        content.appendChild(note);
        new maplibregl.Popup({ closeButton: true, maxWidth: '340px', className: 'ember-popup' })
          .setLngLat(e.lngLat)
          .setDOMContent(content)
          .addTo(m);
      });
      m.on('mouseenter', 'density-cells', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'density-cells', () => {
        m.getCanvas().style.cursor = '';
      });

      const reportViewBounds = () => {
        const bounds = m.getBounds();
        onViewBoundsChange([
          Number(bounds.getWest().toFixed(4)),
          Number(bounds.getSouth().toFixed(4)),
          Number(bounds.getEast().toFixed(4)),
          Number(bounds.getNorth().toFixed(4)),
        ]);
      };
      m.on('moveend', reportViewBounds);
      reportViewBounds();
      setMapReady(true);
    });

    // ResizeObserver on container to guarantee smooth responsiveness
    const ro = new ResizeObserver(() => {
      m.resize();
    });
    ro.observe(mapRef.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cellsRef.current = cells;
    const m = map.current;
    if (!m) return;
    const src = m.getSource('density-cells') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(cellFeatureCollection(cells, focusBounds ?? selectedBounds, focusBoundaryIds, placeBoundariesRef.current));
  }, [cells, focusBounds, selectedBounds, focusBoundaryIds]);

  useEffect(() => {
    observationsRef.current = observations;
    const m = map.current;
    if (!m) return;
    const src = m.getSource('page-observations') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(observationFeatureCollection(observations, focusBounds ?? selectedBounds, focusBoundaryIds, placeBoundariesRef.current));
  }, [observations, focusBounds, selectedBounds, focusBoundaryIds]);

  useEffect(() => {
    selectedBoundsRef.current = selectedBounds;
    const m = map.current;
    if (!m) return;
    const source = m.getSource('selected-area') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(areaFeatureCollection(focusBounds ?? selectedBounds, placeBoundariesRef.current, focusBoundaryIds));
    const dotted = focusBoundaryIds.length > 0;
    for (const layer of ['selected-area-glow', 'selected-area-line']) {
      if (m.getLayer(layer)) m.setPaintProperty(layer, 'line-dasharray', dotted ? [0.15, 1.8] : [1, 0]);
    }
  }, [selectedBounds, focusBounds, focusBoundaryIds]);

  useEffect(() => {
    focusBoundsRef.current = focusBounds;
  }, [focusBounds]);

  return (
    <div className="map-viewport">
      <div ref={mapRef} className="maplibre-container" aria-label="Geospatial Map of Active-Fire Hotspots" />
    </div>
  );
});
