> **Scope superseded 2026-11-06 (ADR-012):** the active configuration is Bangladesh national bbox (`bangladesh-bd`), Standard `MODIS_SP` + `VIIRS_SNPP_SP`, fixed window 2010-01-01 → 2026-07-31. “24-month prototype” below is historical and must not be used as current scope; the national bbox is not an authoritative boundary and missing records are not verified zero detections. See `docs/DECISIONS.md` ADR-012 and `DATA_SOURCE_REGISTER.md` §10.

# Roadmap and Milestone Gates

Roadmap order is deliberate: prove data correctness before building broad analytics or polishing the interface. The dated workback below is the original plan for the 2026 hackathon; current repository status is in `docs/STATUS.md`. Current prototype scope is one Bangladesh task-specified bbox and the registered 2010-01-01–2026-07-31 snapshot, not the historical 24-month starter target.

## Prototype workback — November 5–15, 2026

The official challenge page lists the global hackathon on November 14–15 and project submission through November 15 at 11:59 PM local time. Use the workback to arrive at the event with a reproducible core slice; confirm any local-event instructions with the team. [Official schedule](https://www.spaceappschallenge.org/2026/).

| Dates | Focus | Exit evidence |
|---|---|---|
| Nov 5–6 | Audit the actual application repo; choose one AOI, selected MODIS/VIIRS products, and a common source-available window no longer than 24 months | Repository/data audit; exact AOI and date range; product/version decision |
| Nov 7–8 | Retrieve bounded source data, preserve snapshots, validate schemas and gaps | Raw snapshot(s), checksums, manifests, validation report |
| Nov 9–10 | Build canonical rows and deterministic monthly sensor/platform calendar | Hand-checkable calendar output; source-row trace for a selected cell |
| Nov 11–12 | Connect minimal map/calendar UI, observation detail, and bounded export | AOI-to-calendar-to-source-detail-to-export walkthrough |
| Nov 13 | Freeze demo snapshot and feature scope; resolve blockers; rehearse | Clean reproducible demo, known limitations, backup recording/screenshots |
| Nov 14–15 | Build only the remaining competition-critical gaps, prepare narrative, and submit | Working prototype and submission completed before the local deadline |

The source-to-calendar path is now implemented for the frozen national snapshot. The maturity gates below remain future work where the current status identifies a gap. Forecast work remains optional and must never be presented as guaranteed wildfire prediction.

## M0 — Repository and data reconnaissance

**Outcome:** an accurate inventory of what already exists and what is feasible.

Deliverables:
- repository audit;
- dataset inventory with exact source, versions, dates, fields, and licensing/redistribution notes;
- current run instructions and test baseline;
- data quality report;
- risk/decision list;
- revised implementation plan.

**Exit gate:** no implementation plan relies on uninspected data or invented repository assumptions.

## M1 — Real source ingestion

**Outcome:** a bounded, reproducible MODIS/VIIRS dataset for a documented AOI.

Deliverables:
- product/source register;
- real raw sample files;
- source manifests and checksums;
- idempotent ingestion process;
- schema/quality/coverage report;
- automated ingestion tests.

**Exit gate:** repeatable ingestion, source provenance, no secret leakage, and explicit handling of empty/partial results.

## M2 — Canonical data and query layer

**Outcome:** sensor-aware observations are queryable by AOI/date/product.

Deliverables:
- canonical schema and field mapping;
- database migrations and indexes;
- observation and coverage queries;
- source-linked observation detail;
- API tests.

**Exit gate:** every canonical row can be traced to a raw source row and product/version.

## M3 — Burning-activity calendar (core product)

**Outcome:** a reliable calendar computed from actual source data.

Deliverables:
- documented time-bin/count unit;
- sensor-stratified aggregates;
- explicit coverage state for each period;
- calendar API;
- fixed fixture and reproducibility tests;
- minimal UI view for one AOI.

**Exit gate:** a selected calendar cell can be traced to the source observations and coverage evidence that produced it.

## M4 — Cross-sensor comparison and historical interpretation

**Outcome:** users can understand differences without conflating sensor properties with burning trends.

Deliverables:
- overlap-period analysis;
- documented comparison method;
- seasonality view;
- baseline definition;
- sensitivity report.

**Exit gate:** any combined indicator is supported by validation; otherwise show separate sensor results and clearly explain the limitation.

## M5 — Anomaly and critical-period analysis

**Outcome:** useful, explainable unusual-period interpretation.

Deliverables:
- sensor-aware baseline;
- selected statistical method;
- time-aware/robust evaluation;
- explainable anomaly result;
- critical-period wording and limitations.

**Exit gate:** method is reproducible and does not label statistical anomalies as emergencies.

## M6 — Research export and polished experience

**Outcome:** the user can explore and reuse the data through an excellent interface.

Deliverables:
- observation/calendar exports;
- metadata manifests;
- map/AOI search/filter UX;
- polished calendar and analysis views;
- responsive/accessibility pass;
- performance profiling on the demo dataset.

**Exit gate:** source-to-calendar-to-export demo works end-to-end and metadata is complete.

## M7 — Optional advanced work

Candidates:
- algorithmic hotspot grouping;
- second AOI transfer test;
- additional validated context layers;
- experimental activity outlook only if justified and time allows.

**Exit gate:** no optional feature weakens P0 reliability or causes unsupported claims.

## Milestone discipline

- Keep only one primary milestone in active development where possible.
- Demonstrate each gate with an artifact, automated test, or reproducible walkthrough.
- A UI mockup is not evidence that a backend capability works.
- A successful API response is not evidence that a scientific method is correct.
- Reassess scope if the calendar is not complete; remove optional work before weakening validation.
