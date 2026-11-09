import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapDensityCell, ObservationListItem } from '../lib/types';

maplibregl.setWorkerUrl(mapLibreWorkerUrl);

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AOI_URL = '/aoi/bangladesh-national.geojson';
const COUNTRY_OUTLINE_URL = '/aoi/bangladesh-country-outline.geojson';
type AreaBounds = [number, number, number, number];

export function HotspotMap({ cells, observations, selectedBounds, onViewBoundsChange, onSelect }: { cells: MapDensityCell[]; observations: ObservationListItem[]; selectedBounds: AreaBounds | null; onViewBoundsChange: (bounds: AreaBounds) => void; onSelect: (id: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = new maplibregl.Map({ container: mapRef.current, style: STYLE, center: [90.35, 23.6], zoom: 6.2 });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.on('load', async () => {
      try {
        const res = await fetch(AOI_URL);
        const gj = await res.json();
        m.addSource('aoi', { type: 'geojson', data: gj });
        m.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.025 } });
        m.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [4, 2] } });
      } catch { /* AOI optional; map still usable */ }
      try {
        const res = await fetch(COUNTRY_OUTLINE_URL);
        if (!res.ok) throw new Error(`Country outline request failed (${res.status})`);
        const outline = await res.json();
        m.addSource('country-outline', { type: 'geojson', data: outline });
        m.addLayer({ id: 'country-outline-line', type: 'line', source: 'country-outline', paint: {
          'line-color': '#dce8ee', 'line-width': 1.5, 'line-opacity': 0.9,
        } });
      } catch { /* Reference outline is optional; query AOI remains visible. */ }
      m.addSource('density-cells', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'density-cells', type: 'circle', source: 'density-cells', paint: {
        // National-history cells can contain many thousands of observations.
        // Keep high-count cells legible at country scale instead of letting
        // their circles merge into a solid overlay; zooming in reveals detail.
        'circle-radius': ['step', ['get', 'max_series_count'], 1.8, 10, 2.3, 100, 3.2, 1000, 4.8, 10000, 7],
        'circle-color': '#fb6b32', 'circle-stroke-color': '#ffd1b8', 'circle-stroke-width': 0.6,
        'circle-opacity': 0.58,
      } });
      m.addSource('page-observations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'page-observations', type: 'circle', source: 'page-observations', paint: {
        'circle-radius': 3.5, 'circle-color': '#ffe0c9', 'circle-stroke-color': '#7c2d12',
        'circle-stroke-width': 0.8, 'circle-opacity': 0.98,
      } });
      m.addSource('selected-area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'selected-area-fill', type: 'fill', source: 'selected-area', paint: {
        'fill-color': '#43b8e5', 'fill-opacity': 0.06,
      } });
      m.addLayer({ id: 'selected-area-line', type: 'line', source: 'selected-area', paint: {
        'line-color': '#67d4ff', 'line-width': 2.5, 'line-dasharray': [2, 1],
      } });
      m.on('click', 'page-observations', (e) => {
        const id = e.features?.[0]?.properties?.observation_id;
        if (id) onSelect(String(id));
      });
      m.on('mouseenter', 'page-observations', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'page-observations', () => { m.getCanvas().style.cursor = ''; });
      m.on('click', 'density-cells', (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        let series: { sensor: string; platform: string; product_id: string; observation_count: number }[] = [];
        try { series = JSON.parse(String(f.properties.series_json ?? '[]')); } catch { /* invalid map property */ }
        const content = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = 'Detection records in this grid cell';
        content.appendChild(heading);
        for (const item of series) {
          const row = document.createElement('p');
          row.textContent = `${item.sensor} · ${item.platform} · ${item.product_id}: ${item.observation_count.toLocaleString()}`;
          content.appendChild(row);
        }
        const note = document.createElement('small');
        note.textContent = 'Counts remain separated by sensor/product; this cell is not a fire perimeter.';
        content.appendChild(note);
        new maplibregl.Popup({ closeButton: true, maxWidth: '320px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(m);
      });
      m.on('mouseenter', 'density-cells', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'density-cells', () => { m.getCanvas().style.cursor = ''; });
      const reportViewBounds = () => {
        const bounds = m.getBounds();
        onViewBoundsChange([
          Number(bounds.getWest().toFixed(4)), Number(bounds.getSouth().toFixed(4)),
          Number(bounds.getEast().toFixed(4)), Number(bounds.getNorth().toFixed(4)),
        ]);
      };
      m.on('moveend', reportViewBounds);
      reportViewBounds();
      setMapReady(true);
    });
    return () => { m.remove(); map.current = null; setMapReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !m.isStyleLoaded()) return;
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
  }, [cells, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !m.isStyleLoaded()) return;
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
  }, [observations, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady || !m.isStyleLoaded()) return;
    const source = m.getSource('selected-area') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const [west, south, east, north] = selectedBounds ?? [0, 0, 0, 0];
    source.setData(selectedBounds ? {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
        properties: {},
      }],
    } : { type: 'FeatureCollection', features: [] });
  }, [selectedBounds, mapReady]);

  return (
    <div className="map-wrap">
      <div ref={mapRef} aria-label="Map of aggregated fire-observation grid cells" />
    </div>
  );
}
