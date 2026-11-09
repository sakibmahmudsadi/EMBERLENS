# Demo Runbook

Competition presentation on a Windows laptop (desktop, 1366×768+). Native only: `.\start_emberlens.ps1` / `.\stop_emberlens.ps1`. No Docker in the live path (archived under `archive/future-cloud-deployment/docker/` for future cloud use). All examples below were browser-tested + API-verified on 2026-11-09.

## Pre-presentation checklist

- [ ] Close other apps using ports 8000/5173; confirm Windows is on power, Do Not Disturb off
- [ ] `.venv` and `node_modules/` present (first-time setup: `docs/LOCAL_DEVELOPMENT.md`) — no installs during the demo
- [ ] `backend/emberlens-bangladesh.duckdb` exists; manifests SHA-256 `5a1fd42b902c…` (MODIS) / `460a271eedb5…` (VIIRS)
- [ ] Fresh `.\start_emberlens.ps1` succeeds; health + frontend respond; one browser tab at `http://127.0.0.1:5173` ready
- [ ] Quick sanity pass (60 s): map loads (668,483 records), calendar shows Mar 2020 cells, one month click drills down, one export downloads
- [ ] Disclaimer on first slide: “Historical NASA FIRMS Standard snapshot 2010-01-01–2026-07-31 — not live monitoring. Bbox ≠ official boundary. Empty = no source records returned; coverage unknown.”

## Starting EMBERLENS

```powershell
.\start_emberlens.ps1
```

Expected:

```text
  Frontend:  http://127.0.0.1:5173
  Backend:   http://127.0.0.1:8000
  Health:    http://127.0.0.1:8000/api/v1/health
```

## Verifying backend and frontend

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
# {"status":"ok","service":"EMBERLENS", ...}
```

- Backend: `http://127.0.0.1:8000/api/v1/health` → `status: ok`
- Frontend: `http://127.0.0.1:5173` loads the map (Vite proxies `/api` → `8000`)

If the frontend shows “Backend unreachable,” check the backend URL before reloading — the UI never fabricates data.

## Step-by-step journey (3 minutes, verified examples)

### 1. Map (30 s)
Open `http://127.0.0.1:5173`. Point to: the dashed **Query bbox** (W 88.0 S 20.5 E 92.7 N 26.7) vs the solid **geoBoundaries 2015** reference outline (display-only). Legend: **Grid cells (max series)**, **Feed page**, outline, bbox. Caption reads “Bangladesh · 2010-01-01 — 2026-07-31 · 668,483 records.” Say: “Cells are aggregated counts per series — not individual fires, not perimeters. The bbox over-includes border territory and is labelled as such.”

### 2. MODIS calendar — March 2020 (30 s)
Sensor **MODIS** filter on (or MODIS Aqua tab). The **Mar 2020 MODIS Aqua** cell reads **5,995** “Records present.” (Terra same month, separate series: **661**.) March is peak season every year — do not call it an anomaly. Click the month; the feed narrows to March observations.

First drilldown row (verified): **2020-03-01 07:32 UTC, 21.0483°N 92.3382°E, MODIS · Aqua, confidence `35` (numeric, source-native 0–100), FRP 13.7 MW.** Say: “One thermal-anomaly detection at a nominal pixel centre — not a confirmed wildfire.”

### 3. VIIRS calendar — same month (30 s)
Switch to **VIIRS** (tab `VIIRS · Suomi-NPP · VIIRS_SNPP_SP`). **Mar 2020 VIIRS: 22,008** records, “Records present.” First VIIRS row (verified): **2020-03-01 06:30 UTC, 20.6432°N 92.5004°E, confidence `n` (nominal, categorical).** Say: “Same month, far denser series — 375 m versus ~1 km pixels and a different algorithm, not 4× more fire. That is why the counts stay in separate series and are never summed.”

Scroll to **Jan 2010–Dec 2011**: every month reads “0 observations, **No source records returned; observation coverage unknown**” (VIIRS starts 2012-01-20). Point to an amber month (any `Partial source data`, e.g. VIIRS Mar 2012): “A known FIRMS missing-day month — a source gap label, not proof of zero activity.”

### 4. Export a month (30 s)
With the March 2020 inspection active, the Export panel follows that month/series. Set **Observations + CSV** → **Generate export** → **Download CSV** + **Download metadata JSON**. Show the manifest: filters, 2020-03-01 → 2020-04-01 (exclusive end), snapshot IDs (`52dd286b…` MODIS / `3e769ca9…` VIIRS), method `calendar-v0`, NASA attribution, limitations. State the live-download note from the panel: “The CSV stays spreadsheet-ready; its manifest is the separate JSON.” (JSON/GeoJSON keep the manifest embedded; calendar GeoJSON is disabled in the UI with an explanatory note — GeoJSON for bins is correctly rejected because bins have no coordinates.)

Live-demo speed tip: for a small file during Q&A, narrow **FROM/TO** to `2020-03-01 → 2020-03-07` first (MODIS Aqua week = **67** rows, verified via `/api/v1/observations` total) instead of the full 5,995-row March.

### 5. Disclosures (15 s)
Scroll to the footer **“Scientific disclosures — read before interpreting.”** Read any three bullets. They contain the entire claim boundary: anomalies not incidents, sensor semantics (MODIS numeric, VIIRS categorical), unknown ≠ zero, no forecast.

## If something fails

1. **Backend died:** `.\stop_emberlens.ps1` then `.\start_emberlens.ps1`; check `.runtime/logs/backend.err.log`.
2. **Blank map but `API OK`:** hard-reload (Ctrl+Shift+R); if still blank, check browser console — the Vite client is stale.
3. **Wrong counts:** restart both processes (the API holds the DB lock and the current code; a stale process returns old numbers).
4. **Export error:** open the error inline; Calendar+GeoJSON now warns *before* generate — switch format.

## Safely stopping

```powershell
.\stop_emberlens.ps1
```

Stops only launcher-owned PIDs, removes `.runtime/*.pid.json`, keeps logs. DB, manifests, and downloads are never touched. Safe when already stopped.

## Expected visible results (tested 2026-11-09)

- MODIS Aqua Mar 2020: **5,995**; MODIS Terra Mar 2020: **661**; VIIRS Suomi-NPP Mar 2020: **22,008** — all “Records present”
- VIIRS Jan 2010–Dec 2011: `0 observations, No source records returned; observation coverage unknown`
- Health `{"status":"ok"}`; frontend at `http://127.0.0.1:5173`; backend at `http://127.0.0.1:8000`
- Verified baseline to quote only if asked: MODIS_SP 147,536 · VIIRS_SNPP_SP 520,949 · total 668,485 · 199 bins · Standard Products only, 2010-01-01–2026-07-31 (VIIRS from 2012-01-20)

## What not to claim

Do not call hotspots “wildfires,” “incidents,” or “perimeters.” Do not sum MODIS + VIIRS. Do not present an empty bin as zero activity or verified absence. Do not present the bbox as the official Bangladesh boundary. Do not claim a validated anomaly detector, forecast, or clear-sky coverage. Hotspot groups are experimental algorithmic clusters (centroids), not confirmed incidents.
