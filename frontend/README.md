# EMBERLENS Frontend

Vite + React + TypeScript. Map: MapLibre GL with CARTO dark matter basemap. Calendar: plain divs (no chart lib).

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # tsc + vite build -> dist/
```

In development the Vite server proxies `/api` to `http://127.0.0.1:8000` by default; set `VITE_API_PROXY_TARGET` to use another API port. `VITE_API_BASE_URL` is optional for a separate-origin API. For the competition presentation, run the app through the native launcher from the project root (`.\start_emberlens.ps1` starts backend on 8000 and Vite on 5173; `.\stop_emberlens.ps1` stops them). If the backend is down the UI shows an error and never fabricates data.

## Structure

- `src/lib/apiClient.ts` — typed client for `/api/v1/*`
- `src/lib/types.ts` — shapes matching `docs/API_SPECIFICATION.md` + `DATA_DICTIONARY.md`
- `src/map/` — MapLibre map, national query-box/reference outlines, selected map-view bounds, and hotspot layers
- `src/calendar/` — month × year matrix, sensor-specific tabs, coverage wording
- `src/sensors/` — sensor/platform/product filter chips
- `src/observations/` — observation detail + provenance
- `src/exports/` — dataset/format picker, download, metadata manifest viewer
- Map-view bounds can be applied as a subarea to observations, map density, calendar, group analysis, and exports; they are intersected with the configured national bounding box. Source availability remains global.
- `public/aoi/bangladesh-national.geojson` — task-specified Bangladesh national bbox (W=88.0, S=20.5, E=92.7, N=26.7), labelled as not an authoritative boundary and not a claim of complete coverage
- `public/aoi/bangladesh-country-outline.geojson` — geoBoundaries Bangladesh ADM0 reference outline (2015 representation; derived from Wikimedia Commons; CC0 1.0). Display-only context: the active query AOI, observations, counts, and exports still use the task-specified bounding box. Source metadata: [geoBoundaries API](https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM0/) and [download file](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BGD/ADM0/geoBoundaries-BGD-ADM0_simplified.geojson).
- `public/aoi/search-place-boundaries.geojson` — display outlines for curated locations. Bangladesh district outlines come from [geoBoundaries BGD ADM2](https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM2/) (CC BY 3.0 IGO); the Sundarbans outline is the Ramsar-designated Sundarbans Reserved Forest (WDPA ID 67808), sourced from the public [Protected Region Feature Service](https://services1.arcgis.com/vdxp8SwMGji0hqly/ArcGIS/rest/services/Protected_Region_final_WFL1/FeatureServer/0). These are visual reference boundaries. Fire-observation analysis continues to use the existing curated rectangular query bounds; outlines do not redefine the analysis footprint.

MODIS/VIIRS series are never summed; every count carries its unit. Scientific disclosures (methodology §15) are always visible in the footer.
