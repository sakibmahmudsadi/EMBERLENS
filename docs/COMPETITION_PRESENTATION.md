# EMBERLENS — Competition Presentation

Presenter script and judge Q&A. All numbers below were verified against the live national database (668,485 observations) and the running app during Step 7. Do not add new numbers without re-checking them.

**Scope footer (say this once, up front):** “The snapshot ends 2026-07-31 and is historical. It is not a live alert or prediction service. The AOI is a task-specified bounding box, not an official boundary; it over-includes border-adjacent territory. Counts are source observation records, not confirmed fires.”

## A. 30-second pitch

MODIS and VIIRS both detect active fires from space, but they do it differently — different resolutions, algorithms, and confidence meanings — so you cannot just add their counts together. **EMBERLENS** takes NASA FIRMS Standard Product records for Bangladesh (668,485 source observations, 2010-01-01 to 2026-07-31) and organizes them into a map, a horizontal monthly burning-activity calendar that keeps every sensor separate, and an export that carries its provenance with it. **Where, when, what changed, and why it matters** — with the limits labelled, not hidden.

## B. 90-second pitch

FIRMS gives you thermal-anomaly observations, not wildfire incidents. A dark FIRMS map doesn’t tell you whether a bright March is more burning, a finer sensor, or a clearer sky. EMBERLENS fixes the interpretation layer without fusing the sensors: the same calendar cells, time zone, AOI, and count unit (`source_observation_rows_after_exact_deduplication_within_product_snapshot`) for every series, but MODIS Terra, MODIS Aqua, and VIIRS Suomi-NPP each keep their own row, their own confidence semantics — MODIS numeric 0–100, VIIRS low/nominal/high — and their own provenance (snapshot ID, fingerprint, method version). Empty months say “No source records returned; observation coverage unknown,” never “zero fires.” The seasonal bars are descriptive (median/IQR over prior same-month records, valid-pixel opportunity unknown) — not an anomaly score or forecast. Every export ships with the AOI, UTC interval, filters, snapshot IDs, method version, and NASA attribution, so another team can reproduce the number from the source file. 668,485 rows, Standard Products only, no NRT, no invented fills.

## C. 3-minute demonstration script

**0:00 — Open on the map (30 s).** Launch `.\start_emberlens.ps1`; open `http://127.0.0.1:5173`. “This is the Bangladesh national query bbox (W 88.0, S 20.5, E 92.7, N 26.7, EPSG:4326), not the official boundary — the dashed line is the query box, the solid outline is the geoBoundaries 2015 reference, and the legend says so. Orange cells are aggregated grid cells (max series) — not individual fires, and not perimeters.” Point to the AOI pill and the `API OK` status.

**0:30 — Scroll to the calendar (30 s).** “The map is the entry point; the calendar is the product. 199 monthly bins, months left-to-right, one row per series.” Click the **MODIS Aqua** tab. “MODIS Aqua, MODIS_SP, March 2020: **5,995** source observation records. MODIS Terra in the same month is a separate series — **661**.” Scroll through March/April peaks. Read the “How to read this calendar” disclosure.

**1:00 — Month drilldown (30 s).** Click **Mar 2020** on the MODIS Aqua tab, then “Inspect source observations for this month.” The feed shows the month’s source rows. “This row is 2020-03-01 07:32 UTC, 21.048°N 92.338°E, MODIS Aqua, confidence **35** — numeric, source-native, 0–100. FRP is 13.7 MW native units. It is a thermal-anomaly detection at a nominal pixel centre — not a confirmed wildfire.”

**1:30 — Switch to VIIRS (40 s).** Change the sensor filter to **VIIRS** (or the VIIRS tab). “Same March 2020, completely different series: VIIRS Suomi-NPP, **22,008** records. The gap is resolution and algorithm — 375 metres versus ~1 kilometre — not proof of more fire. That’s why we never sum them.” Point to a VIIRS row: “Confidence **n** — nominal. Categorical, not a number you can average with MODIS 35.” Scroll to 2012 and to 2010: “Before 2012-01-20 these months say *No source records returned; observation coverage unknown.* We do not draw a zero.”

