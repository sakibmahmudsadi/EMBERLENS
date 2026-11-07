# Historical NASA FIRMS Source Verification and Proposed Configuration

> **Historical reference:** this investigation predates the accepted national snapshot. Its proposed 24-month/Sundarbans configuration, key-availability note, and acquisition-route recommendations are superseded. Current product/date/availability facts are recorded in `DATA_SOURCE_REGISTER.md` §11 and `docs/SOURCE_DATA_COVERAGE_REPORT.md`; the active decision is ADR-012.

**Project:** EMBERLENS — NASA Space Apps Challenge 2026, *Harmonization of MODIS and VIIRS Hot Spots*  
**Status:** Proposed configuration awaiting team acceptance (see `DECISIONS.md` ADR-008 → ADR-011)  
**Verified:** 2026-11-06 against live NASA FIRMS pages (URLs and per-claim check dates below)  
**Environment note:** No `NASA_FIRMS_MAP_KEY` is available in this environment. Every statement that depends on obtaining a free MAP_KEY is explicitly flagged with **[KEY-REQUIRED]**.

> **How to read this document.** Every factual claim carries the exact source URL and the date it was checked. Claims that could not be verified from live NASA pages are marked **Not verified** and are never guessed. This document must be refreshed whenever the demo snapshot is actually frozen, because source dates move.

## 0. Summary of findings (why the project contract changes)

Live verification against the actual FIRMS service on 2026-11-06 established three facts that the starter pack assumed but had not proven:

1. **The Area API can only return recent days, not a 24-month historical window.** The live Area API page documents `DAY_RANGE: 1 .. 5` and a `[DATE]` parameter that returns `[DATE] .. [DATE + DAY_RANGE-1]`. A 24-month window therefore requires ≈ 365/5 = 73 sequential 5-day requests per product **[KEY-REQUIRED]**, or the Archive Download route.

2. **The Archive Download route requires authentication, not an API key.** The live download page states: *"Authentication through Earthdata or Email: Earthdata Login / Email Code … Once the request has been processed, you will receive an email with instructions on how to download your data."* It serves data *"older than the last 7 days"* as shapefile/CSV/JSON. **No MAP_KEY is used on this route.**

3. **The Sundarbans approximation box returns almost no records, while the Chittagong-adjacent coastal box returns thousands.** A direct, unauthenticated download of three real FIRMS yearly CSVs for Bangladesh (2025) found, inside a 1°×1° approximation box over the Sundarbans (88.5–89.5 °E, 21.5–22.5 °N), **1 MODIS row, 1 VIIRS S-NPP row, 0 VIIRS NOAA-20 rows** out of 2,247 / 9,000 / 8,550 Bangladesh-wide rows; the same files contain **1,985 / 6,835 / 6,350** rows in a Chittagong-adjacent coastal box (91.7–92.7 °E, 21.4–24.0 °N). **The Sundarbans is therefore not a useful demo AOI for EMBERLENS, despite being the starter pack's working example.** See §6 for evidence and the proposed replacement.

## 1. Product register (verified 2026-11-06)

### 1.1 Area API source codes — the exact identifiers the ingestion code must use

Source: `https://firms.modaps.eosdis.nasa.gov/api/area/` (checked 2026-11-06). The live page lists these `SOURCE` values with verbatim labels:

| `SOURCE` code | Page label (verbatim) | Processing level |
|---|---|---|
| `MODIS_NRT` | "MODIS Near Real-Time, Real-Time and Ultra Real-Time \*" | NRT |
| `MODIS_SP` | "MODIS Standard Processing" | Standard |
| `VIIRS_SNPP_NRT` | "VIIRS Suomi-NPP Near Real-Time, Real-Time and Ultra Real-Time \*" | NRT |
| `VIIRS_SNPP_SP` | "VIIRS Suomi-NPP Standard Processing" | Standard |
| `VIIRS_NOAA20_NRT` | "VIIRS NOAA-20 Near Real-Time, Real-Time and Ultra Real-Time \*" | NRT |
| `VIIRS_NOAA20_SP` | "VIIRS NOAA-20 Standard Processing" | Standard |
| `VIIRS_NOAA21_NRT` | "VIIRS NOAA-21 Near Real-Time, Real-Time and Ultra Real-Time \*" | NRT |
| `VIIRS_NOAA21_SP` | "VIIRS NOAA-21 Standard Processing" | Standard |
| `LANDSAT_NRT` | "LANDSAT Near Real-Time, Real-Time and Ultra Real-Time \* [US/Canada only]" | NRT, out of scope |

