"""API tests via TestClient — SYNTHETIC data only, NOT NASA data."""

from backend.calendar_agg import COUNT_UNIT


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_data_sources(client):
    r = client.get("/api/v1/data-sources")
    assert r.status_code == 200
    assert len(r.json()["snapshots"]) == 2  # MODIS + VIIRS synthetic snapshots


def test_aois(client):
    r = client.get("/api/v1/aois")
    assert r.status_code == 200 and r.json()[0]["aoi_id"] == "demo-aoi"


def test_observations_list_and_pagination(client):
    r = client.get("/api/v1/observations", params={"sensors": "MODIS", "page_size": 2})
    body = r.json()
    assert r.status_code == 200
    assert body["pagination"]["total"] == 4
    assert len(body["data"]) == 2
    row = body["data"][0]
    assert row["sensor"] == "MODIS"
    assert "confidence_raw" in row and "confidence_semantics" in row


def test_observation_detail(client):
    rows = client.get("/api/v1/observations").json()["data"]
    oid = rows[0]["observation_id"]
    r = client.get(f"/api/v1/observations/{oid}")
    assert r.status_code == 200
    assert r.json()["observation_id"] == oid
    assert r.json()["source_snapshot_id"]


def test_observation_not_found(client):
    r = client.get("/api/v1/observations/does-not-exist")
    assert r.status_code == 404
    assert r.json()["detail"]["error"]["code"] == "OBSERVATION_NOT_FOUND"


def test_invalid_date_range(client):
    r = client.get("/api/v1/observations", params={"start": "2024-02-01", "end": "2024-01-01"})
    assert r.status_code == 422
    assert r.json()["detail"]["error"]["code"] == "INVALID_DATE_RANGE"


def test_calendar(client):
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01"})
    body = r.json()
    assert r.status_code == 200
    assert body["count_unit"] == COUNT_UNIT
    assert body["time_bin"] == "month"
    assert body["spatial_rule"] == "point_in_polygon_boundary_included"
    sensors = {s["sensor"] for s in body["series"]}
    assert sensors == {"MODIS", "VIIRS"}
    # VIIRS Feb has 3 synthetic rows; Jan has 0 with unverified status.
    viirs = next(s for s in body["series"] if s["sensor"] == "VIIRS")
    by_month = {v["period_start"][:7]: v for v in viirs["values"]}
    assert by_month["2024-02"]["observation_count"] == 3
    assert by_month["2024-01"]["observation_count"] == 0
    assert by_month["2024-01"]["coverage_status"] == "no_records_returned_coverage_unverified"


def test_calendar_window_too_large(client):
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "demo-aoi", "start": "2020-01-01", "end": "2024-01-01"})
    assert r.status_code == 422


def test_calendar_aoi_not_found(client):
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "nope", "start": "2024-01-01", "end": "2024-04-01"})
    assert r.status_code == 404


def test_coverage(client):
    r = client.get("/api/v1/coverage")
    assert r.status_code == 200
    assert "availability" in r.json()


def test_export_csv_direct_with_manifest(client):
    r = client.post("/api/v1/exports", json={"dataset_type": "observations", "format": "csv",
                                             "sensors": ["VIIRS"]})
    assert r.status_code == 200
    assert "metadata_manifest" in r.text
    assert "NASA FIRMS" in r.text
    assert "observation_count" not in r.text  # no merged-count column invented


def test_export_geojson(client):
    r = client.post("/api/v1/exports", json={"dataset_type": "observations", "format": "geojson"})
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"][0]["geometry"]["type"] == "Point"
    # GeoJSON coordinate order is [lon, lat].
    f0 = body["features"][0]
    assert f0["geometry"]["coordinates"] == [f0["properties"]["longitude"], f0["properties"]["latitude"]]
    assert "metadata_manifest" in body
