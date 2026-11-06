"""UTC month-bin calendar aggregation."""

METHOD_VERSION = "calendar-v0"
COUNT_UNIT = "source_observation_rows_after_exact_deduplication_within_product_snapshot"
SPATIAL_RULE = "point_in_polygon_boundary_included"

# coverage_status enum (DATA_DICTIONARY.md / SCIENTIFIC_METHODOLOGY.md §7.3)
RECORDS_PRESENT = "records_present"
NO_RECORDS_COVERAGE_UNVERIFIED = "no_records_returned_coverage_unverified"
SOURCE_DATA_GAP = "source_data_gap"
PRODUCT_UNAVAILABLE = "product_unavailable"
PARTIAL_SOURCE_DATA = "partial_source_data"
COVERAGE_UNKNOWN = "coverage_unknown"
ZERO_WITH_VALID_COVERAGE = "zero_detections_with_valid_observation_coverage"

COVERAGE_LABELS = {
    RECORDS_PRESENT: "Records present",
    NO_RECORDS_COVERAGE_UNVERIFIED: "No source records returned; observation coverage unknown",
    SOURCE_DATA_GAP: "Source data gap",
    PRODUCT_UNAVAILABLE: "Product unavailable",
    PARTIAL_SOURCE_DATA: "Partial source data",
    COVERAGE_UNKNOWN: "Coverage unknown",
    ZERO_WITH_VALID_COVERAGE: "Zero detections with valid observation coverage",
}