The same nine codes appear as `<option value="…">` entries in the Area API page form, and as the sensor dropdown on the data-availability page (`https://firms.modaps.eosdis.nasa.gov/api/data_availability/`, checked 2026-11-06). Note the older VIIRS 1 km-era codes (`VIIRS_SNPP_1KM_NRT`/`_SP`) do **not** appear anywhere on the current live pages; no VIIRS 1 km/750 m source is offered by the current FIRMS API.

**Data-availability service** (checked 2026-11-06): endpoint pattern `"/api/data_availability/csv/[MAP_KEY]/[SENSOR]"`, with `[SENSOR]` one of the codes above or `"ALL"`. **[KEY-REQUIRED]** — probed 2026-11-06 with an invalid key; the service returned HTTP 401 with body `Invalid MAP_KEY.`

### 1.2 Earthdata product pages (short names, versions, resolution, coverage)

All checked 2026-11-06:

| Product | Short name | Version | Resolution | Coverage | Source |
|---|---|---|---|---|---|
| MODIS C6.1 active fire (NRT) | `MCD14DL` | `6.1NRT` | "1 Kilometers x 1 Kilometers" | "N: 80 S: -80 E: 180 W: -180", "GLOBAL" | `https://earthdata.nasa.gov/earth-observation-data/near-real-time/firms/c6-mcd14dl` |
| VIIRS S-NPP 375 m (NRT) | not verified (page lists products by title "VIIRS (S-NPP) I Band 375 m Active Fire Product NRT (Vector data)") | not verified | 375 m | GLOBAL | same Earthdata FIRMS page |
| VIIRS NOAA-20 375 m (NRT) | `VJ114IMGTDL_NRT` | "2" | "375 Meters x 375 Meters" | "N: 90 S: -90 E: 180 W: -180", "GLOBAL" | `https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/vj114imgtdlnrt` |
| VIIRS NOAA-21 375 m (NRT) | `VJ214IMG_NRT` | "2" | "375 Meters x 375 Meters" | "N: 90 S: -90 E: 180 W: -180", "GLOBAL" | `https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/vj214imgtdlnrt` |

Caveats, stated honestly:

- The Earthdata `c6-mcd14dl` page snapshot obtained on 2026-11-06 shows **"Temporal Coverage start: 2019-12-15"** for `MCD14DL 6.1NRT`, while the FIRMS archive download page states **"MODIS Collection 6.1: Temporal Coverage: 1 November 2000 - present"** (`https://firms.modaps.eosdis.nasa.gov/download/`, checked 2026-11-06, page source). The FIRMS figure covers the Collection 6.1 standard/archive record; the Earthdata `6.1NRT` granule page appears to describe the NRT delivery stream. The archive figure is the one used in §3 because it is the standard-data figure the prototype needs; the discrepancy is recorded here rather than silently resolved.
- **Standard-processing short names (the `SP` counterparts) are Not verified.** The Earthdata NRT pages are reachable; the standard-product pages were not located in this session. Ingestion must resolve them at implementation time and record the URLs — do not guess short names into the manifest.
- VIIRS short name for S-NPP 375 m on the live Earthdata FIRMS page was not captured verbatim in this session (the page lists products by title). Do not hard-code a short name for S-NPP until it is read.

### 1.3 Image-band / product naming cross-check

