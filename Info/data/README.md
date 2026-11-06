# Data Directory

- `raw/`: immutable source payloads for the selected AOI and fixed demo period of at most 24 months; do not commit large raw files or overwrite them. Do not retrieve the full archive back to product start dates for the prototype.
- `processed/`: validated/canonical intermediate artifacts.
- `curated/`: versioned derived outputs such as calendar aggregates.
- `samples/`: small reviewed fixtures permitted for tests/demo, with a README containing source, product/version, dates, checksum, license/redistribution review, and limitations.

Never treat a file as NASA data solely because its filename contains MODIS or VIIRS. Every dataset needs provenance.
