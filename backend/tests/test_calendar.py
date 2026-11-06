"""Calendar aggregation tests — SYNTHETIC data only, NOT NASA data.

Hand-checkable seeded expectations (see conftest):
  MODIS: 2024-01 -> 2, 2024-02 -> 2, 2024-03 -> 0
  VIIRS: 2024-01 -> 0, 2024-02 -> 2, 2024-03 -> 1
  (VIIRS row at lat 22.50 / lon 90.50 is outside... no: inside box; the
  box is lon 89..91, lat 21..23, so it IS inside. VIIRS Feb = 3.)
"""

from datetime import datetime, timezone

from backend.calendar_agg import (
    COUNT_UNIT,
    NO_RECORDS_COVERAGE_UNVERIFIED,
    RECORDS_PRESENT,
)
from backend.calendar_agg.aggregation import aggregate_calendar, month_bins, resolve_coverage_status
from backend.db.database import point_in_polygon

EXPECTED = {
    ("MODIS", "Terra", "2024-01"): 1,
    ("MODIS", "Aqua", "2024-02"): 1,
    ("VIIRS", "Suomi-NPP", "2024-02"): 3,
    ("VIIRS", "Suomi-NPP", "2024-03"): 1,
}


def test_calendar_counts_and_statuses(seeded_db, db):
    from tests.conftest import AOI_GEOMETRY, TEST_END, TEST_START

    rows = aggregate_calendar(
        seeded_db.observations_for_calendar(),
        aoi_id="demo-aoi",
        aoi_geometry=AOI_GEOMETRY,
        start=TEST_START,
        end=TEST_END,
    )
    assert all(r["count_unit"] == COUNT_UNIT for r in rows)
    counts = {(r["sensor"], r["platform"], r["period_start_utc"].strftime("%Y-%m")): r["observation_count"]
              for r in rows}
    # MODIS spans Terra + Aqua platforms, each with its own series.
    assert counts[("MODIS", "Terra", "2024-01")] == 2
    assert counts[("MODIS", "Aqua", "2024-02")] == 1
    assert counts[("MODIS", "Terra", "2024-02")] == 1
    assert counts[("VIIRS", "Suomi-NPP", "2024-02")] == 3
    assert counts[("VIIRS", "Suomi-NPP", "2024-03")] == 1
    assert counts[("VIIRS", "Suomi-NPP", "2024-01")] == 0
    # Empty bin is unverified, never "no fires".
    empty = [r for r in rows if r["coverage_status"] == NO_RECORDS_COVERAGE_UNVERIFIED]
    assert empty
    assert all(r["observation_count"] == 0 for r in empty)
    assert any(r["coverage_status"] == RECORDS_PRESENT for r in rows)
    # Sensor series are never summed into one count.
    assert {r["sensor"] for r in rows} == {"MODIS", "VIIRS"}


def test_month_bins_leap_february():
    bins = month_bins(datetime(2024, 1, 15, tzinfo=timezone.utc), datetime(2024, 3, 2, tzinfo=timezone.utc))
    assert [(b[0].strftime("%Y-%m"), b[1].strftime("%Y-%m")) for b in bins] == [
        ("2024-01", "2024-02"), ("2024-02", "2024-03"), ("2024-03", "2024-04"),
    ]
    feb = bins[1]
    assert (feb[1] - feb[0]).days == 29  # 2024 is a leap year


def test_month_boundary_start_inclusive_end_exclusive():
    start = datetime(2024, 2, 1, tzinfo=timezone.utc)
    end = datetime(2024, 3, 1, tzinfo=timezone.utc)
    obs = [
        {"sensor": "MODIS", "platform": "Terra", "product_id": "P", "latitude": 22.0,
         "longitude": 90.0, "acquired_at_utc": start, "source_snapshot_id": "s"},
        {"sensor": "MODIS", "platform": "Terra", "product_id": "P", "latitude": 22.0,
         "longitude": 90.0, "acquired_at_utc": end, "source_snapshot_id": "s"},
    ]
    from tests.conftest import AOI_GEOMETRY

    rows = aggregate_calendar(obs, aoi_id="demo-aoi", aoi_geometry=AOI_GEOMETRY,
                              start=datetime(2024, 1, 1, tzinfo=timezone.utc), end=end)
    feb = [r for r in rows if r["period_start_utc"] == start]
    assert feb and feb[0]["observation_count"] == 1  # start included, end excluded


def test_boundary_point_included(db):
    from tests.conftest import AOI_GEOMETRY

    assert point_in_polygon(21.0, 89.0, AOI_GEOMETRY)  # exact corner
    assert point_in_polygon(23.0, 90.0, AOI_GEOMETRY)  # exactly on edge
    assert not point_in_polygon(20.999, 90.0, AOI_GEOMETRY)


def test_coverage_status_logic():
    assert resolve_coverage_status(3, None) == RECORDS_PRESENT
    assert resolve_coverage_status(0, "available") == NO_RECORDS_COVERAGE_UNVERIFIED
    assert resolve_coverage_status(0, "missing") == "source_data_gap"
    assert resolve_coverage_status(0, "unavailable") == "product_unavailable"
    assert resolve_coverage_status(0, "unknown") == "coverage_unknown"
    assert resolve_coverage_status(0, None) == NO_RECORDS_COVERAGE_UNVERIFIED
