# Architecture and Method Decision Log

Record material decisions here. Do not rewrite history silently; mark superseded decisions and add a new record.

## Decision template

```markdown
### ADR-NNN — Short decision title
- Status: proposed | accepted | rejected | superseded
- Date: YYYY-MM-DD
- Owners: team/member(s)
- Context: problem and constraints
- Options: realistic alternatives considered
- Decision: selected option
- Rationale: why it is best for current evidence
- Consequences: trade-offs and follow-up work
- Validation: how the decision will be tested
- References: source docs/data/issues
```

## Initial proposed decisions

### ADR-001 — Use CLAUDE.md as the Claude Code project instruction entry point
- **Status:** accepted for this starter pack
- **Context:** The team uses Claude Code with Kimi K3 through an Anthropic-compatible API.
- **Decision:** Maintain one root `CLAUDE.md` for Claude Code project instructions. Keep detailed specs in `docs/`. Do not duplicate the same instructions in `AGENTS.md` unless a second coding agent is actually adopted and needs its own integration entry point.
- **Rationale:** One authoritative source reduces conflicting instructions and fits Claude Code's project-memory convention.
- **Consequences:** Keep `CLAUDE.md` concise, stable, and focused on execution rules; update detailed product/method specs in their dedicated files.

### ADR-002 — Use a modular monolith as the initial application architecture
- **Status:** proposed
- **Context:** Small team, competition timeline, data pipeline + API + frontend.
- **Decision:** Begin with clear modules in one backend application rather than microservices.
- **Rationale:** Fewer deployment and operational failure modes while preserving boundaries.
- **Consequences:** Revisit only when actual scale/team separation makes it necessary.
- **Validation:** Measure runtime, code coupling, and deployment friction as the prototype grows.

### ADR-003 — Preserve raw observations and sensor-specific semantics
- **Status:** accepted as a scientific invariant
- **Context:** MODIS and VIIRS products are not directly interchangeable.
- **Decision:** Keep immutable source snapshots and a source-preserving canonical schema. Use sensor-stratified outputs by default.
- **Rationale:** Prevents irreversible loss of product semantics and supports independent review.
- **Consequences:** A single fused indicator requires a separate, validated method and version.

### ADR-004 — Treat the burning-activity calendar as the P0 product
- **Status:** accepted
- **Context:** The challenge specifically asks for a burning-activity calendar harmonizing MODIS and VIIRS hotspots.
- **Decision:** Complete a reproducible source-to-calendar path before optional intelligence or UI embellishments.
- **Rationale:** Direct alignment with the challenge and measurable end-to-end evidence.

### ADR-005 — Proposed default data stack
- **Status:** proposed; subject to repository audit
- **Decision:** Python/FastAPI, PostgreSQL/PostGIS, immutable raw files and derived Parquet, React/TypeScript/Vite, MapLibre GL JS.
- **Rationale:** Cohesive geospatial/data ecosystem with modest operational complexity.
- **Validation:** Audit existing repository and profile real data before locking dependencies.

### ADR-006 — Cap the competition prototype at 24 months
- **Status:** accepted
- **Date:** 2026-11-05
- **Context:** The team is demonstrating a prototype on a short competition timeline; processing each sensor's full archive is unnecessary for proving the workflow.
- **Decision:** Use one AOI and a fixed window of at most 24 months. Prefer the latest common source-available window for the selected products at retrieval time. If their overlap is shorter than 24 months, use that shorter period. Record known source-service gaps; this does not establish complete sensor observation coverage. Freeze exact dates and source snapshots in the manifest; do not mix NRT and standard data merely to extend the window.
- **Rationale:** A small, reproducible slice proves ingestion, sensor-aware normalization, calendar aggregation, provenance, and export without turning the demo into a full archive project.
- **Consequences:** The demo must not claim multi-decade history or a robust climatology from this window. Baselines, anomaly flags, and outlooks remain deferred unless supported by additional reference data and validation.
- **Validation:** Check the selected products' live date availability and archive metadata; verify that every requested date is within the fixed window and that the same snapshot reproduces the calendar.