The FIRMS JS bundle (`https://firms.modaps.eosdis.nasa.gov/dist/firms_content.ce1c1e7f.js`, checked 2026-11-06) confirms the yearly-summary (country) products live under `/data/country/` with prefixes `modis`, `viirs-jpss1` (= VIIRS NOAA-20/JPSS-1), `viirs-snpp`, and no `viirs-jpss2` entry. Its active-fire table headers read "MODIS 1km", "VIIRS 375m / NOAA-20", "VIIRS 375m / NOAA-21", "LANDSAT 30m". This confirms (a) the 375 m I-band family is the current VIIRS offering, and (b) the **country yearly summaries do not include NOAA-21** — a real constraint for the no-key fallback in §4.

### 1.4 Temporal coverage per processing level (from the live FIRMS Fire Map config)

Source: `https://firms.modaps.eosdis.nasa.gov/map/` page source, `date_ranges` object (checked 2026-11-06):

| Internal key | Start | End | Reading |
|---|---|---|---|
| `modis_v6` | 2000-11-01 | **2026-08-31** | MODIS Collection 6.1 standard |
| `modis_nrt` | 2020-11-01 | 2026-11-04 | MODIS NRT (note later start than the standard product) |
| `suomi_viirs_c2_sp` | 2012-01-20 | **2026-07-31** | VIIRS S-NPP 375 m standard |
| `suomi_viirs_c2_nrt` | 2019-09-01 | 2026-11-02 | VIIRS S-NPP NRT |
| `jpss1_viirs_c2` | 2018-04-01 | **2026-07-31** | VIIRS NOAA-20 375 m standard |
| `jpss1_viirs_c2_nrt` | 2019-12-04 | 2026-11-04 | VIIRS NOAA-20 NRT |
| `jpss2_viirs_c2` | 2023-03-01 | **2026-07-31** | VIIRS NOAA-21 375 m standard |
| `jpss2_viirs_c2_nrt` | 2024-01-17 | 2026-11-04 | VIIRS NOAA-21 NRT |

Implications:

- The **latest common standard-viewable date across the four standard products is 2026-07-31** (three of the four end there; MODIS standard ends 2026-08-31). These are map-layer metadata dates, not rows inspected per product; treat them as the existence ceiling, not as a guarantee of rows on any given day in any AOI.
- **NOAA-21 standard coverage begins 2023-03-01**, which is why NOAA-21 cannot extend a window backwards; it is also missing from the country yearly summaries (§1.3).
- `modis_nrt` starts 2020-11-01 while `modis_v6` starts 2000-11-01, and NRT start dates lag the standard starts for all three VIIRS platforms. Mixing NRT into a standard window to "fill" early dates would mix processing levels and is prohibited by the project contract.

## 2. Attributes: fields, units, confidence semantics (verified 2026-11-06)

### 2.1 Authoritative attribute tables

`https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs` (checked 2026-11-06) is the current attribute authority; the FIRMS `AttributesReadme.txt` (`https://firms.modaps.eosdis.nasa.gov/data/country/AttributesReadme.txt`, fetched 2026-11-06) points to it and adds: data are in **WGS84 geographic** projection; *"Use the Collection / Version field to distinguish between NRT and standard data."*

**MODIS (NRT table, verbatim substance):** Latitude/Longitude = centre of the 1 km pixel (degrees); Brightness = channel 21/22 temperature, "measured in Kelvin"; Scan/Track = pixel size in km (≈1 km at nadir, growing toward swath edge); Acq_Date; Acq_Time **in UTC**; Satellite: "A = Aqua and T = Terra"; **Confidence: "0 and 100%"**, mapped to "low-confidence fire, nominal-confidence fire, or high-confidence fire"; **Version e.g. "6.1URT" / "6.1RT" / "6.1NRT" / "6.1"**; Bright_T31 (channel 31, Kelvin); **FRP "MW (megawatts)"**, "Total radiative power integrated over the pixel"; DayNight "D= Daytime fire, N= Nighttime fire"; Type: "0 = presumed vegetation fire, 1 = active volcano, 2 = other static land source, 3 = offshore — only available for MCD14ML (standard quality) data".

