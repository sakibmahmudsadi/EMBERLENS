"""Canonical mapping unit tests — SYNTHETIC data only, NOT NASA data."""

from __future__ import annotations

import pytest

from backend.harmonization.mapping import (
    deduplicate,
    fingerprint,
    map_row,
    normalize_platform,
    normalize_sensor,
    parse_acquired_at_utc,
)

MODIS_ROW = {
    "latitude": "22.0", "longitude": "90.0", "brightness": "310.5", "scan": "1",
    "track": "1", "acq_date": "2024-02-01", "acq_time": "325", "satellite": "Terra",
    "confidence": "85", "version": "6.1", "bright_ti4": "300.5", "frp": "10.0",
    "daynight": "D",
}
VIIRS_ROW = {
    "latitude": "22.0", "longitude": "90.0", "brightness": "315.0", "scan": "1",
    "track": "1", "acq_date": "2024-02-01", "acq_time": "400", "satellite": "Suomi-NPP",
    "confidence": "h", "version": "6.1", "bright_ti4": "302.0", "frp": "12.0",
    "daynight": "D",
}


def test_modis_confidence_semantics_numeric():
    obs = map_row(MODIS_ROW, sensor="MODIS", product_id="MODIS_NRT", source_snapshot_id="s1")
    assert obs.confidence_raw == "85"
    assert obs.confidence_semantics == "numeric_score_0_100_source_native"
    assert obs.confidence_class_native is None


def test_viirs_confidence_semantics_categorical_kept_separate():
    obs = map_row(VIIRS_ROW, sensor="VIIRS", product_id="VNP14IM", source_snapshot_id="s2")
    assert obs.confidence_raw == "h"
    assert obs.confidence_semantics == "categorical_class_source_native"
    assert obs.confidence_class_native == "h"
    # No universal confidence_0_100 is ever produced.
    assert not hasattr(obs, "confidence_0_100")


def test_native_fields_preserved_and_timestamp_normalized():
    obs = map_row(MODIS_ROW, sensor="MODIS", product_id="MODIS_NRT", source_snapshot_id="s1")
    assert obs.acq_date_native == "2024-02-01"
    assert obs.acq_time_native == "325"
    assert obs.acquired_at_utc.isoformat() == "2024-02-01T03:25:00+00:00"
    assert obs.latitude == 22.0 and obs.longitude == 90.0
    assert obs.platform == "Terra"
    assert obs.sensor == "MODIS"


def test_platform_vocabulary():
    assert normalize_platform("suomi-npp") == "Suomi-NPP"
    assert normalize_platform("S-NPP") == "Suomi-NPP"
    assert normalize_platform("noaa-20") == "NOAA-20"
    assert normalize_platform("Aqua") == "Aqua"


def test_sensor_unsupported():
    with pytest.raises(ValueError):
        normalize_sensor("LANDSAT")


def test_fingerprint_deterministic_and_product_scoped():
    a = fingerprint(product_id="MODIS_NRT", collection_version="6.1", row=MODIS_ROW)
    b = fingerprint(product_id="MODIS_NRT", collection_version="6.1", row=MODIS_ROW)
    c = fingerprint(product_id="OTHER", collection_version="6.1", row=MODIS_ROW)
    assert a == b and a != c


def test_acq_time_padding():
    assert parse_acquired_at_utc("2024-01-01", "5").hour == 0
    assert parse_acquired_at_utc("2024-01-01", "5").minute == 5
    assert parse_acquired_at_utc("2024-01-01", "2359").hour == 23


def test_deduplicate_exact_only_within_snapshot():
    a = map_row(MODIS_ROW, sensor="MODIS", product_id="MODIS_NRT", source_snapshot_id="s1")
    a_dup = map_row(dict(MODIS_ROW), sensor="MODIS", product_id="MODIS_NRT", source_snapshot_id="s1")
    other = map_row({**MODIS_ROW, "acq_time": "400"}, sensor="MODIS", product_id="MODIS_NRT",
                    source_snapshot_id="s1")
    unique, dups = deduplicate([a, a_dup, other])
    assert dups == 1 and len(unique) == 2