### ADR-007 — Use a monthly source-row calendar for the prototype
- **Status:** accepted
- **Date:** 2026-11-05
- **Context:** A calendar needs an explicit unit, time boundary, and spatial inclusion rule; these should be small, reproducible choices for the bounded demo.
- **Decision:** Count source observation rows after exact duplicate removal within the same product/snapshot. Keep counts separate by sensor/platform/product. Use UTC calendar months and a point-in-polygon AOI rule that includes points on the boundary. Apply no confidence filter by default; preserve native confidence values.
- **Rationale:** These definitions make the output reproducible and inspectable while avoiding an unsupported cross-sensor equivalence claim.
- **Consequences:** The calendar counts reported detection rows, not individual fires, events, burned area, or complete observation opportunities.
- **Validation:** Use a small hand-checkable fixture to verify month boundaries, AOI edges, exact duplicate handling, and per-product partitioning.

### ADR-008 — Demo AOI: Chittagong-adjacent coastal region, not the Sundarbans (proposed)
- **Status:** proposed (2026-11-06, based on live FIRMS source verification)
- **Context:** PRD §4 and DATA_PIPELINE §8 name the Sundarbans as the potentially-best demo AOI, conditional on the selected products covering it. Live verification downloaded real FIRMS yearly CSVs for Bangladesh (no key, no login) and counted records inside the Sundarbans approximation box (88.5–89.5 °E, 21.5–22.5 °N): 2025 MODIS 1 row, VIIRS S-NPP 1 row, VIIRS NOAA-20 0 rows — against Bangladesh-wide totals of 2,247 / 9,000 / 8,550. The same files contain 1,985 / 6,835 / 6,350 rows in a Chittagong-adjacent coastal box (91.7–92.7 °E, 21.4–24.0 °N), with a strong March–April seasonality. See `docs/NASA_SOURCE_VERIFICATION.md` §7.
- **Options considered:** (a) Keep the Sundarbans and ship a calendar that is ~98% "no source records returned" (rejected: it demonstrates the pipeline file-paths exist but shows no analytical signal); (b) Use a Chittagong-adjacent coastal AOI (selected for proposal: real data density, MODIS/VIIRS overlap, seasonality); (c) Use the whole of Bangladesh as the AOI (rejected: hides the regional story and inflates the demo subset; also slower to render).
- **Decision (proposed):** Demo AOI = the Chittagong-adjacent coastal cluster. Initial executable proxy is the bounding box 91.7, 21.4, 92.7, 24.0 (W,S,E,N); at implementation the team must commit a versioned polygon (GeoJSON) with a recorded boundary source/derivation, and the final row counts must be recomputed for that polygon before any calendar is published.
- **Rationale:** A demo must show a real, sensor-separated monthly signal; the Sundarbans does not provide one in FIRMS for 2024–2025. The product contract requires the AOI to be chosen on actual data coverage and useful activity, not aesthetics.
- **Consequences:** News narratives about Sundarbans fires no longer justify the AOI choice; do not claim the demo represents "the Sundarbans". The March–April seasonality in the coastal box is descriptive of returned source records only and must be labeled as such. Changing to a polygon will change the counts; the diagnostic box counts in `NASA_SOURCE_VERIFICATION.md` §7 must not be presented as final AOI results.
- **What would change this decision:** (i) A key-holding Area-API retrieval showing materially more records inside a Sundarbans polygon than these country-file checks found (the country files are a whole-country superset, so this is unlikely but must be confirmed on the final polygon); (ii) the team choosing a different Bangladesh cluster with denser records after the AOI geometry is committed.
- **Validation:** Recompute per-product, per-month counts for the committed polygon; confirm MODIS and both VIIRS platforms each have records in the window; run `/api/data_availability/` for the window once a MAP_KEY exists.
- **References:** `docs/NASA_SOURCE_VERIFICATION.md` §§1–7 (checked 2026-11-06).

