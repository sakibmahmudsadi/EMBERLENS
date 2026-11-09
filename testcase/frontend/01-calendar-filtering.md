# Frontend manual checks — calendar and observation filters

## FE-MC-001 — Active calendar series survives sensor filtering

- **Priority:** P1 · **Type:** Functional / regression
- **Setup:** Open the national demo with both MODIS and VIIRS calendar series available.
- **Steps:**
  1. Select the `MODIS · Terra · MODIS_SP` calendar tab.
  2. In the map's sensor filter, enable VIIRS while MODIS is not selected.
  3. Wait for the filtered data to load.
- **Expected:** The calendar selects the available VIIRS series and shows its month grid. It must not display “Select a sensor series” or a blank calendar.
- **BrowserOS result (2026-11-07):** PASS on the isolated real-data container at `127.0.0.1:18002`; the VIIRS tab was selected and `Calendar for VIIRS Suomi-NPP` remained present.

## FE-MC-002 — Calendar explanation and empty-cell selection state

- **Priority:** P2 · **Type:** Usability / accessibility
- **Steps:** Open the calendar without selecting a month; expand “How to read this calendar”; then inspect the future empty month cells.
- **Expected:** The short explanation uses plain language, technical method/count-unit metadata is available in the disclosure, and empty cells are not announced as selected.
- **BrowserOS result (2026-11-07):** PASS on the isolated real-data container.

## FE-MC-003 — Downloaded CSV keeps its metadata manifest

- **Priority:** P1 · **Type:** Research & reuse / export integrity
- **Setup:** Select VIIRS and the date window `2020-01-01` through `2020-01-31`.
- **Steps:** Generate an observation CSV and download it from the export panel.
- **Expected:** The CSV download is a rectangular data file with no metadata-comment row. The panel offers a separate `.metadata.json` download. Manifest row count, date range, sensor/product filters, and contributing snapshots match the CSV rows.
- **BrowserOS result (2026-11-08):** PASS on the isolated real-data container; downloaded the clean CSV and separate JSON sidecar, parsed 893 VIIRS rows, and verified sidecar row count, selected date range, VIIRS filters, and single `VIIRS_SNPP_SP` source snapshot.

## FE-MC-004 — Fresh Vite server renders the demo against the full API

- **Priority:** P0 · **Type:** Runtime / smoke
- **Steps:** Start a clean Vite process with the installed project dependencies and the demo API as its `/api` proxy; open the page in BrowserOS.
- **Expected:** React mounts, the API badge becomes healthy, national observations and calendar render, and map-density is served successfully.
- **BrowserOS result (2026-11-07):** PASS at `http://127.0.0.1:5174/` against the isolated full-data API on port 18002; page rendered 668,483 in-AOI observations. The older pre-dependency-update Vite process on port 5173 still renders a blank root and must be restarted.

## FE-MC-005 — Historical count context is prior-only and gap-aware

- **Priority:** P1 · **Type:** Scientific interpretation / evidence
- **Steps:** With the full 2010–2026 window, select March 2020 in MODIS Aqua; then select VIIRS July 2022, MODIS Aqua August 2014, and MODIS Aqua January 2010.
- **Expected:** March 2020 is compared only with eligible earlier March bins, with years, sample size, median, IQR, and source snapshot shown. A month with a known FIRMS-reported source gap is withheld from above/within/below interpretation. No-record months state that observation coverage is unknown, and target months with fewer than five prior samples state that the comparison is insufficient. Copy states the view is descriptive returned-count context, not an anomaly, expected activity, or risk signal.
- **BrowserOS result (2026-11-07):** PASS on the isolated real-data API. March 2020 reported 5,995 records vs prior 2010–2019 sample n=10, median 5,083, IQR 4,097–5,308; VIIRS July 2022 was withheld for a source gap; MODIS August 2014 was withheld for no returned records; MODIS January 2010 reported zero eligible prior years.

## FE-MC-006 — Detail panels do not create page-wide horizontal overflow

- **Priority:** P1 · **Type:** Responsive usability
- **Steps:** Generate an export so its metadata manifest is visible; check page width and scroll position at a 1,250 px desktop viewport, then repeat at a phone-width viewport. Calendar and seasonality may scroll inside their own panels.
- **Expected:** Export, coverage, and observation panels stay within the content column. Any wide data is scrollable within its own panel; the document itself does not gain horizontal scrolling.
- **BrowserOS result (2026-11-08):** Desktop PASS at 1,258 px viewport; document width 1,243 px, detail grid 1,118 px, export panel 374 px. Phone-width result not yet verified.

