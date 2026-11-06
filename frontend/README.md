# EMBERLENS Frontend

Vite + React + TypeScript. Map: MapLibre GL with CARTO dark matter basemap. Calendar: plain divs (no chart lib).

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # tsc + vite build -> dist/
```

Backend API base URL: set `VITE_API_BASE_URL` (see `.env.example`, default `http://localhost:8000`). If the backend is down the UI shows “Backend unreachable” and never fabricates data.

## Structure

- `src/lib/apiClient.ts` — typed client for `/api/v1/*`
- `src/lib/types.ts` — shapes matching `docs/API_SPECIFICATION.md` + `DATA_DICTIONARY.md`
- `src/map/` — MapLibre map + AOI polygon (provisional boundary) + hotspot layer
- `src/calendar/` — month × year matrix, sensor-specific tabs, coverage wording
- `src/sensors/` — sensor/platform/product filter chips
- `src/observations/` — observation detail + provenance
- `src/exports/` — dataset/format picker, download, metadata manifest viewer
- `public/aoi/sundarbans-demo.geojson` — best-effort Sundarbans bbox (labelled provisional)

MODIS/VIIRS series are never summed; every count carries its unit. Scientific disclosures (methodology §15) are always visible in the footer.
