# Backend

Recommended responsibility: ingestion, validation, canonical data access, calendar/analytics computation, export generation, and versioned API.

Before implementation, inspect the repository and follow `docs/ARCHITECTURE.md`. Keep scientific logic out of HTTP handlers and UI components. Tests should cover source mappings, coverage behavior, aggregation boundaries, provenance, and export metadata.