**VIIRS 375 m (NRT table, verbatim substance):** Latitude/Longitude = centre of the nominal 375 m pixel; Bright_ti4 (I-4, Kelvin); Scan/Track in m ("approximately 375 m pixels at nadir"); Satellite "N= Suomi NPP, N20=NOAA-20, N21=NOAA-21"; **Confidence "low, nominal and high"**; Version "1.0NRT" / "1.0"; Bright_ti5 (I-5, Kelvin); "**FRP MW (megawatts)** … retrieval is limited because I4 often saturates and uses hybrid 375/750 m data"; DayNight D/N.

**Operational consequences for EMBERLENS:**

- Never map MODIS numeric confidence to VIIRS categorical confidence (project guardrail, now confirmed by the sources above; the VIIRS table explicitly warns FRP retrieval uses hybrid 375/750 m data when I4 saturates).
- The `version` field is the in-band way to detect mixed processing levels in a file. The prototype's schema must require `version` and reject/filter NRT-suffixed versions out of a standard window rather than silently accepting them.
- Scan/track pixel sizes vary with view angle for both sensors; the schema must preserve them, and any density/area normalization must use them rather than the nominal constants.

### 2.2 Empirical schema check on real downloaded files (2026-11-06)

Three real FIRMS standard-quality CSVs were downloaded from the no-key country-summary path and inspected (checksums in §6):

- `modis_2025_Bangladesh.csv` (2,247 rows): columns `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`; version values all `61.03`; confidence numeric 0–100 (min 0, max 100, median 72); `satellite` values `Aqua`/`Terra` (full names, **not** `A`/`T` as the attribute table says — the parser must accept and normalize both); `type` present with values 0/2.
- `viirs-snpp_2025_Bangladesh.csv` (9,000 rows): columns `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type`; version all `2`; confidence values exactly `h`/`l`/`n`; `satellite` = `N`.
- `viirs-jpss1_2025_Bangladesh.csv` (8,550 rows): same columns; `satellite` = `N20`; confidence `h`/`l`/`n`.
- No exact-duplicate keys (latitude, longitude, acq_date, acq_time, satellite) in any of the three files.

**Not verified:** whether the standard VIIRS/VJ14-style column sets differ from the NRT tables above (e.g. an extra `brightness_2`/KMZ column like the map layers). The empirical check shows the country-summary standard files use the same 15-column layout as the NRT table; the Area-API standard (`*_SP`) output columns must be confirmed on the first key-holding retrieval and recorded then.

## 3. Acquisition routes and their authentication model (verified 2026-11-06)

### 3.1 Route A — Area API (needs a free MAP_KEY) **[KEY-REQUIRED]**

- Endpoint (from the live page source, `https://firms.modaps.eosdis.nasa.gov/api/area/`, checked 2026-11-06):
  - `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]` — "Get most recent data, from TODAY to TODAY - (DAY_RANGE-1)"
  - `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]` — "Returns data for [DATE] .. [DATE + DAY_RANGE-1]"
