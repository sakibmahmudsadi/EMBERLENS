"""Validation unit tests — SYNTHETIC data only, NOT NASA data."""

from backend.validation.checks import check_coordinates, find_duplicates, validate_row


def test_valid_row():
    assert validate_row({"latitude": 22.0, "longitude": 90.0, "acq_date_native": "2024-02-01"}).ok


def test_lat_out_of_range():
    errors = check_coordinates(91.0, 0.0)
    assert any("latitude" in e for e in errors)


def test_lon_out_of_range():
    errors = check_coordinates(0.0, 181.0)
    assert any("longitude" in e for e in errors)


def test_missing_date():
    assert not validate_row({"latitude": 1, "longitude": 1}).ok


def test_find_duplicates():
    assert find_duplicates(["a", "b", "a"]) == ["a"]
    assert find_duplicates(["a", "b"]) == []