**2:10 — Provenance and export (40 s).** “Every number links back through snapshot ID and fingerprint to the raw NASA file.” In the Export panel (now following the inspected month): pick **Observations + CSV**, Generate, then **Download CSV** and show the `.metadata.json` sidecar: dataset, filters, date range, snapshot IDs, method version, NASA attribution, limitations. “JSON and GeoJSON carry the same manifest embedded; calendar exports are CSV/JSON only — GeoJSON for bins is correctly rejected because bins have no coordinates.”

**2:50 — Close on the caveat (10 s).** “No sensor fusion, no perimeters, no forecast, no clear-sky proof — and the footer says so. Historical, Standard Products only, verified.”

## D. Technical differentiation

- **Not a FIRMS map clone:** FIRMS gives you detections; EMBERLENS gives you a *place-oriented, time-aware organizing layer* — month bins with an explicit count unit, spatial rule, and coverage status; provenance on every cell, row, and export.
- **Sensor-aware by construction:** Modality is a stratification dimension in the DB, API, calendar, and export schema. Terra and Aqua are expanded from the combined `MODIS_SP` file into native series without inventing a third combined series. Confidence semantics are preserved end-to-end (numeric vs categorical, never equated); FRP/brightness keep native units and null-vs-zero handling.
- **Coverage honesty is data-modeled:** `coverage_status` (`records_present`, `no_records_returned_coverage_unverified`, `partial_source_data`, …) plus 120 `data_availability` rows (2 broad intervals + 118 FIRMS missing-day records) drive the amber `partial_source_data` flagging. No rule upgrades an empty month to a verified zero.
- **Reproducibility:** Immutable raw CSVs + SHA-256 manifests (`5a1fd42b…`, `460a271e…`), deterministic fingerprints, versioned calibration (`canonical-v1`, `calendar-v0`), read-only calendar GET, and a manifest on every export. Re-running the same manifest + method version reproduces the calendar.
- **Experimental extensions stay labeled:** Hotspot groups explicitly declare centroid-not-perimeter semantics for `GeoJSON` and single-value method disclosure for CSV/JSON.

## E. Scientific limitations

1. **Thermal anomalies, not wildfires.** A detection is a pixel-centre thermal anomaly; agricultural burning, prescribed burns, gas flares, industrial heat, and volcanoes can appear, and cloud/smoke/canopy/overpass timing can hide real fire.
2. **No sensor equivalence.** MODIS (~1 km, numeric 0–100 confidence) and VIIRS (375 m, categorical low/nominal/high) differ in spatial resolution, algorithm, and overpass schedule. Counts are never summed; March 2020’s 5,995 vs 22,008 must not be read as “VIIRS proves ~4× more fire.”
3. **No valid-pixel / clear-sky proof.** FIRMS availability and missing-day records are global source-service dates; they do not show that the AOI was observable. Empty bins stay “No source records returned; observation coverage unknown.”
4. **Bbox ≠ boundary.** `bangladesh-bd` (88.0,20.5→92.7,26.7) over-includes adjacent India/Myanmar; the geoBoundaries outline is display-only and does not clip counts/exports (2 VIIRS rows outside the bbox are excluded from polygon-clipped counts).
5. **No validated anomaly/forecast.** Seasonal median/IQR is descriptive (earlier same-month records, gap months excluded, n≥5 required, valid-pixel opportunity unknown). Hotspot groups are experimental centroid clusters, parameter-sensitive, not perimeters or incidents.
6. **Historical snapshot only.** Window ends 2026-07-31 (VIIRS ceiling); MODIS-only Aug 2026 is excluded rather than mixed with NRT. Standard Products only; Suomi-NPP delivery ceased 2026-11-02, so post-window continuation would need a fresh scope decision.

## F. Likely judge questions

**Why not simply combine MODIS and VIIRS counts?** Because the two sensors observe the same place with different pixel sizes (1 km vs 375 m), algorithms, overpass schedules, and confidence meanings. Adding them double-counts the same event at different resolutions and pretends a `35` (MODIS numeric) equals an `n` (VIIRS nominal). EMBERLENS keeps them as separate series with a shared time/AOI frame and never emits a fused total.

