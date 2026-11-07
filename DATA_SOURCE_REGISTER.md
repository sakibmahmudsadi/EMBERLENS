# EMBERLENS — Data Source Register

**Current status (2026-11-07): national Bangladesh prototype snapshot downloaded, validated, and loaded.**
Current authoritative counts and availability metadata are recorded in section 11. Older bootstrap notes in sections 1–10 describe earlier project states and are superseded where they conflict with section 11. The active data is loaded only into `backend/emberlens-bangladesh.duckdb`; the retired Sundarbans database is separate.

## 1. What was verified live (2026-11-06)

| Claim | Source (retrieved 2026-11-06) |
|---|---|
| FIRMS API offers a `/api/area/` endpoint: "Fire detection hotspots based on area, date and sensor in CSV format" | https://firms.modaps.eosdis.nasa.gov/api/ |
| FIRMS API version reported as 4.2.6 | https://firms.modaps.eosdis.nasa.gov/api/ |
| Source codes listed by FIRMS docs: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT`, `LANDSAT_NRT` | https://firms.modaps.eosdis.nasa.gov/api/data_availability/ and https://firms.modaps.eosdis.nasa.gov/api/area/ |
| FIRMS area CSV requires a `MAP_KEY` and a valid day-range `1..5` | `curl https://firms.modaps.eosdis.nasa.gov/api/area/csv/MODIS_SP/88.0/21.5/90.0/22.7/1/2024-01-01/2024-01-07` → HTTP 400 "Invalid MAP_KEY. Invalid source. Invalid day range. Expects [1..5]. ..." (probe output preserved in working notes, 2026-11-06) |
| `https://firms.modaps.eosdis.nasa.gov/api/data_availability/MODIS_SP/` without a key → HTTP 401 Unauthorized | same command family, 2026-11-06 |
| Area API requires a day count + start date (no separate end path segment) | `https://firms.modaps.eosdis.nasa.gov/api/area` documents `/DAY_RANGE/DATE`; one corrected 2010 MODIS request returned HTTP 200 CSV with the configured key (2026-11-06). |

**Conclusion: no no-key path to historical bbox CSV exists.** The FIRMS Archive Download / `country_download` flow at https://firms.modaps.eosdis.nasa.gov/country_download/ returned HTTP 404 on 2026-11-06; the configured key is valid and the Area API works with its documented URL form. The national run is in progress.

## 2. Selected products (standard science-quality only — no NRT)

| Product ID | Sensor | Platform | Processing level | Collection / version | Notes |
|---|---|---|---|---|---|
| `MODIS_SP` | MODIS | Terra + Aqua combined | Standard (SP) | Collection 6.1 (MCD14IM / MCD14DL) | 1 km nominal. Source code *verified via FIRMS docs* (2026-11-06); collection mapping to be re-confirmed against a real file header once ingested. |
| `VIIRS_SNPP_SP` | VIIRS | Suomi-NPP | Standard (SP) | VNP14IMGTDL_SP, 375 m | 375 m. May add `VIIRS_NOAA20_SP` / `VIIRS_NOAA21_SP` later if coverage justifies — do **not** mix in for Phase 1 without a manifest entry. |

URL pattern (day-range ≤ 5 days per request; the ingester chunks automatically):

```text
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/MODIS_SP/<west>/<south>/<east>/<north>/<days>/<start>/<end>
https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_SP/<west>/<south>/<east>/<north>/<days>/<start>/<end>
```

## 3–8. Superseded Sundarbans bootstrap notes

The following historical decisions and checks predate the national prototype. They are retained only as project history; do not use them as current download instructions or as the current AOI/window:

- The original demo AOI was `sundarbans-bd` (bbox `88.0,21.5 → 90.0,22.7`) with a provisional 2024–2025 window. It was superseded by the national Bangladesh scope below.
- The earlier no-data/ABSENT validation result and 2026-11-06 endpoint probes describe the pre-ingestion state. Current snapshots, manifests, availability evidence, and limitations are recorded in section 11 and [the source-data coverage report](docs/SOURCE_DATA_COVERAGE_REPORT.md).
- The current ingester writes raw snapshots and manifests under `data/`; do not follow the old Sundarbans filenames. Keep `.env` credentials local and use the active products and frozen window in section 10.
- Current evidence still does not establish valid-pixel or clear-sky observation opportunity. Keep MODIS and VIIRS series separate and label empty calendar periods as unknown coverage.

