"""Export round-trip tests — SYNTHETIC data only, NOT NASA data."""

import csv
import io
import json

from backend.exports.exporter import build_manifest, to_csv, to_geojson, to_json


def test_csv_round_trip():
    rows = [{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]
    out = to_csv(rows)
    parsed = list(csv.DictReader(io.StringIO(out)))
    assert parsed == [{"a": "1", "b": "x"}, {"a": "2", "b": "y"}]


def test_geojson_lon_lat_order():
    gj = to_geojson([{"latitude": 22.0, "longitude": 90.0, "sensor": "MODIS"}])
    assert gj["features"][0]["geometry"]["coordinates"] == [90.0, 22.0]
    assert gj["features"][0]["properties"]["sensor"] == "MODIS"


def test_json_round_trip():
    rows = [{"latitude": 22.0, "longitude": 90.0}]
    assert json.loads(to_json(rows)) == rows


def test_manifest_required_fields():
    m = build_manifest(
        dataset_type="observations",
        aoi={"aoi_id": "demo-aoi", "name": "Demo", "crs": "EPSG:4326"},
        date_range={"start": "2024-01-01", "end": "2024-04-01"},
        filters={"sensors": ["MODIS"]},
        row_count=3,
    )
    for key in ("created_at_utc", "aoi", "date_range", "filters", "method_version",
                "source_attribution", "limitations", "coverage_method", "crs"):
        assert key in m
    blob = json.dumps(m)
    assert "NASA FIRMS" in blob
    assert "not confirmed wildfires" in blob
