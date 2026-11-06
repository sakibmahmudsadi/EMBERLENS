# Repository and Dataset Audit — First Task

This file is the first execution brief for Kimi K3 in Claude Code. Use it before substantial implementation in an existing EMBERLENS repository.

## Mission

Produce a factual audit of the repository, executable software, data assets, and scientific readiness. The purpose is to decide what to preserve, repair, build, or defer—not to start rewriting the project.

## Strict constraints

- Do not delete, rename, or mass-reformat files during reconnaissance.
- Do not overwrite existing docs or datasets.
- Do not assume the target structure in this starter pack is already present.
- Do not claim a dataset is NASA FIRMS data without evidence of source/product provenance.
- Do not infer product version, processing level, or date coverage from a filename alone.
- Do not expose secrets. Report only whether a required environment variable appears present, never its value.
- Do not claim code runs unless you actually execute the documented command and inspect its result.
- Keep audit-created output files limited to the reports listed below.

## Phase A — Repository inventory

Inspect:
- root folders and file inventory;
- Git branch/status/recent commits;
- README and all project instructions;
- Python/Node/package manifests and lockfiles;
- backend routes, services, data models, migrations;
- frontend routes, components, data fetching, map/chart dependencies;
- ingestion scripts, notebooks, scheduled jobs, command-line entry points;
- tests, CI workflows, Docker/hosting configuration;
- `.env.example` and config names (not secret values).

For each component, report exact paths, purpose, status, and evidence. Identify duplicates and dead-looking code but do not remove it.

## Phase B — Runtime baseline

Run only safe, documented or clearly understood commands. Record:
- dependency install state;
- backend startup/test/lint commands;
- frontend startup/build/test commands;
- migration status;
- database connection availability (without displaying credentials);
- current errors/warnings.

If a command may alter data, install packages globally, run migrations, or delete files, ask before proceeding.

## Phase C — Dataset inventory

For every candidate file/dataset inspect:
- exact path and format;
- file size and checksum if practical;
- row count and header/field list;
- minimum/maximum acquisition date;
- geographic bounds and AOI relation;
- platform, sensor, product, collection/version, and processing level if present;
- missingness, invalid coordinates/times, duplicates;
- source provenance/documentation and retrieval history;
- whether data appear standard science-quality or NRT;
- whether records from different products/versions have been mixed.

Inspect representative rows and distributions, not just filenames. Never upload private keys or large raw datasets into the report.

## Phase D — NASA product verification

Review current NASA FIRMS product/API/attribute documentation for each product identified in the dataset. Capture:
- exact product ID/source code;
- sensor/platform;
- nominal resolution and relevant measurement characteristics;
- fields and units;
- confidence semantics;
- temporal availability for selected period;
- standard versus NRT behavior;
- API/archive constraints and date gaps.

If NASA pages disagree on start/end coverage, report the discrepancy and use product-specific availability evidence. Do not select whichever date is most convenient.

## Phase E — Scientific readiness

Assess whether existing processing:
- preserves source observations;
- normalizes timestamps/units correctly;
- retains sensor/platform/product identity;
- treats confidence fields appropriately;
- deduplicates only exact source duplicates;
- handles cross-sensor overlap without deleting observations;
- defines a calendar count unit and time bins;
- distinguishes zero detections from missing data;
- documents spatial and temporal aggregation;
- validates baselines/anomalies without leakage;
- preserves observation-to-derived-output lineage.

Classify each as `verified`, `partially verified`, `not present`, or `unknown`, with file/test/evidence references.

## Phase F — Architecture and UI review

Identify current stack, module boundaries, API contracts, persistence, frontend visual state, map library, chart library, and data-loading strategy. Compare to `ARCHITECTURE.md` but do not treat the proposed stack as mandatory if the existing one is sound.

Identify UI features that are backed by actual API data versus static placeholders. Flag any mock statistics or generated map imagery that could be mistaken for scientific output.

## Required audit deliverables

Create or update only after confirming files do not already contain important material:

1. `docs/PROJECT_AUDIT_REPORT.md` — summary, inventory, what works, gaps, risks, evidence.
2. `docs/DATA_INVENTORY.md` — file-by-file data provenance/schema/coverage inventory.
3. `docs/IMPLEMENTATION_PLAN.md` — revised plan based on the audit.
4. `docs/ARCHITECTURE.md` — update only where current code warrants it; note deviations.
5. `docs/SCIENTIFIC_RISK_REGISTER.md` — add repository/data-specific risks.
6. `docs/STATUS.md` — actual current state and test results.

Also include a proposed prioritized backlog in the audit report. Do not create an unnecessary document for every small observation.

## Audit report structure

- Executive summary (what genuinely exists today)
- Repository and stack inventory
- Runtime/test baseline with exact commands/results
- Dataset inventory summary and provenance confidence
- NASA product/source verification
- Existing pipeline walkthrough
- Scientific validity assessment
- Frontend/API/database assessment
- Security and operational risks
- Reusable work versus missing work
- Recommended architecture (retain/change and why)
- P0/P1/P2 backlog with dependencies and acceptance evidence
- First vertical slice to implement
- Questions that genuinely block progress

## Stop condition

When the audit reports are complete, stop before substantial implementation and present the findings. The team should approve the first vertical slice based on evidence.
