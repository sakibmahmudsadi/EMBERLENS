# EMBERLENS — Data Source Register

**Status: Phase 1 blocked on NASA FIRMS API key — no real data downloaded yet (2026-11-06).**
Everything below is a research record + a frozen plan + a precise manual request.
No values, counts, or dates below were fabricated; claims cite the URL and retrieval date.

## 1. What was verified live (2026-11-06)

| Claim | Source (retrieved 2026-11-06) |
|---|---|
| FIRMS API offers a `/api/area/` endpoint: "Fire detection hotspots based on area, date and sensor in CSV format" | https://firms.modaps.eosdis.nasa.gov/api/ |
| FIRMS API version reported as 4.2.6 | https://firms.modaps.eosdis.nasa.gov/api/ |
| Source codes listed by FIRMS docs: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT`, `LANDSAT_NRT` | https://firms.modaps.eosdis.nasa.gov/api/data_availability/ and https://firms.modaps.eosdis.nasa.gov/api/area/ |
| FIRMS area CSV requires a `MAP_KEY` and a valid day-range `1..5` | `curl https://firms.modaps.eosdis.nasa.gov/api/area/csv/MODIS_SP/88.0/21.5/90.0/22.7/1/2024-01-01/2024-01-07` → HTTP 400 "Invalid MAP_KEY. Invalid source. Invalid day range. Expects [1..5]. ..." (probe output preserved in working notes, 2026-11-06) |
| `https://firms.modaps.eosdis.nasa.gov/api/data_availability/MODIS_SP/` without a key → HTTP 401 Unauthorized | same command family, 2026-11-06 |
| No `NASA_FIRMS_MAP_KEY` in env, and no `.env` file exists | Checked via `echo $NASA_FIRMS_MAP_KEY` + `ls .env` (2026-11-06); only `.env.example` with `replace_with_your_key` exists |

**Conclusion: no no-key path to historical bbox CSV exists.** The FIRMS Archive Download / `country_download` flow at https://firms.modaps.eosdis.nasa.gov/country_download/ returned HTTP 404 on 2026-11-06, and the area API gates on MAP_KEY. Per the brief, **no data were fabricated** — the pipeline below will ingest real files the moment they are supplied.

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

## 3. Demo AOI + frozen window

- **AOI:** Sundarbans, `aoi_id = sundarbans-bd`, bbox `west=88.0, south=21.5, east=90.0, north=22.7`, CRS `EPSG:4326`.
  This is the task-specified bbox; no public boundary source was reachable on 2026-11-06, so it is kept exactly as specified and must be replaced by an authoritative boundary if a later phase requires polygon semantics.
- **Window (PROVISIONAL):** `2024-01-01 .. 2025-12-31` (24 months, latest *likely* common SP window).
  SP ("Standard Product") data at FIRMS lags several months behind NRT by design, so the true latest common available end date can only be confirmed via the key-gated `/api/data_availability/<KEY>/<SOURCE>/` endpoint once a key exists. The frozen window above will be **replaced by the confirmed availability window and re-frozen in a follow-up commit** — it is not asserted as available today.

## 4. Manual data request (exact steps for the user)

1. **Register (free, same-day email):** https://firms.modaps.eosdis.nasa.gov/api/map_key/ — copy the returned `MAP_KEY`.
2. **Save it locally (never commit):** copy `.env.example` → `.env` and set `NASA_FIRMS_MAP_KEY=<key>`. Ensure `.env` is in `.gitignore`.
3. **Run the ingester (it checks availability, then chunks + downloads + validates + manifests):**
   ```bash
   cd "W:/Pipeline/Nasa Space App Challenge"
   python scripts/ingest.py --download
   ```
   It will write:
   - `data/raw/MODIS_SP_2024-01-01_2025-12-31_sundarbans-bd.csv`
   - `data/raw/VIIRS_SNPP_SP_2024-01-01_2025-12-31_sundarbans-bd.csv`
   - per-file manifests in `data/processed/manifests/`
   - a validation report in `data/processed/validation/`
4. **Alternative — manual CSV path (no key needed once files exist):** place the two CSVs above in `data/raw/` and run `python scripts/ingest.py --manual`.

Expected CSV columns (from the live FIRMS attribute tables for MODIS/VIIRS active-fire CSV): `latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, confidence, version, brightti4, frp, daynight` — the validator requires a subset and preserves extras.

## 5. Ingestion manifest fields (written by `scripts/ingest.py`)

Each manifest records: `source_snapshot_id`, `ingestion_run_id`, provider, `source_endpoint`, `product_id`, `processing_level`, `collection_version`, sensor, platform, requested AOI + window, `retrieved_at_utc`, source file path, `sha256`, `row_count`, validation summary, and documentation URL/date.

## 6. Gaps, limitations, and what is *not* claimed

- **No data downloaded.** Row counts = 0/ABSENT, checksums = none. The validation report with `ABSENT` entries is in `data/processed/validation/validation_ingest-20261106T052142Z-b8f9ea.json`.
- **SP availability lag unknown until key exists** — the provisional window may need shortening; shortening is preferred over mixing NRT records.
- **Bbox ≠ polygon.** A bounding box is a query convenience, not a boundary-derived AOI; point-in-polygon semantics are a Phase 2/3 concern.
- **No coverage claim.** FIRMS date-availability and missing-data endpoints describe source-service date presence only; they do not establish clear-sky or valid-pixel observation opportunity (see `docs/SCIENTIFIC_METHODOLOGY.md` §7.3). Empty CSV months must be reported as "no source records returned; observation coverage unknown," never as verified zero fires.
- **No sensor equivalence.** MODIS and VIIRS counts are kept separate; confidence semantics differ by product and must not be mapped without validation.

## 7. Expected interface for `backend/ingestion/` (another agent owns it — not edited here)

Consumers should read the manifests in `data/processed/manifests/*.json` and raw CSVs in `data/raw/` and must re-use `sha256` + `row_count` for provenance; they must not re-download or re-interpret source files differently. Any future `backend/ingestion/` client must produce the same manifest fields listed in §5.

## 8. Verification commands run 2026-11-06

```bash
curl -s https://firms.modaps.eosdis.nasa.gov/api/area/csv/MODIS_SP/88.0/21.5/90.0/22.7/1/2024-01-01/2024-01-07
# → HTTP 400 "Invalid MAP_KEY. Invalid source. Invalid area. ..."
curl -s -D - https://firms.modaps.eosdis.nasa.gov/api/data_availability/MODIS_SP/
# → HTTP 401 Unauthorized
python scripts/ingest.py --validate   # → 2 ABSENT entries, exit 0
python scripts/ingest.py --manual     # → 2 MISSING entries (cleanly reported)
```
