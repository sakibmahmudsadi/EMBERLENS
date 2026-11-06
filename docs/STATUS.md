# Project Status

**Last updated:** 2026-11-06  
**Owner:** Team  
**Overall status:** Documentation and prototype scope are prepared; M0/M1 work is underway via subagents.

> **Environment honesty note (2026-11-06):** The build itself (code, ingestion, calendar, API, frontend) is being executed by other agents/subagents, outside this document-update task. This file records only what was verified in the documentation/verification pass: the live NASA FIRMS source checks below, the documentation pack promotion (root now mirrors `Info/`, with `Info/` kept as reference), and the proposed decisions. No application capability is reported as implemented unless an agent verified it and recorded the evidence here.

## Current milestone

- **Milestone:** M0/M1 — repository and data reconnaissance; real source ingestion now underway via subagents
- **Status:** In progress. The documentation pack originally issued as `Info/` has been promoted to the project root (`W:/Pipeline/Nasa Space App Challenge/`); the root now mirrors `Info/`, and `Info/` is retained as a reference copy. Application scaffold directories (`backend/`, `frontend/`, `scripts/`, `data/`, `infrastructure/`) exist at the root; their build state is the responsibility of the implementation agents and is not asserted here.
- **Evidence:** `docs/NASA_SOURCE_VERIFICATION.md` (live FIRMS verification, 2026-11-06); `docs/DECISIONS.md` ADR-008 → ADR-011 (proposed).

## Prototype contract (with the proposed frozen configuration)

- One documented AOI. **Proposed replacement: Chittagong-adjacent coastal region, not the Sundarbans** (ADR-008). The Sundarbans approximation box returned 1 / 1 / 0 MODIS / VIIRS-S-NPP / VIIRS-NOAA-20 rows in the real 2025 files; the coastal box returned 1,985 / 6,835 / 6,350.
- One fixed source window of at most 24 months; no backfill to product start dates. **Proposed: 2024-01-01 → 2025-12-31, standard products only** (ADR-009). Upgrade path to 2024-08-01 → 2026-07-31 requires a MAP_KEY (ADR-010).
- Prefer the latest common source-available window for selected products at retrieval time; report known source-service gaps and freeze exact dates/snapshot IDs.
- Monthly calendar with separate sensor/platform/product series.
- An empty hotspot query is “no source records returned; observation coverage unknown” unless independent coverage evidence supports a verified zero.
- Two years demonstrates the workflow; it does not establish a robust climatology, anomaly baseline, or forecast.

## Product state

