# Source Data Coverage Report

**Snapshot:** Bangladesh national prototype, requested window 2010-01-01 through 2026-07-31 inclusive
**Prepared:** 2026-11-07
**Database:** `backend/emberlens-bangladesh.duckdb`
**Method:** loaded NASA FIRMS Standard (SP) point detections; source-service date-availability metadata is reported separately from observation opportunity.

## Loaded source snapshots

| Product | Requested interval | Actual record interval | Rows | Validation |
|---|---|---|---:|---|
| MODIS_SP (Terra+Aqua, Collection 6.1) | 2010-01-01–2026-07-31 | 2010-01-01–2026-07-25 | 147,536 | Passed; manifest SHA-256 begins `5a1fd42b902c` |
| VIIRS_SNPP_SP (Suomi-NPP, 375 m) | 2012-01-20–2026-07-31 | 2012-01-20–2026-07-28 | 520,949 | Passed; manifest SHA-256 begins `460a271eedb5` |

Total loaded observations: **668,485**. The two VIIRS rows outside the task-specified national bounding box are excluded from point-in-polygon calendar counts. The bbox is not an authoritative national boundary.

## FIRMS source-service availability

Availability records retrieved 2026-11-06:

| Product | Reported interval | Status |
|---|---|---|
| MODIS_SP | 2000-11-01–2026-08-31 | available |
| VIIRS_SNPP_SP | 2012-01-20–2026-07-31 | available |

The common snapshot ends at 2026-07-31; the later MODIS-only August availability is outside the frozen window. No NRT products are included.

## What this evidence does and does not establish

- It establishes that the downloaded product snapshots passed the project validator and that FIRMS reported each product as available over the broad intervals above.
- It does not identify day-level or month-level source gaps inside those broad intervals. The current availability records are product-level intervals, not a daily gap list.
- It does not establish clear-sky coverage, valid-pixel observation opportunity, or that a month with no detections had zero fires.
- Thus an empty calendar period must be labelled “no source records returned; observation coverage unknown.” Do not label it a verified zero or source-data gap without finer-grained evidence and a documented rule.
- NASA FIRMS documents its **Missing Data** page as a list of days missing from its database, one record per day and satellite/data type; its page notes that NRT entries appear only after the last available SP date for each satellite. The captured Standard columns were mapped to MODIS/Terra, MODIS/Aqua, and Suomi-NPP and used as source-service gap evidence. This still cannot establish clear-sky or valid-pixel observation opportunities for Bangladesh. See [FIRMS Missing Data](https://firms.modaps.eosdis.nasa.gov/api/missing_data/).
- Retrieved the official page's JSON response on 2026-11-07 (169 source rows total). Filtered to the registered SP satellites and frozen window, 118 distinct global missing-day records were stored in `data/processed/availability/firms_missing_days_20261107T141424Z.json` and the Bangladesh DB. Months containing at least one such date are labelled `partial_source_data` for the matching satellite series: MODIS/Aqua 1 month, MODIS/Terra 3 months, VIIRS/Suomi-NPP 13 months. These identify known source-service gaps; they do not claim that the rest of each month had valid observation opportunities.

## API/runtime check

The API was restarted on 2026-11-07 after importing missing-day evidence. Health and snapshots return successfully; observations total 668,485. Full-window calendar verification returned 199 bins per series and `partial_source_data` in the counts reported above. Recheck runtime endpoints when launching the prototype; this local process is not a production deployment.

## Evidence files

- `data/processed/manifests/ingest-20261106T083508Z-4379f4_MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.json`
- `data/processed/manifests/ingest-20261106T091350Z-cfe10f_VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.json`
- `data/processed/validation/validation_ingest-20261106T091416Z-0b712c.json`
- `DATA_SOURCE_REGISTER.md`, section 11