### ADR-009 — Product set and 24-month window: standard products only, 2024-01-01 → 2025-12-31 (proposed)
- **Status:** proposed (2026-11-06, based on live FIRMS source verification)
- **Context:** PRD §4/§12 and DATA_PIPELINE §2 require the latest common source-available window of at most 24 months for selected products, without mixing NRT and standard data. FIRMS serves standard data with an ≈ 5-month replacement lag behind NRT, so "latest" must be defined against the standard record, not the NRT record (see `NASA_SOURCE_VERIFICATION.md` §§1–3).
- **Options considered:** (a) Latest-to-present NRT window (rejected: mixes processing levels and is provisional/replaced); (b) Latest common *standard* window via the Area API `*_SP` sources ending at the map ceiling 2026-07-31 (viable, but **[KEY-REQUIRED]** and needs ≈ 73 five-day requests per product); (c) Latest common standard window via the no-key country yearly summaries, 2024-01-01 → 2025-12-31 (selected for proposal: observed working end-to-end in this environment).
- **Decision (proposed):** Product set = MODIS Collection 6.1 standard (`MCD14DL`, observed `version` 61.03), VIIRS S-NPP 375 m standard (observed `version` 2, `satellite` `N`), VIIRS NOAA-20 375 m standard (observed `version` 2, `satellite` `N20`). Window = **2024-01-01 → 2025-12-31** (24 months, both calendar years fully published 2026-10-10). NOAA-21 is excluded because no country yearly summaries exist for it and adding it would force the key-dependent route. No `*_NRT` source may be used to extend either end of the window.
- **Rationale:** Zero processing-level mixing, reproducible no-key retrieval, and the two most recent complete standard years.
- **Consequences:** The demo window ends at 2025-12-31 even though FIRMS standard map layers reach 2026-07-31/08-31; the gap is a deliberate, documented consequence of the no-key route (see ADR-010). Any move to the 2024-08-01 → 2026-07-31 window requires a fresh manifest and must not be blended with this window.
- **What would change this decision:** Obtaining a MAP_KEY and deciding to pay the Area-API cost for the newer window; or a team requirement for NOAA-21.
- **Validation:** Freeze per-file SHA-256/row counts in the manifest; confirm the `version` column stays NRT-free in every ingested file (reject `6.1NRT`-suffixed values).
- **References:** `docs/NASA_SOURCE_VERIFICATION.md` §§1–5 (checked 2026-11-06).

### ADR-010 — Acquisition path: no-key country summaries by default, Area API as the key-dependent upgrade (proposed)
- **Status:** proposed (2026-11-06, based on live FIRMS source verification)
- **Context:** Three FIRMS routes exist. Route A (Area API) needs a free MAP_KEY (register by email at `https://firms.modaps.eosdis.nasa.gov/api/map_key/`), is limited to 1–5 days per request, and takes a bounding box, not a polygon. Route B (Archive Download) needs an Earthdata login or an emailed 6-digit code, and emails download links. Route C (country yearly summaries at `https://firms.modaps.eosdis.nasa.gov/data/country/`) needs no key and no login and is whole-country only. In this environment there is no `NASA_FIRMS_MAP_KEY` and no Earthdata account, so only Route C has been observed working.
- **Options considered:** (a) Route A only (blocked: no key; also impractical for 24 months without the key); (b) Route B only (blocked: account/email workflow, not scriptable here); (c) Route C default + register a key for gap checks and the Route-A upgrade (selected).
- **Decision (proposed):** Build the pipeline on Route C (download whole-country standard CSVs, clip to the AOI polygon in EMBERLENS). Register a MAP_KEY as a separate, immediate human task so that `/api/data_availability/` and `/api/missing_data/` gap checks and the Route-A upgrade become available. **[KEY-REQUIRED]** for those checks. Keep the ingestion interface route-agnostic (a "snapshot" abstraction) so Route A can replace Route C's source without changing canonical/calendrical code.
- **Rationale:** Route C is the only route proven to work in this environment, costs nothing, and carries the standard record; the Area API's 5-day limit makes 24-month backfill ~73 requests per product, which is acceptable only as a deliberate upgrade, not as the critical path.
- **Consequences:** (i) Whole-country downloads must be clipped by EMBERLENS — the demo subset is produced by our code, not by FIRMS selection, so the clipping rule must be in the manifest; (ii) NOAA-21 is not available on this route (see ADR-009); (iii) a rolling "latest 24 months" claim is not possible on Route C (newest complete year per the index is 2025); (iv) until a key exists, per-day presence cannot be enumerated and empty days must be labeled "no source records returned; observation coverage unknown".
- **What would change this decision:** A working MAP_KEY and team preference for a 2025–2026 window or NOAA-21; or FIRMS publishing NOAA-21 country files.
- **Validation:** Cross-check a Route-C subset against a Route-A retrieval for the same box/dates once a key exists, and record whether they agree field-for-field.
- **References:** `docs/NASA_SOURCE_VERIFICATION.md` §§3–4 (checked 2026-11-06); key registration `https://firms.modaps.eosdis.nasa.gov/api/map_key/`; API `https://firms.modaps.eosdis.nasa.gov/api/` and `https://firms.modaps.eosdis.nasa.gov/api/area/`.