## FE-MC-007 — Reference country outline is distinct from the query bbox

- **Priority:** P1 · **Type:** Map interpretation
- **Steps:** Open the national map and compare the solid country reference outline with the dashed bounding-box outline and map legend.
- **Expected:** Legend distinguishes the “geoBoundaries 2015” reference outline from the “Query bbox” and links to outline metadata; observations outside the reference border but inside the bbox remain visibly part of the query extent. The reference outline does not imply that counts or exports were clipped to it.
- **BrowserOS result (2026-11-08):** PASS on the rebuilt isolated QA container; the linked “geoBoundaries 2015” and “Query bbox” legend items fit on one line, the bbox AOI label remained explicit, and the existing 668,483 in-AOI count was unchanged.

## FE-MC-008 — Annual map playback uses one year at a time

- **Priority:** P1 · **Type:** Historical exploration
- **Steps:** Select a year with Next year or the slider; play and pause the history; reset to All dates. Repeat with a sensor filter active.
- **Expected:** Each map update requests only the selected year inside the applied date window and keeps the selected sensor/product/quality filters. Feed markers follow the map year. Pause prevents later-year requests. All dates restores the full-window map and count. An empty annual result states that coverage is unknown.
- **BrowserOS result (2026-11-08):** PASS on the rebuilt isolated QA container. MODIS 2011 requested only `2011-01-01`–`2012-01-01` and returned 8,717 mapped records. With VIIRS selected, the same bounded request retained `sensors=VIIRS`, returned no map cells, and showed “observation coverage unknown.” Playback advanced, pause prevented a 2013 request, and All dates restored the full-window count for the active sensor filter.

## FE-MC-009 — Hotspot-group exports are reusable and traceable

- **Priority:** P1 · **Type:** Research reuse / provenance
- **Steps:** Query a 7-day period with VIIRS selected. Download JSON, CSV, and GeoJSON. Inspect each file's metadata and group rows.
- **Expected:** Metadata contains AOI, exact UTC period with inclusive/exclusive end semantics, selected filters, method ID/status and parameters, matched-observation and group counts, all contributing source snapshot IDs, source attribution, and limitations. Each group retains its observation and snapshot IDs. GeoJSON coordinates are WGS 84 centroids and are explicitly not fire perimeters.
- **BrowserOS result (2026-11-08):** PASS for JSON, CSV, and GeoJSON against the rebuilt isolated QA app for 2026-06-01–2026-06-07; all carry 18 matched observations, 2 groups, VIIRS filter, source snapshot ID, grouping method, NASA FIRMS attribution, and limitations. GeoJSON parsed as a two-feature FeatureCollection with its WGS 84 centroid note.

## FE-MC-010 — Hotspot grouping exposes distance sensitivity

- **Priority:** P1 · **Type:** Experimental analysis usability
- **Steps:** Query the same AOI/date/sensor/max-gap parameters twice, once with a 500 m distance override and once with a 10,000 m override. Repeat with the distance field empty to use the sensor default.
- **Expected:** Each result shows the requested distance (or sensor default), keeps the same matched-observation count when only distance changes, and may produce different group counts. The export manifest records the selected distance. The UI continues to label grouping experimental and does not describe groups as confirmed incidents.
- **BrowserOS result (2026-11-08):** PASS on the bundled local QA app for June 1–7, 2026, VIIRS and 24-hour max gap: 18 matched observations returned 2 groups at 500 m and 3 groups at 10,000 m; the UI displayed each distance and retained the experimental status. The 1,258 px desktop screenshot showed the added control row fits without pushing the page wider than the viewport.

## FE-MC-011 — Select a map-view area and reuse it across analysis

- **Priority:** P1 · **Type:** Area selection / query scope
- **Steps:** Zoom or pan the national map to a subregion. Choose “Use map view as area”; check the selected-area outline, observation count, calendar, groups, and export scope. Choose “Full Bangladesh” to reset.
- **Expected:** All spatial results use the same selected bounds clipped to the configured national query box; API/export metadata records requested and effective bounds. Source availability remains global and is labeled as such. Reset restores national results.
- **BrowserOS result:** Pending verification on the rebuilt local QA app.
