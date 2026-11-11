import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapDensityCell, ObservationListItem } from '../lib/types';

maplibregl.setWorkerUrl(mapLibreWorkerUrl);

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AOI_URL = '/aoi/bangladesh-national.geojson';
const COUNTRY_OUTLINE_URL = '/aoi/bangladesh-country-outline.geojson';
export type AreaBounds = [number, number, number, number];

export interface HotspotMapHandle {
  flyTo: (center: [number, number], zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  resize: () => void;
}

export interface HotspotMapProps {
  cells: MapDensityCell[];
  observations: ObservationListItem[];
  selectedBounds: AreaBounds | null;
  onViewBoundsChange: (bounds: AreaBounds) => void;
  onSelect: (id: string) => void;
}

const DEFAULT_CENTER: [number, number] = [90.35, 23.6];
const DEFAULT_ZOOM = 6.2;

export const HotspotMap = forwardRef<HotspotMapHandle, HotspotMapProps>(function HotspotMap(
  { cells, observations, selectedBounds, onViewBoundsChange, onSelect },
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

  useImperativeHandle(ref, () => ({
    flyTo: (center: [number, number], zoom?: number) => {
      map.current?.flyTo({ center, zoom: zoom ?? 8.5, essential: true, duration: 1800 });
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
    });
    map.current = m;
    (window as unknown as { __emberlens_map?: maplibregl.Map }).__emberlens_map = m;

    m.on('error', (e) => {
      console.error('[MAPLIBRE ERROR EVENT]', e.error ? e.error.message : e);
    });

    // Add scale control to bottom-left as seen in the reference visual
    const scale = new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' });
    m.addControl(scale, 'bottom-left');

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

      // Hotspot density observation points - two layers for glowing ember effect
      m.addSource('density-cells', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: cellsRef.current.map(cell => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] },
            properties: { max_series_count: cell.max_series_count, series_json: JSON.stringify(cell.series) },
          })),
        },
      });

      // Layer 1: Radiant ember glow halo
      m.addLayer({
        id: 'density-cells-glow',
        type: 'circle',
        source: 'density-cells',
        paint: {
          'circle-radius': ['step', ['get', 'max_series_count'], 4.2, 10, 5.8, 100, 8.5, 1000, 12.5, 10000, 18.0],
          'circle-color': '#ff3a00',
          'circle-opacity': 0.55,
          'circle-blur': 0.85,
        },
      });

      // Layer 2: Intense fiery core with bright stroke
      m.addLayer({
        id: 'density-cells',
        type: 'circle',
        source: 'density-cells',
        paint: {
          'circle-radius': ['step', ['get', 'max_series_count'], 2.0, 10, 2.8, 100, 4.2, 1000, 6.0, 10000, 8.5],
          'circle-color': [
            'step', ['get', 'max_series_count'],
            '#ff5500', 50,
            '#ff7700', 500,
            '#ffa010', 5000,
            '#ffe066',
          ],
          'circle-stroke-color': '#fff6e5',
          'circle-stroke-width': 0.6,
          'circle-stroke-opacity': 0.85,
          'circle-opacity': 0.95,
        },
      });

      // Page observations (active feed points drilldown)
      m.addSource('page-observations', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: observationsRef.current.map(observation => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [observation.longitude, observation.latitude] },
            properties: { observation_id: observation.observation_id },
          })),
        },
      });
      m.addLayer({
        id: 'page-observations-glow',
        type: 'circle',
        source: 'page-observations',
        paint: {
          'circle-radius': 7.0,
          'circle-color': '#ff6000',
          'circle-opacity': 0.6,
          'circle-blur': 0.7,
        },
      });
      m.addLayer({
        id: 'page-observations',
        type: 'circle',
        source: 'page-observations',
        paint: {
          'circle-radius': 3.6,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#ff4900',
          'circle-stroke-width': 1.4,
          'circle-opacity': 1.0,
        },
      });

      // Selected area bounds box
      const [west, south, east, north] = selectedBoundsRef.current ?? [0, 0, 0, 0];
      m.addSource('selected-area', {
        type: 'geojson',
        data: selectedBoundsRef.current
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [west, south],
                        [east, south],
                        [east, north],
                        [west, north],
                        [west, south],
                      ],
                    ],
                  },
                  properties: {},
                },
              ],
            }
          : { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'selected-area-fill',
        type: 'fill',
        source: 'selected-area',
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.05 },
      });
      m.addLayer({
        id: 'selected-area-line',
        type: 'line',
        source: 'selected-area',
        paint: { 'line-color': '#38bdf8', 'line-width': 1.8, 'line-dasharray': [3, 2] },
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
        heading.textContent = 'Detections in Grid Cell';
        content.appendChild(heading);
        for (const item of series) {
          const row = document.createElement('p');
          row.textContent = `${item.sensor} · ${item.platform} · ${item.product_id}: ${item.observation_count.toLocaleString()}`;
          content.appendChild(row);
        }
        const note = document.createElement('small');
        note.textContent = 'Counts stay sensor-specific; cell is an observation location, not a fire perimeter.';
        content.appendChild(note);
        new maplibregl.Popup({ closeButton: true, maxWidth: '320px', className: 'ember-popup' })
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
    src.setData({
      type: 'FeatureCollection',
      features: cells.map(cell => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] },
        properties: { max_series_count: cell.max_series_count, series_json: JSON.stringify(cell.series) },
      })),
    });
  }, [cells]);

  useEffect(() => {
    observationsRef.current = observations;
    const m = map.current;
    if (!m) return;
    const src = m.getSource('page-observations') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: observations.map(observation => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [observation.longitude, observation.latitude] },
        properties: { observation_id: observation.observation_id },
      })),
    });
  }, [observations]);

  useEffect(() => {
    selectedBoundsRef.current = selectedBounds;
    const m = map.current;
    if (!m) return;
    const source = m.getSource('selected-area') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const [west, south, east, north] = selectedBounds ?? [0, 0, 0, 0];
    source.setData(
      selectedBounds
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [west, south],
                      [east, south],
                      [east, north],
                      [west, north],
                      [west, south],
                    ],
                  ],
                },
                properties: {},
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] },
    );
  }, [selectedBounds]);

  return (
    <div className="map-viewport">
      <div ref={mapRef} className="maplibre-container" aria-label="Geospatial Map of Active-Fire Hotspots" />
    </div>
  );
});