**What does confidence mean for each sensor?** MODIS confidence is a numeric 0–100 score from the contextual algorithm (0/low, ~100/high); VIIRS confidence is categorical — low, nominal, high — from intermediate algorithm quantities (sun-glint, temperature-anomaly thresholds). The API preserves `confidence_raw` plus `confidence_semantics` (`numeric_score_0_100_source_native` vs `categorical_class_source_native`) and the UI never maps one to the other.

**Does an active-fire detection prove a wildfire occurred?** No. It proves a thermal anomaly was flagged in that pixel at that acquisition time. The observation detail panel says: “A hotspot is a thermal-anomaly detection, not a confirmed wildfire. Coordinates are nominal pixel centres.” We never label a record an incident, emergency, or perimeter.

**How do you handle missing source data?** Three levels: (a) no records returned → `no_records_returned_coverage_unverified`, hatched cell, “do not read as verified zero”; (b) a month containing a FIRMS missing-day record → `partial_source_data` (amber outline, e.g. Apr 2022 MODIS, Jul–Aug 2022 VIIRS); (c) broad availability intervals are shown as source-service ceilings, explicitly not observation opportunity. The coverage endpoint returns both intervals and missing days with the same disclaimer.

**Is the Bangladesh boundary authoritative?** No. The AOI is a task-specified bounding box (`bangladesh-bd`, W 88.0 S 20.5 E 92.7 N 26.7, EPSG:4326), labelled in the UI as including “small out-of-country overhang.” The geoBoundaries 2015 outline is a display-only reference that does not clip observations or exports.

**Are hotspot groups actual fire perimeters?** No. Groups are experimental algorithmic clusters: “Area: full national query box. Nearby detections are grouped by sensor, platform, and product. These experimental groups are not confirmed fires or perimeters.” GeoJSON points are labelled “group centroids, not fire perimeters” (WGS 84), and results are parameter-sensitive by design (distance override changes 2 → 3 groups on the same 18 VIIRS detections).

**How reproducible are exported results?** Every export embeds (or sidecars) `metadata_manifest` with project, dataset type, AOI geometry + bounds, UTC interval (exclusive end), all filters (sensors/platforms/products/quality/area), snapshot IDs, method version, NASA attribution, and limitations. The national DB is built deterministically from the two raw CSVs (SHA-256 `5a1fd42b…` / `460a271e…`) via `load_national_data.py`; the same manifest + method version reproduces the same calendar.

**How current is the dataset?** Frozen at 2026-07-31 (the VIIRS common ceiling). MODIS alone extends to 2026-08-31 but that month is deliberately excluded rather than backfilled with NRT. Suomi-NPP delivery ceased 2026-11-02, so the snapshot is historical and not a live feed.

**What is the actual harmonization contribution?** A preserved-semantics conversion: source-preserving canonical schema, stratified aggregation on a common UTC-month / AOI lattice, explicit count unit and coverage statuses, and joint provenance/exports — *without* claiming physical equivalence of the underlying measurements. Harmonization here means comparable framing, not comparable fire amounts.

## Demo data quick reference (verified 2026-11-09)

| Example | What to show | Verified value |
|---|---|---|
| MODIS March 2020 (Aqua) | Calendar cell + drilldown row | **5,995** records; first row 2020-03-01 07:32 UTC, 21.0483°N 92.3382°E, confidence `35` (numeric), FRP 13.7 MW |
| VIIRS March 2020 (Suomi-NPP) | Same month, separate series | **22,008** records; first row 2020-03-01 06:30 UTC, 20.6432°N 92.5004°E, confidence `n` (nominal, categorical) |
| MODIS Terra March 2020 | Platform split within MODIS_SP | **661** records (663 in DB raw; 3 outside AOI bbox) |
| VIIRS pre-2012 | Empty-state label | Jan 2010–Dec 2011: `0 observations, No source records returned; observation coverage unknown` |
| Export (recommended live) | Observations CSV + `.metadata.json` sidecar | Mar 2020 MODIS Aqua week-level export was **67 rows** for speed; full-month 5,995 rows via API calendar total matches |

All counts are source observation records inside the AOI polygon (in-AOI calendar totals: MODIS 147,536; VIIRS 520,947; total 668,483 in-bbox vs 668,485 in DB).
