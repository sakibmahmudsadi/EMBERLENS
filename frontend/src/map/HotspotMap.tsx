import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ObservationListItem } from '../lib/types';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const AOI_URL = '/aoi/sundarbans-demo.geojson';

export function HotspotMap({ observations, onSelect }: { observations: ObservationListItem[]; onSelect: (id: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = new maplibregl.Map({ container: mapRef.current, style: STYLE, center: [89.35, 22.05], zoom: 8 });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.on('load', async () => {
      try {
        const res = await fetch(AOI_URL);
        const gj = await res.json();
        m.addSource('aoi', { type: 'geojson', data: gj });
        m.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.08 } });
        m.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [4, 2] } });
      } catch { /* AOI optional; map still usable */ }
      m.addSource('hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'hotspots', type: 'circle', source: 'hotspots', paint: { 'circle-radius': 5, 'circle-color': '#fb923c', 'circle-stroke-color': '#7c2d12', 'circle-stroke-width': 1, 'circle-opacity': 0.9 } });
      m.on('click', 'hotspots', (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.observation_id;
        if (id) onSelect(String(id));
      });
      m.on('mouseenter', 'hotspots', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'hotspots', () => { m.getCanvas().style.cursor = ''; });
    });
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource('hotspots') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: observations.map(o => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [o.longitude, o.latitude] },
        properties: { observation_id: o.observation_id, sensor: o.sensor, platform: o.platform, acquired_at_utc: o.acquired_at_utc },
      })),
    });
  }, [observations]);

  return (
    <div className="map-wrap">
      <div ref={mapRef} aria-label="Map of hotspot observations" />
      <div className="map-legend" aria-label="Map legend">
        <strong>AOI (provisional boundary)</strong> — dashed orange outline, best-effort demo polygon.
        <ul>
          <li><span className="swatch" style={{ background: '#fb923c' }} /> Hotspot observation (click to inspect)</li>
          <li><span className="swatch" style={{ background: 'transparent', border: '2px dashed #f97316' }} /> AOI extent (not an official boundary)</li>
        </ul>
        <div style={{ marginTop: 6, color: 'var(--muted)' }}>Points are nominal pixel centres, not fire perimeters. Basemap: CARTO dark matter (OpenStreetMap contributors).</div>
      </div>
    </div>
  );
}