| Capability | State | Evidence / notes |
|---|---|---|
| NASA MODIS ingestion | Not verified (implementation agent's responsibility) | Proposed product: MODIS Collection 6.1 standard (`MCD14DL`, `version` 61.03) |
| NASA VIIRS ingestion | Not verified | Proposed products: S-NPP 375 m and NOAA-20 375 m standard (`version` 2); NOAA-21 excluded on the no-key route (no country files) |
| Raw source preservation | Not verified | Ingestion manifest/hash discipline specified in `NASA_SOURCE_VERIFICATION.md` §5 |
| Canonical schema | Proposed only | See `DATA_DICTIONARY.md`; attribute field semantics verified in `NASA_SOURCE_VERIFICATION.md` §2 |
| Coverage/missing-data logic | Not implemented/verified | Needs `/api/data_availability/` + `/api/missing_data/` — **[KEY-REQUIRED]** (no `NASA_FIRMS_MAP_KEY` in this environment) |
| Monthly burning-activity calendar | Not implemented/verified | ADR-007 (count unit) is accepted; AOI/window are proposed |
| Cross-sensor comparison | Method scoped, implementation not verified | Common bins and separate series; no fused count by default |
| Historical baseline | Deferred | Two-year prototype window is not a robust climatology |
| Anomaly analysis | Deferred | Requires additional reference data and validation |
| Hotspot grouping | Deferred | Optional after the P0 prototype works |
| API | Not verified | Inspect actual repository |
| Frontend/map | Not verified | Inspect actual repository |
| Research exports | Not implemented/verified | Small bounded export with metadata is P0 |

## Active work

| Task | Owner | Priority | Status | Blocker |
|---|---|---:|---|---|
| Live NASA FIRMS source verification + frozen config proposal | Documentation agent | P0 | Done 2026-11-06 (`docs/NASA_SOURCE_VERIFICATION.md`) | — |
| Accept ADR-008 → ADR-011 (AOI, products/window, acquisition path, rolling rule) | Team | P0 | Pending | Team decision |
| Register free FIRMS MAP_KEY by email (`https://firms.modaps.eosdis.nasa.gov/api/map_key/`) | Team (human) | P0 | Pending | Needs a team member's email; key goes in `.env` as `NASA_FIRMS_MAP_KEY`, never into git |
| Commit versioned AOI polygon (GeoJSON) with boundary source | Team / implementation | P0 | Pending | ADR-008 acceptance |
| Implement ingestion → canonical → calendar → export for the frozen config | Implementation agents | P0 | Underway (outside this docs pass; not verified here) | MAP_KEY for gap checks; AOI polygon |
| Confirm official 2026 hackathon/submission dates from `https://www.spaceappschallenge.org/2026/` | Team (human) | P0 | Pending — could not be verified from this environment | Normal internet connection (this environment returned a certificate error for that host) |

## Known risks / open questions

- Product choice done (proposed): MODIS C6.1 standard + VIIRS S-NPP/NOAA-20 375 m standard; NOAA-21 needs the key-dependent route.
- AOI geometry: box proxy verified, final polygon not yet committed.
- Per-day source presence inside the 2024–2025 window is not yet enumerated (needs the MAP_KEY). Empty days must stay labeled "no source records returned; observation coverage unknown".
- Standard-processing (`*_SP`) Earthdata short names are not yet verified; resolve from live pages before they enter a manifest.
- Whether the no-key country files agree field-for-field with Area-API `*_SP` output is not yet verified (needs the key).
- Official hackathon dates (Nov 14–15, 2026 per `ROADMAP.md`) could not be verified from this environment; do not plan the submission around them until a human reads the official page.

## Latest verification results

| Date | Command/check | Result | Environment / snapshot |
|---|---|---|---|
| 2026-11-06 | Live FIRMS page checks (active_fire, map, download, api, api/area, api/data_availability, api/missing_data, api/map_key, Earthdata product + attribute pages, FIRMS FAQ) — full sourced table in `docs/NASA_SOURCE_VERIFICATION.md` | Verified: 9 API source codes (`MODIS_NRT/SP`, `VIIRS_SNPP_NRT/SP`, `VIIRS_NOAA20_NRT/SP`, `VIIRS_NOAA21_NRT/SP`, `LANDSAT_NRT`); Area API `DAY_RANGE` 1–5, bbox-only, MAP_KEY required (free, email, 5000/10 min); Archive Download needs Earthdata or email login, not a key; standard replaces NRT with ≈ 5-month lag; map ceilings 2026-07-31 (VIIRS SP) / 2026-08-31 (MODIS SP); FRP in MW, confidence MODIS 0–100 vs VIIRS l/n/h, WGS84 | Live pages, `firms.modaps.eosdis.nasa.gov` + `earthdata.nasa.gov`, checked 2026-11-06 |
| 2026-11-06 | Direct no-key downloads of real FIRMS country yearly CSVs + SHA-256 / row / box counts | `modis_2025_Bangladesh.csv` 2,247 rows (sha256 `4273d4c3…20f5cb`); `viirs-snpp_2025_Bangladesh.csv` 9,000 rows (`f31bd4ce…93e96`); `viirs-jpss1_2025_Bangladesh.csv` 8,550 rows (`889a2e2e…8a141`); `viirs-snpp_2024_Bangladesh.csv` 8,083 rows (`529d46bc…d447ddc6`). Sundarbans approx box: 1/1/0 rows; Chittagong-adjacent coastal box: 1,985/6,835/6,350 | Live `https://firms.modaps.eosdis.nasa.gov/data/country/…`, 2026-11-06 |
| 2026-11-06 | Key-dependence probes | Invalid key → HTTP 400 `Invalid MAP_KEY.` (area) / HTTP 401 `Invalid MAP_KEY.` (data_availability). FIRMS news feed (`/api/articles/`) lists 6 items incl. maintenance 2026-06-15/16, 2026-05-04/05, 2025-09-08–10, 2025-04-28–30 | This environment; no `NASA_FIRMS_MAP_KEY` present |
| 2026-11-06 | Root vs `Info/` comparison | Root mirrors `Info/` (docs identical at time of check); `backend/`, `frontend/`, `data/`, `scripts/`, `infrastructure/` scaffold dirs present at root; `.env.example` already carries the `NASA_FIRMS_MAP_KEY` placeholder with the public registration URL | `W:/Pipeline/Nasa Space App Challenge/` |
| 2026-11-06 | NASA Space Apps 2026 official dates | **Not verified** (certificate error fetching `spaceappschallenge.org/2026/`; conflicting unverified search claims). `ROADMAP.md` left unchanged | This environment |

## Next three actions

1. Accept or amend ADR-008 → ADR-011; commit the AOI polygon (GeoJSON) with boundary source.
2. Register the free MAP_KEY (human, ~2 minutes) and run the `/api/data_availability/` + `/api/missing_data/` gap check over the frozen window; store the key in `.env` only.
3. Implement the ingestion → canonical → monthly-calendar → export slice for the frozen config (2024-01-01 → 2025-12-31, standard products), keeping every empty period labeled "no source records returned; observation coverage unknown". Update this status only with verified evidence from the implementation agents.
4. (Parallel, human) Confirm the official 2026 hackathon/submission dates on a normal connection; correct `ROADMAP.md` if the Nov 14–15 dates are wrong.

## Change log

- 2026-11-06 (fix pass): clipped VIIRS file to frozen window 2024-01-01..2025-12-31 (dropped 32 rows dated 2026-01-01..04, new sha256 `f5dd301e...`); re-ran `scripts/ingest.py --manual` + `scripts/load_demo_data.py` → snapshots MODIS_SP 76 / VIIRS_SNPP_SP 1,977, total 2,053 canonical observations; pytest 38/38 from `backend/`; frontend `npm run build` ✓; backend `/api/v1/health` ok on :8000, frontend on :5173.

- 2026-11-06: Recorded the Info-pack promotion to project root (root mirrors `Info/`, `Info/` kept as reference); set milestone to M0/M1 underway via subagents; added the live FIRMS verification results (product register, acquisition routes, Sundarbans-vs-coastal row evidence); proposed ADR-008 → ADR-011; flagged that hackathon dates (Nov 14–15, 2026 in `ROADMAP.md`) could not be verified from this environment and left `ROADMAP.md` unchanged. No application capability is asserted as implemented by this entry.
- 2026-11-05: Set the prototype data cap to 24 months and recorded that the Info directory was documentation-only; application state unverified.
