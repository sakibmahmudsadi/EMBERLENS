# Data Directory

- `raw/`: immutable NASA FIRMS Standard Product payloads for the active **Bangladesh national bbox** scope (`bangladesh-bd`), frozen 2010-01-01 → 2026-07-31; do not commit large raw files or overwrite them. National archive-scale retrieval is deliberate user scope; do not add NRT sources or mix them to extend the window.
- `processed/`: validated/canonical intermediate artifacts and ingest manifests/SHA-256 for the national files.
- `curated/`: versioned derived outputs such as calendar aggregates.
- `samples/`: small reviewed fixtures permitted for tests/demo, with a README containing source, product/version, dates, checksum, license/redistribution review, and limitations.

Every dataset needs provenance. The `bangladesh-bd` bbox is task-specified, not an authoritative boundary; bbox ≠ complete coverage, and missing records are not verified zero detections.