### ADR-011 — Rolling standard-window rule for future snapshots (proposed)
- **Status:** proposed (2026-11-06, based on live FIRMS source verification)
- **Context:** The standard record lags NRT by roughly 3–5 months and its map ceilings (2026-07-31 for all three VIIRS standard products, 2026-08-31 for MODIS standard) move as FIRMS publishes. A project rule is needed so future snapshots are taken the same way rather than by ad-hoc "today minus 24 months".
- **Decision (proposed):** Each snapshot takes the latest 24 months for which *all selected standard products* have published data (verified via `/api/data_availability/` **[KEY-REQUIRED]** or the yearly-summary index), never extending the end date with NRT data. If a product's standard record is incomplete for the final month, the window shortens end-consistently and the manifest records why.
- **Rationale:** Keeps the "latest common window" preference honest and prevents the NRT/standard step error.
- **Consequences:** Snapshot dates will differ between routes (country-year vs. Area-API ceilings); the manifest must name the route. On Route C, snapshots can only advance in whole published calendar years.
- **Validation:** Record the ceiling dates read at snapshot time (map `date_ranges` + yearly index) in the manifest; re-verify them at each re-snapshot.

## Pending decisions

- [ ] Accept ADR-008 (AOI), ADR-009 (products + window), ADR-010 (acquisition path), ADR-011 (rolling window rule) — all currently **proposed**.
- [ ] Exact AOI polygon geometry and its boundary source/version (ADR-008: box proxy only until a polygon is committed).
- [ ] Standard-processing Earthdata short names for the `*_SP` products — not verified yet; must be read from live pages before they enter any manifest.
- [ ] Whether Route-C country files agree field-for-field with Route-A `*_SP` output — **[KEY-REQUIRED]** (no key in this environment).
- [ ] Per-day product presence for the frozen window — **[KEY-REQUIRED]** (`/api/data_availability/`, `/api/missing_data/`).
- [ ] Official NASA Space Apps 2026 hackathon/submission dates — `ROADMAP.md` states Nov 14–15, 2026; this could not be verified from this environment (see `NASA_SOURCE_VERIFICATION.md` §8). Needs a human read of `https://www.spaceappschallenge.org/2026/`.
- [ ] Source-availability wording; an empty hotspot query is not a verified zero-detection interval.
- [ ] Database and storage choice based on the actual application repository and bounded data size.
- [ ] Cross-sensor comparison method; no fused count in the prototype without validation.
- [ ] Baseline/anomaly method only if expanded reference data and validation are added.
- [ ] Event-grouping method/thresholds, if pursued after the prototype.

(Note on the former pending items — exact products/versions, AOI/boundary, exact fixed dates — these now have proposed answers in ADR-008 → ADR-011 and `docs/NASA_SOURCE_VERIFICATION.md`; they are carried here as pending acceptance above, not as unresolved questions.)
