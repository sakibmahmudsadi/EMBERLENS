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

## Pending decisions

- [ ] Exact NASA source products, product IDs, processing levels, and collection versions for the demo AOI.
- [ ] Demo AOI and boundary source/version.
- [ ] Exact fixed dates (no more than 24 months) from the latest common source-available product window.
- [ ] Source-availability wording; an empty hotspot query is not a verified zero-detection interval.
- [ ] Database and storage choice based on the actual application repository and bounded data size.
- [ ] Cross-sensor comparison method; no fused count in the prototype without validation.
- [ ] Baseline/anomaly method only if expanded reference data and validation are added.
- [ ] Event-grouping method/thresholds, if pursued after the prototype.
