# Implementation Plan

## Prototype guardrail

For the competition prototype, process one AOI and a fixed period of no more than 24 months. Prefer the latest common source-available window for the selected products, record known source-service gaps, freeze its dates/snapshot, and do not download or sort each sensor's complete archive. The result is a demo of the source-to-calendar workflow, not a 20-year historical analysis.

Follow the dated hackathon workback in `ROADMAP.md`; defer baseline/anomaly analysis, hotspot grouping, additional AOIs, and asynchronous export infrastructure until the calendar slice is complete.

## Phase 0 — Audit before editing

1. Inspect all repository files, branches, package manifests, scripts, environment examples, database migrations, tests, and data folders.
2. Identify all datasets and their source provenance; inspect schemas and representative rows.
3. Check which existing functionality runs and record exact commands/results.
4. Map current code to the target architecture; identify reusable code and dead/duplicate modules.
5. Inspect NASA product docs and confirm actual product versions/availability for the demo AOI.
6. Produce/refresh `PROJECT_AUDIT.md`, `STATUS.md`, and a prioritized plan.

Do not refactor or delete files during this phase unless explicitly asked.

## Phase 1 — Build a reproducible data slice

1. Select one demo AOI based on actual data coverage and useful activity, not aesthetics.
2. Select specific MODIS and VIIRS products and the latest common source-available date range, capped at 24 months; record known source-service gaps, documentation, and exact dates.
3. Retrieve the complete bounded source subset for the selected AOI/window (at most 24 months). Create a small representative test fixture separately if needed.
4. Build source-specific parsers and explicit field mappings.
5. Preserve source files and manifests.
6. Add validation and coverage checks.
7. Make ingestion idempotent and test retry/duplicate cases.

**Deliverable:** one frozen real-data snapshot of at most 24 months, plus validation report and reproducible command.

## Phase 2 — Canonical observations and database

1. Finalize canonical schema from exact source files.
2. Store original attributes and source fingerprints.
3. Reuse the existing data store; add migrations/indexes only if the actual app needs a persistent database for the bounded snapshot.
4. Implement observation queries by configured AOI/date/product/platform.
5. Implement coverage queries and empty/no-coverage distinction.
6. Add observation detail/provenance lookup.

**Deliverable:** source-linked observations queryable by API.

## Phase 3 — Calendar computation

1. Write a short method proposal that defines AOI inclusion, bin boundaries, time zone, count unit, sensor grouping, and coverage.
2. Implement deterministic aggregation.
3. Create hand-checkable fixtures and expected outputs.
4. Add sensor-specific calendar series.
5. Add coverage states for every bin.
6. Connect the API and a minimal calendar UI.

**Deliverable:** first complete vertical slice from real NASA source to calendar cell.

## Phase 4 — Cross-sensor comparison and historical analysis (after the prototype)

1. Select common overlap periods and AOI.
2. Compare the sensors independently.
3. Investigate resolution, platform, overpass, product version, and missing-data effects.
4. Evaluate candidate normalization/fusion only if needed for the challenge story.
5. Test sensitivity to calendar bin and spatial aggregation.
6. Add seasonality/baseline view with explicit sensor context.

**Deliverable:** documented comparison report and defensible history view.

## Phase 5 — Anomaly/critical-period intelligence (deferred for the two-year prototype)

1. Profile count distributions and missingness.
2. Choose a baseline window and method appropriate to the data.
3. Prevent leakage from target period into baseline where the use case requires it.
4. Compare candidate statistics with simple references.
5. Produce result explanations and supporting evidence links.
6. Add carefully worded critical-period summaries.

**Deliverable:** validated and interpretable unusual-period analysis.

## Phase 6 — Export and UX refinement

1. Implement a direct, bounded export with a metadata manifest.
2. Verify export/API/UI consistency. Add export jobs only if measured size or runtime requires them.
3. Complete the approved map/search/filter design.
4. Add empty/loading/error/partial-coverage states.
5. Refine typography, spacing, interaction, and responsiveness.
6. Test with users and record feedback.

**Deliverable:** competition-ready end-to-end experience.

## Phase 7 — Optional research extensions

Only after all core gates pass: hotspot groups, second AOIs, contextual layers, public API, or experimental outlook. Every extension requires a method and evaluation proposal first.

## Task execution pattern for Kimi in Claude Code

For each task, ask the model to:
- inspect the current implementation and relevant docs;
- propose the smallest correct implementation;
- list assumptions and scientific implications;
- make changes in small coherent units;
- run tests and show exact commands/results;
- inspect the diff and update documentation/status;
- report incomplete work rather than hiding it.

Avoid requesting the entire application in one prompt. Use milestone-sized vertical slices with explicit acceptance criteria.