## 9. Superseded window history

The earlier 2020–2025 Sundarbans window and 24→72-month change below are retained in git history; they are not the current dataset configuration. The active national window is in section 10.

## 10. National Bangladesh configuration (2026-11-06 user decision)

- Active scope is now **Bangladesh national bounding box** `aoi_id=bangladesh-bd`, bbox `88.0,20.5 → 92.7,26.7`, CRS `EPSG:4326`. It is task-specified, labelled as a bbox (not an authoritative boundary) and over-includes adjacent India/Myanmar at the edges.
- Products unchanged: **NASA FIRMS Standard (science-quality) only** — `MODIS_SP` (Collection 6.1) and `VIIRS_SNPP_SP` (VNP14IMGTDL_SP 375 m). No NRT.
- Window frozen to **2010-01-01 .. 2026-07-31** inclusive (199 month bins). Live `/api/data_availability/csv/<MAP_KEY>/` check on 2026-11-06 returned `MODIS_SP` 2000-11-01 → 2026-08-31 and `VIIRS_SNPP_SP` 2012-01-20 → 2026-07-31; the end is capped at the common VIIRS ceiling. MODIS-only 2026-08 is deliberately excluded rather than backfilled with NRT.
- `scripts/ingest.py --download` requests 5-day chunks via the FIRMS Area API using `.env` (`NASA_FIRMS_MAP_KEY`; never print/commit it). Raw files will be `data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` and `data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv`; atomic write only after all chunks succeed, with manifests/SHA-256 in `data/processed/manifests/`.
- `scripts/load_national_data.py` loads into a **separate** DB (default `backend/emberlens-bangladesh.duckdb`) and does **not** delete/replace legacy `backend/emberlens.duckdb` (locked/demo). Use a scratch DB for verification: `--db data/processed/bangladesh-bd.duckdb`.
- Frontend defaults now select this window and render `frontend/public/aoi/bangladesh-national.geojson`; legacy `sundarbans-demo.geojson` retained but inactive.
- BBox ≠ boundary and availability ≠ clear-sky coverage. Empty periods stay “no source records returned; observation coverage unknown.” No climatology/forecast claim from this window without separate validation.

## 11. Current loaded snapshot and availability evidence (2026-11-07)

| Product | Rows loaded | Acquisition bounds in data | Raw CSV | Manifest / validation |
|---|---:|---|---|---|
| `MODIS_SP` | 147,536 | 2010-01-01–2026-07-25 | `data/raw/MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` | `ingest-20261106T083508Z-4379f4_…`; SHA-256 `5a1fd42b902c…`; validation passed |
| `VIIRS_SNPP_SP` | 520,949 | 2012-01-20–2026-07-28 | `data/raw/VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv` | `ingest-20261106T091350Z-cfe10f_…`; SHA-256 `460a271eedb5…`; validation passed |

The requested end is 2026-07-31 inclusive. VIIRS observations start at its product availability date. The national DB contains 668,485 canonical observations. Two VIIRS rows fall outside the national bbox and are excluded from polygon-clipped calendar counts.

FIRMS source-service availability was retrieved on 2026-11-06 and registered in the Bangladesh DB; the MAP_KEY is not stored:

| Product | Platform | Reported availability interval | Status |
|---|---|---|---|
| `MODIS_SP` | Terra+Aqua (combined) | 2000-11-01–2026-08-31 | available |
| `VIIRS_SNPP_SP` | Suomi-NPP | 2012-01-20–2026-07-31 | available |

These broad intervals do not enumerate per-month missing acquisition dates, establish valid-pixel or clear-sky observation opportunities, or prove zero-detection periods. Empty calendar bins therefore remain “no source records returned; observation coverage unknown.” See `docs/SOURCE_DATA_COVERAGE_REPORT.md` for the evidence and limitations.
