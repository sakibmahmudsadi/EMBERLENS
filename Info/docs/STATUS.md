# Project Status

**Last updated:** 2026-11-05  
**Owner:** Team  
**Overall status:** Documentation and prototype scope are prepared; the application implementation has not been audited in this Info directory.

> This directory contains the starter documentation pack, not application code or a real NASA dataset. Do not report planned capabilities as implemented. The actual application repository still needs to be identified and audited.

## Current milestone

- **Milestone:** M0 — application repository and data reconnaissance
- **Status:** Pending access to the actual application repository
- **Evidence:** The Info directory inventory contains documentation/README files only; it has no application source, real data snapshot, or Git repository.

## Prototype contract

- One documented AOI.
- One fixed source window of at most 24 months; no backfill to product start dates.
- Prefer the latest common source-available window for selected products at retrieval time; report known source-service gaps and freeze exact dates/snapshot IDs.
- Monthly calendar with separate sensor/platform/product series.
- An empty hotspot query is “no source records returned; observation coverage unknown” unless independent coverage evidence supports a verified zero.
- Two years demonstrates the workflow; it does not establish a robust climatology, anomaly baseline, or forecast.

## Product state

| Capability | State | Evidence / notes |
|---|---|---|
| NASA MODIS ingestion | Not verified | Actual application repository and product snapshot not available here |
| NASA VIIRS ingestion | Not verified | Actual application repository and product snapshot not available here |
| Raw source preservation | Not verified | Inspect actual data folders/manifests |
| Canonical schema | Proposed only | See `DATA_DICTIONARY.md` |
| Coverage/missing-data logic | Not implemented/verified | Must separate source-service availability from observation opportunity |
| Monthly burning-activity calendar | Not implemented in this starter pack | P0 prototype deliverable |
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
| Identify/audit the application repository and existing data | Team / coding agent | P0 | Pending | Actual repository path |
| Select demo AOI, products, and common source-available window | Team | P0 | Pending | Data availability and repository audit |

## Known risks / open questions

- Which actual repository and branch will receive this pack?
- Which AOI and boundary source produce a useful MODIS/VIIRS overlap in a common window of at most 24 months?
- Which exact products, processing levels, and product versions will be frozen?
- What source-availability evidence will the prototype show, and how will its limitations be worded?

## Latest verification results

| Date | Command/check | Result | Environment / snapshot |
|---|---|---|---|
| 2026-11-05 | File inventory of Info directory | Documentation-only starter pack; no application source, real dataset, or Git repository | `W:\Pipeline\Nasa Space App Challenge\Info` |

## Next three actions

1. Point the team/coding agent to the actual application repository and run the audit in `PROJECT_AUDIT.md`.
2. Choose one AOI and the latest common source-available window of at most 24 months for the selected products.
3. Implement the source-to-monthly-calendar-to-export vertical slice; update this status only with verified evidence.

## Change log

- 2026-11-05: Set the prototype data cap to 24 months and recorded that this directory is documentation-only; application state remains unverified.
