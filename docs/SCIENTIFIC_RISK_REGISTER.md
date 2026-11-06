# Scientific and Data Risk Register

| ID | Risk | Consequence | Mitigation / control | Release gate |
|---|---|---|---|---|
| R-01 | Treating a hotspot as a confirmed wildfire | Misleading or unsafe claims | Use active-fire detection language; explain thermal-anomaly limitations | All UI/export copy reviewed |
| R-02 | Adding raw MODIS and VIIRS counts | Artificial trend shifts and false comparability | Keep sensor-stratified series; validate any fusion on overlap data | No unqualified combined count |
| R-03 | Equating confidence values | Incorrect filtering/ranking | Preserve native semantics; only calibrate with evidence | Native confidence displayed |
| R-04 | Empty hotspot query displayed as verified zero activity | False inactivity/seasonality | Label no rows as “no source records returned; observation coverage unknown” unless independent valid-observation evidence exists; source date availability is not clear-sky coverage | Empty, source-gap, and independently verified-zero cases are distinct |
| R-05 | Mixing NRT and standard products | Artificial step changes after reprocessing | Store processing level/version; use standard for historical work where available | Mixed sources clearly labeled/reconciled |
| R-06 | Archive/product coverage assumption is wrong | Empty or biased periods | Check live availability per product; record retrieval date | Coverage report produced |
| R-07 | Cross-sensor near-neighbor dedupe deletes observations | Lost measurements | Keep source rows; associate rather than delete | Provenance test passes |
| R-08 | Cluster transitive chaining merges distinct activity | Misleading hotspot groups | Parameter sensitivity, algorithm audit, neutral naming | P1 group validation passes |
| R-09 | Baseline includes target period | Dampened anomaly | Explicit reference window; test exclusion | Method documented |
| R-10 | Sparse/zero-inflated counts produce unstable anomaly scores | False unusual-condition signals | Inspect distributions; use robust/empirical alternatives; show uncertainty | Validation and sample sufficiency pass |
| R-11 | Spatial grid/resolution changes conclusions | Biased spatial patterns | Sensitivity test; document CRS/cell size | Method choice recorded |
| R-12 | AOI boundary source is inaccurate | Wrong inclusion/exclusion | Track boundary source/version and clipping rule | AOI metadata visible |
| R-13 | Overpass gaps/cloud/smoke cause missed detections | Understatement of activity | State observation limitations; avoid absence claims | Limitations visible |
| R-14 | Forecast presented as fire prediction | False confidence and reputational risk | Defer forecast unless independently validated; label target precisely | Separate forecast gate |
| R-15 | Demo sample is not representative | Overstated generality | Label demo AOI and time range; test transfer AOI when feasible | Claims scoped to evidence |
| R-16 | Source product schema changes | Ingestion failures or silent corruption | Schema validation, alert on unknown columns, version mappings | Schema drift test/report |
| R-17 | API key committed or exposed in browser | Unauthorized use | Server-side secret storage, `.env` ignored, secret scan | No secrets in repo/build |
| R-18 | Fake data presented as live output | Judges/users misled | Separate fixtures, labels, and demo-mode indicator | Data provenance visible |
| R-19 | Two-year prototype presented as long-term climatology or robust anomaly result | Overstated historical insight | Cap the prototype at 24 months but label it as a workflow demo; defer long-term baseline/anomaly claims unless additional reference data and validation are added | Date window and limits visible in UI/export |

## Risk review procedure

Review this register at the start of each milestone and before a public demo. Add new risks when the method, data product, AOI, or deployment changes. Record accepted risks and rationale in `docs/DECISIONS.md`.