- `AREA_COORDINATES`: "west,south,east,north" or `world` (`-180,-90,180,90`). **The API takes a bounding box, not a polygon** — AOI clipping must happen in EMBERLENS after retrieval.
- `DAY_RANGE`: **"1 .. 5 - number of days to query at one time"** (verified in page source and in the form's `<select>` options 1–5).
- `DATE`: "YYYY-MM-DD - [Optional] If not provided it will return the most recent data".
- Key registration: `https://firms.modaps.eosdis.nasa.gov/api/map_key/` (checked 2026-11-06): *"sign up for free MAP_KEY using your email — The key will be sent to your email."* Email method only; Earthdata login is not required for the key. Limit: **"MAP_KEY limit is 5000 transactions / 10-minute interval"**; "Larger transactions may count as multiple requests (ex. requesting 7 days)". The key is 32 lowercase hex chars (validated client-side on the area page).
- **[KEY-REQUIRED]**: no key exists in this environment, so no Area-API request has been executed and no API row has been observed. Probed 2026-11-06: an invalid key returns HTTP 400 `Invalid MAP_KEY.` for `/api/area/csv/…` and HTTP 401 `Invalid MAP_KEY.` for `/api/data_availability/csv/…`.

### 3.2 Route B — Archive Download (no API key; needs Earthdata **or** email login)

`https://firms.modaps.eosdis.nasa.gov/download/` (page source fetched 2026-11-06):

- "Download active fire/hotspot information older than the last 7 days as: shapefiles (.shp), comma-separated text files (.csv) or JSON files (.json)"
- "Authentication through Earthdata or Email: Earthdata Login [link: `/oauth/login?redirect=/api/auth/login/download/ed/`] / Email Code — Enter CODE emailed to: … Login with code"
- "Note: Near Real-Time (NRT) data are replaced with standard science quality data as they become available (with approximately a 5 month lag). … Once the request has been processed, you will receive an email with instructions on how to download your data."
- Temporal coverage stated: LANDSAT 30 m 2022-06-20–present; **MODIS Collection 6.1: 2000-11-01–present; VIIRS S-NPP 375 m: 2012-01-20–2026-11-02; VIIRS NOAA-20 375 m: 2018-04-01–present; VIIRS NOAA-21 375 m: 2023-03-01–present.**

**No API key is involved on this route, but an account is required** (Earthdata login, or an email 6-digit code sent to the user's address). **[KEY-REQUIRED]** in the broader sense: a credentialed account action by a team member is required; this cannot be scripted end-to-end in this environment and has not been executed here.

### 3.3 Route C — Country yearly summaries (no key, no login) — the only route observed to work in this environment

Index: `https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt` (fetched 2026-11-06; 10,145 entries). Files served directly at `https://firms.modaps.eosdis.nasa.gov/data/country/{modis,viirs-jpss1,viirs-snpp}/{product}_{year}_{Country}.csv` with **no key and no login** (verified by successful direct HTTP 200 downloads of four files, §6).

- Coverage in the index: `modis` 2000–2025, `viirs-jpss1` (NOAA-20) 2018–2025, `viirs-snpp` 2012–2025. **No NOAA-21 (`viirs-jpss2`) country files exist.** Most recent "updated" stamp in the index: **2026-10-10** (the 2025 files for Bangladesh were freshly stamped, meaning the 2025 yearly files were published in October 2026).
- **Whole-country granularity only.** There is no AOI subset; the prototype must filter by bounding box (or proper polygon) after download. A whole-country bounding box is a superset of any AOI, so the no-key route fundamentally cannot avoid downloading full-country CSVs; the exported demo subset is produced by EMBERLENS clipping, not by FIRMS selection. Row counts are small for Bangladesh (2,247–9,000 rows/year) but a global all-countries zip is 81.7 MB for MODIS 2023 alone, so per-country is the only sane option.
- **Known approximation:** country-year files are compiled calendar-year aggregates of the standard record. Whether they are byte-identical to what an AOI-scoped Archive Download or Area-API retrieval would return for the same period is **Not verified**: the `version` values observed here (`61.03` MODIS, `2` VIIRS) are clean standard values, and the attributes readme refers to these files as the standard record, but no cross-check against the other two routes is possible without a key/account.

### 3.4 Which route should the prototype use? (proposed, §5 + ADR-010)

- Default path: **Route C (no key, no login)** is the only route whose execution has been observed end-to-end in this environment and it covers MODIS + VIIRS S-NPP + VIIRS NOAA-20 standard data for full calendar years 2024 and 2025 — exactly a 24-month standard window with zero NRT mixing. It is the lowest-risk demo path.
- It cannot provide NOAA-21 (no country files) and cannot provide a rolling "latest 24 months ending today" window (the newest complete year is 2025, published 2026-10-10). If the team wants NOAA-21 or a 2025–2026 window, it needs Route A (key) or Route B (account).
- Therefore: the frozen configuration in §5 is stated as a **Route-C window (2024-01-01 → 2025-12-31)**, with the key-dependent Route-A alternative (2024-08-01 → 2026-07-31) recorded as the upgrade path. The two must not be mixed in one calendar.

## 4. Source gaps and caveats (documented, not solved)

1. **NRT is replaced by standard data with ≈ 5 months' lag** (download page note, §3.2). Direct consequence: at any retrieval date, the standard record is ~3–5 months behind the NRT record. A "latest common window" that mixes NRT's recent months with standard months would contain an artificial processing-level step; the project contract forbids this. The 2024–2025 Route-C window is entirely standard, so this caveat does not bite it.
2. **Maintenance windows are only announced via the news feed, not retroactively documented.** `https://firms.modaps.eosdis.nasa.gov/api/articles/` (fetched 2026-11-06) currently lists 6 items: MODAPS/LAADS/Lance-MODIS (NRT) maintenance **2026-06-15/16** (12:00–18:00 UTC, hosts including `firms`, `firms2`), **2026-05-04/05**, **2025-09-08/09/10**, **2025-04-28/29/30**; a 2024-11-04 discontinuation of `.met` files; and a 2024-11-04/06 S-NPP geolocation reset with NRT/STD processing resumed 2024-11-09. These belong in the gap register as **announced maintenance days**; they are not proof of data absence. Per-product daily presence must still be checked with `/api/data_availability/` **[KEY-REQUIRED]** and `/api/missing_data/` before the calendar is published.
   - The missing-data service page (`https://firms.modaps.eosdis.nasa.gov/api/missing_data/`, checked 2026-11-06) states: "This table provides a list of the days where there is missing data in our database. Each line represents one day where there is missing data, for that particular satellite and data type." and "The near real time (NRT) data is ONLY shown past the last available date of the standard data per satellite." It exists to answer "which days are missing" — it does **not** establish that present days had clear-sky coverage (§3.2 of `SCIENTIFIC_METHODOLOGY.md`).
3. **The map `date_ranges` ceilings are metadata, not per-day guarantees** (§1.4). Only a key-holding `/api/data_availability/csv/[KEY]/[SENSOR]` call can enumerate per-day presence **[KEY-REQUIRED]**.
4. **No end-to-end API execution has occurred in this environment** — there is no key. Everything in §3.1's execution path (endpoint, sources, day range, limits) is verified as *documented*; nothing in §3.1 is verified as *observed returning rows*.

## 5. Frozen demo configuration (PROPOSED — requires ADR acceptance)

| Item | Proposed value | Basis / source |
|---|---|---|
| **AOI** | **Not the Sundarbans.** Proposed: a **Chittagong-adjacent coastal box** (or a polygon over the same coastal cluster) — see §7 for why, and ADR-008 for the decision and what would change it. Initial executable proxy: bbox `91.7, 21.4, 92.7, 24.0` (W,S,E,N), refined to a stored polygon at implementation time. | Row counts §6 |
| **AOI boundary source** | **Not verified / to be chosen and versioned at implementation.** The FIRMS country files are whole-country; EMBERLENS must ship its own versioned AOI geometry (e.g. a hand-drawn GeoJSON committed to `data/`) and record its source/derivation in the metadata manifest. Do not use a country boundary as the AOI. | — |
| **Products (Route C, standard)** | `modis` (MODIS Collection 6.1, standard; Earthdata short name `MCD14DL`; observed `version` **61.03**), `viirs-snpp` (VIIRS S-NPP 375 m, standard; observed `version` **2**, `satellite` `N`), `viirs-jpss1` (VIIRS NOAA-20 375 m, standard; observed `version` **2**, `satellite` `N20`). | §1.2, §2.2 |
| **Products excluded** | VIIRS NOAA-21 (no country files, §1.3/§3.3); all `*_NRT` sources (would mix processing levels, §4.1); LANDSAT (US/Canada only / out of challenge scope). | §1.1, §3.3 |
| **Window (Route C)** | **2024-01-01 → 2025-12-31** (24 months, both calendar years fully published as of 2026-10-10). UTC month boundaries per the project contract. | §3.3, §1.4 |
| **Window (Route A fallback, key-dependent)** | **2024-08-01 → 2026-07-31** (the 24 months ending at the latest common standard ceiling 2026-07-31), fetched per product as 5-day Area-API requests (≈ 73 requests/product) using `*_SP` sources. **[KEY-REQUIRED]** — if adopted, the two windows must never be blended in one calendar. | §1.4, §3.1 |
| **Acquisition path** | Route C first (no key, no login, observed working). Register a MAP_KEY anyway (`https://firms.modaps.eosdis.nasa.gov/api/map_key/`, email, free) to (a) run `/api/data_availability/` gap checks, and (b) enable the Route-A upgrade. **[KEY-REQUIRED]** for (a). | §3 |
| **Calendar count unit** | Source observation rows after exact-duplicate removal within product/snapshot; sensor-separated; UTC calendar months; point-in-polygon including boundary; no confidence filter (ADR-007, unchanged). | Project contract |
| **Snapshot manifest** | Must record per file: source URL, retrieval date, byte size, SHA-256, row count, product/version, and the AOI clipping rule applied. Four example file hashes are in §7. | — |

## 6. Evidence: real downloads and row counts (2026-11-06)

### 6.1 Files downloaded (no key, no login — direct HTTP 200)

| File | URL | Bytes | SHA-256 | Rows |
|---|---|---:|---|---:|
| `modis_2025_Bangladesh.csv` | `https://firms.modaps.eosdis.nasa.gov/data/country/modis/modis_2025_Bangladesh.csv` | 177,795 | `4273d4c30e70aedd03c1b065a900fa7f671d2f172dc68712d770c3ca4b20f5cb` | 2,247 |
| `viirs-snpp_2025_Bangladesh.csv` | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/viirs-snpp_2025_Bangladesh.csv` | 705,867 | `f31bd4ce28ce4f1cdbee04c122e9f9b0b528754e7e21f56b4057cbb6a9339e96` | 9,000 |
| `viirs-jpss1_2025_Bangladesh.csv` | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/viirs-jpss1_2025_Bangladesh.csv` | 687,756 | `889a2e2e112449683090e2804a35ba13266cd364f5cf66f655b54e650bb8a141` | 8,550 |
| `viirs-snpp_2024_Bangladesh.csv` | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/viirs-snpp_2024_Bangladesh.csv` | 633,974 | `529d46bcb849dbc6b1056be8d97cd39cc67e2b30f0cd1796b7fd29dbf447ddc6` | 8,083 |

### 6.2 Where the records are (2025, Bangladesh-wide files)

Approximate boxes used only for diagnosis (not the final AOI):

| Box | MODIS | VIIRS S-NPP | VIIRS NOAA-20 |
|---|---:|---:|---:|
| **Sundarbans approximation** 88.5–89.5 °E, 21.5–22.5 °N | **1** | **1** | **0** |
| **Chittagong-adjacent coastal** 91.7–92.7 °E, 21.4–24.0 °N | 1,985 | 6,835 | 6,350 |
| Bangladesh-wide total | 2,247 | 9,000 | 8,550 |

The tiny Sundarbans figures are not a retrieval error: the same checks on 2024 (`viirs-snpp_2024_Bangladesh.csv`) also find 1 row in the same approximation box (2024-02-26, 21.77 N 89.21 E). The dominant 2025 activity in these files is a strong **March–April seasonality** (e.g. S-NPP: Jan 322, Feb 359, **Mar 3,830, Apr 3,570**, May 198, then low singles through October, Nov 281, Dec 336; MODIS: Mar 1,116, Apr 928) clustered in the 92–92.6 °E / 21.5–23.5 °N coastal strip. That seasonality is the kind of signal the monthly calendar exists to show, and it is essentially absent from a Sundarbans box.

### 6.3 Coverage honesty for the same files (days present)

For each 2025 file, distinct `acq_date` values: MODIS 130 of 365 days (longest empty-day run 43 days); S-NPP 237 of 365 (longest run 26); NOAA-20 252 of 365 (longest run 20). Every calendar month has ≥1 row for all three products (no zero-month), but **no day-level coverage claim can be made from these files alone**: an absent date is "no source records returned; observation coverage unknown" in EMBERLENS labels, exactly as the methodology requires. Per-day presence must be cross-checked against `/api/data_availability/` and `/api/missing_data/` **[KEY-REQUIRED]** before release.

## 7. What is NOT verified (explicit, by design)

1. **Standard-processing short names** (`*_SP` Earthdata equivalents) and the exact standard attribute-table column sets — not located in this session; must be resolved and recorded at implementation. Do not guess.
2. **Whether Route-C country files are byte-identical to Route-A/Route-B outputs** for the same product/period — no key/account exists here to cross-check.
3. **Per-day product presence** inside the 2024–2025 window (needs `/api/data_availability/` with a key) — so no day-level gap list can be asserted yet.
4. **The last date inside the 2025 yearly files** (2025-12-31 for all three, observed) is consistent with complete calendar years, but completeness of those yearly compilations (e.g. late-arriving standard reprocessing after publication) is not independently confirmed by NASA on any page read; treat the 2025 files as the publisher's frozen yearly record.
5. **The official NASA Space Apps 2026 hackathon dates.** The project `ROADMAP.md` states Nov 14–15, 2026 with submission "through November 15 at 11:59 PM local time" citing `https://www.spaceappschallenge.org/2026/`. On 2026-11-06 that URL could not be fetched from this environment (certificate error via the fetch tool; direct fetch blocked). Web search returned conflicting, unverified claims (one search result asserted "October 3–4, 2026"; other search results refused to confirm any 2026 dates). The sites' own challenge page (`https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/`) must be read by the team on a normal connection and the roadmap corrected if needed. **ROADMAP.md was therefore left unchanged** (mission rule 5): no factual error was established, only an inability to verify. This needs a human check before the team plans around either date.

## 8. Decision references

- ADR-008 — Demo AOI (proposed): Chittagong-adjacent coastal region, not the Sundarbans; rationale from §7.2.
- ADR-009 — Product set and 24-month window (proposed): Route-C standard products, 2024-01-01 → 2025-12-31, with the key-dependent 2024-08-01 → 2026-07-31 upgrade recorded.
- ADR-010 — Acquisition path (proposed): Route C by default; register a MAP_KEY for gap checks and the Route-A upgrade.
- ADR-011 — Rolling standard-window rule (proposed): future snapshots take the latest 24 months whose *standard* record is complete for all selected products, never extending with NRT.

## 9. Reproducibility of this verification

Research notes (file hashes, row counts, monthly tables, and exact quoted page excerpts) were produced on 2026-11-06 and summarized in §7. To re-verify: re-fetch each cited URL, then re-run the three country-file downloads and row/box counts. Any disagreement with the map `date_ranges` ceilings (§1.4) or the yearly index (§3.3) means FIRMS has published new standard data, and §5 must be re-frozen with the new dates and a new snapshot manifest.

## 10. Immediate team actions that only a human can do

1. Register the free MAP_KEY: `https://firms.modaps.eosdis.nasa.gov/api/map_key/` (email; key emailed to you). Store it in `.env` as `NASA_FIRMS_MAP_KEY` (already present as a placeholder in `.env.example`); never commit it. **[KEY-REQUIRED]**
2. Confirm, on a normal connection, the official 2026 hackathon and submission dates from `https://www.spaceappschallenge.org/2026/` and correct `ROADMAP.md` if the Nov 14–15 dates are wrong (§8, item 5).
3. Decide the final AOI geometry (ADR-008) and commit it as versioned GeoJSON with its boundary source recorded.
4. Fetch `/api/data_availability/csv/[MAP_KEY]/MODIS_SP`, `/VIIRS_SNPP_SP`, `/VIIRS_NOAA20_SP` and `/api/missing_data/` for the frozen window, and fold the resulting per-day presence into the coverage model before any calendar is published.
