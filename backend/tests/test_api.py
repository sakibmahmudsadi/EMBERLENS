"""API tests via TestClient — SYNTHETIC data only, NOT NASA data."""

import json

from shapely.geometry import box

from backend.calendar_agg import COUNT_UNIT


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_cors_allows_supported_local_frontend_hosts(client):
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        r = client.options("/api/v1/health", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        })
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == origin


def test_data_sources(client, seeded_db):
    seeded_db.conn.execute(
        "UPDATE source_snapshot SET source_file_uri=?, source_endpoint=?",
        [
            r"C:\private\raw\legacy.csv",
            "https://firms.example/api/area/csv/0123456789abcdef0123456789abcdef/MODIS_SP/"
            "?MAP_KEY=abcdef0123456789abcdef0123456789",
        ],
    )
    r = client.get("/api/v1/data-sources")
    assert r.status_code == 200
    snapshots = r.json()["snapshots"]
    assert len(snapshots) == 2  # MODIS + VIIRS synthetic snapshots
    for snapshot in snapshots:
        assert snapshot["source_file_uri"] == "legacy.csv"
        assert "C:\\private" not in snapshot["source_file_uri"]
        assert "0123456789abcdef0123456789abcdef" not in snapshot["source_endpoint"]
        assert snapshot["source_endpoint"].count("<MAP_KEY>") == 2


def test_aois(client):
    r = client.get("/api/v1/aois")
    assert r.status_code == 200 and r.json()[0]["aoi_id"] == "demo-aoi"


def test_unconfigured_database_aois_are_not_exposed_or_queryable(client, seeded_db):
    seeded_db.upsert_aoi(
        aoi_id="injected-aoi", name="Unconfigured AOI", geometry=box(88, 20, 93, 27), source="test",
    )
    assert [item["aoi_id"] for item in client.get("/api/v1/aois").json()] == ["demo-aoi"]

    requests = [
        client.get("/api/v1/observations", params={"aoi_id": "injected-aoi"}),
        client.get("/api/v1/coverage", params={"aoi_id": "injected-aoi"}),
        client.get("/api/v1/map-density", params={
            "aoi_id": "injected-aoi", "start": "2024-01-01", "end": "2024-02-01",
        }),
        client.get("/api/v1/calendar", params={
            "aoi_id": "injected-aoi", "start": "2024-01-01", "end": "2024-02-01",
        }),
        client.get("/api/v1/hotspot-groups", params={
            "aoi_id": "injected-aoi", "start": "2024-01-01", "end": "2024-02-01",
        }),
        client.post("/api/v1/exports", json={
            "dataset_type": "observations", "format": "json", "aoi_id": "injected-aoi",
        }),
        client.post("/api/v1/exports", json={
            "dataset_type": "calendar", "format": "json", "aoi_id": "injected-aoi",
            "start": "2024-01-01", "end": "2024-02-01",
        }),
    ]
    assert [response.status_code for response in requests] == [404] * len(requests)
    assert {response.json()["error"]["code"] for response in requests} == {"AOI_NOT_FOUND"}


def test_observations_list_and_pagination(client):
    r = client.get("/api/v1/observations", params={"sensors": "MODIS", "page_size": 2})
    body = r.json()
    assert r.status_code == 200
    assert body["pagination"]["total"] == 4
    assert len(body["data"]) == 2
    row = body["data"][0]
    assert row["sensor"] == "MODIS"
    assert "confidence_raw" in row and "confidence_semantics" in row


def test_map_density_covers_matching_dataset_without_cross_sensor_sums(client):
    r = client.get("/api/v1/map-density", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
    })
    assert r.status_code == 200
    body = r.json()
    counts = {}
    for cell in body["cells"]:
        for series in cell["series"]:
            counts[series["sensor"]] = counts.get(series["sensor"], 0) + series["observation_count"]
    assert counts == {"MODIS": 4, "VIIRS": 4}
    assert "never a cross-sensor sum" in body["count_semantics"]
    assert body["cell_count"] == len(body["cells"])
    filtered = client.get("/api/v1/map-density", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01", "daynight": "N",
    })
    filtered_counts = {}
    for cell in filtered.json()["cells"]:
        for series in cell["series"]:
            filtered_counts[series["sensor"]] = filtered_counts.get(series["sensor"], 0) + series["observation_count"]
    assert filtered_counts == {"MODIS": 1, "VIIRS": 1}


def test_hotspot_group_response_exposes_reusable_query_provenance(client):
    response = client.get("/api/v1/hotspot-groups", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-03-31",
        "sensor": "VIIRS", "max_gap_hours": 12,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["aoi"]["aoi_id"] == "demo-aoi"
    assert body["period"]["start"].startswith("2024-01-01")
    assert body["period"]["end"].startswith("2024-03-31")
    assert body["filters"] == {
        "sensor": "VIIRS", "platform": None, "product_id": None,
        "max_gap_hours": 12.0, "distance_m": None,
    }
    assert body["source_snapshot_ids"]
    assert body["source_snapshot_ids"] == sorted(set(body["source_snapshot_ids"]))
    assert {
        snapshot_id for group in body["groups"] for snapshot_id in group["source_snapshot_ids"]
    } <= set(body["source_snapshot_ids"])


def test_observation_quality_filters_keep_sensor_semantics(client):
    frp = client.get("/api/v1/observations", params={"min_frp_native": 12})
    assert frp.status_code == 200
    assert frp.json()["pagination"]["total"] == 4
    night = client.get("/api/v1/observations", params={"daynight": "N"})
    assert night.status_code == 200
    assert night.json()["pagination"]["total"] == 2
    modis_native = client.get("/api/v1/observations", params={"min_modis_confidence": 90})
    assert modis_native.status_code == 200
    # Numeric threshold applies to MODIS only; categorical VIIRS rows remain visible.
    assert modis_native.json()["pagination"]["total"] == 6
    viirs_native = client.get("/api/v1/observations", params={"viirs_confidence_classes": "H"})
    assert viirs_native.status_code == 200
    assert viirs_native.json()["pagination"]["total"] == 6
    assert {row["sensor"] for row in viirs_native.json()["data"]} == {"MODIS", "VIIRS"}
    invalid = client.get("/api/v1/observations", params={"viirs_confidence_classes": "certain"})
    assert invalid.status_code == 422


def test_observations_aoi_filter_excludes_outside_points(client, seeded_db, tmp_path):
    from backend.local_loader import load_csv

    outside = tmp_path / "outside-synthetic.csv"
    outside.write_text(
        "latitude,longitude,acq_date,acq_time,satellite,confidence,version,frp,daynight\n"
        "24.0,90.0,2024-02-10,1200,Terra,80,6.1,9.0,D\n",
        encoding="utf-8",
    )
    load_csv(seeded_db, outside, sensor="MODIS", product_id="MODIS_NRT")
    all_rows = client.get("/api/v1/observations", params={"page_size": 1}).json()
    scoped = client.get("/api/v1/observations", params={"aoi_id": "demo-aoi", "page_size": 1}).json()
    assert all_rows["pagination"]["total"] == scoped["pagination"]["total"] + 1


def test_observations_unknown_aoi_rejected(client):
    r = client.get("/api/v1/observations", params={"aoi_id": "unknown-aoi"})
    assert r.status_code == 404


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
    assert r.json()["error"]["code"] == "OBSERVATION_NOT_FOUND"
    assert r.json()["error"]["request_id"] == r.headers["x-request-id"]


def test_invalid_date_range(client):
    r = client.get("/api/v1/observations", params={"start": "2024-02-01", "end": "2024-01-01"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_DATE_RANGE"


def test_validation_method_and_not_found_errors_use_stable_envelope(client):
    responses = [
        client.get("/api/v1/observations", params={"daynight": "twilight"}),
        client.post("/api/v1/health"),
        client.get("/api/v1/no-such-route"),
    ]
    assert [response.status_code for response in responses] == [422, 405, 404]
    assert [response.json()["error"]["code"] for response in responses] == [
        "VALIDATION_ERROR", "METHOD_NOT_ALLOWED", "NOT_FOUND",
    ]
    request_ids = []
    for response in responses:
        body = response.json()
        assert set(body) == {"error"}
        assert set(body["error"]) == {"code", "message", "request_id", "details"}
        assert body["error"]["request_id"] == response.headers["x-request-id"]
        request_ids.append(body["error"]["request_id"])
    assert len(set(request_ids)) == len(request_ids)


def test_unexpected_errors_use_generic_envelope_without_leaking_exception(client, seeded_db, monkeypatch):
    from fastapi.testclient import TestClient

    def fail_with_private_path():
        raise RuntimeError(r"database failure at C:\private\national.duckdb")

    monkeypatch.setattr(seeded_db, "list_snapshots", fail_with_private_path)
    with TestClient(client.app, raise_server_exceptions=False) as isolated_client:
        response = isolated_client.get("/api/v1/data-sources")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
    assert "C:\\private" not in response.text
    assert "detail" not in response.json()


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
    assert by_month["2024-01"]["source_snapshot_ids"] == []
    modis_ids = {snapshot_id for series in body["series"] if series["sensor"] == "MODIS"
                 for value in series["values"] for snapshot_id in value["source_snapshot_ids"]}
    viirs_ids = {snapshot_id for value in viirs["values"] for snapshot_id in value["source_snapshot_ids"]}
    assert modis_ids and viirs_ids and modis_ids.isdisjoint(viirs_ids)
    assert body["provenance"]["source_snapshot_ids"] == sorted(modis_ids | viirs_ids)


def test_calendar_get_does_not_write_derived_rows(client, seeded_db):
    before = seeded_db.conn.execute("SELECT count(*) FROM calendar_aggregate").fetchone()[0]
    params = {"aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01"}
    assert client.get("/api/v1/calendar", params=params).status_code == 200
    assert client.get("/api/v1/calendar", params=params).status_code == 200
    after = seeded_db.conn.execute("SELECT count(*) FROM calendar_aggregate").fetchone()[0]
    assert after == before


def test_calendar_honors_sensor_filter(client):
    r = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01", "sensors": "MODIS",
    })
    assert r.status_code == 200
    body = r.json()
    assert {series["sensor"] for series in body["series"]} == {"MODIS"}
    selected_snapshot_ids = sorted({snapshot_id for series in body["series"] for value in series["values"]
                                    for snapshot_id in value["source_snapshot_ids"]})
    assert body["provenance"]["source_snapshot_ids"] == selected_snapshot_ids


def test_calendar_quality_filters_honor_native_confidence(client):
    r = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
        "min_modis_confidence": 90,
    })
    assert r.status_code == 200
    assert r.json()["observation_filters"]["min_modis_confidence"] == 90
    totals = {series["sensor"]: sum(value["observation_count"] for value in series["values"])
              for series in r.json()["series"]}
    assert totals == {"MODIS": 2, "VIIRS": 4}


def test_calendar_native_frp_filter_uses_preserved_source_field(client):
    r = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
        "min_frp_native": 12,
    })
    assert r.status_code == 200
    totals = {series["sensor"]: sum(value["observation_count"] for value in series["values"])
              for series in r.json()["series"]}
    assert totals == {"MODIS": 1, "VIIRS": 3}


def test_calendar_national_window_accepted(client):
    # National Bangladesh dataset: 2010-01 through 2026-07 (199 month bins) must be queryable.
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "demo-aoi", "start": "2010-01-01", "end": "2026-08-01"})
    assert r.status_code == 200


def test_calendar_window_too_large(client):
    # Cap is 240 months (national history); 241 months must fail (D-02).
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "demo-aoi", "start": "2006-02-01", "end": "2026-04-01"})
    assert r.status_code == 422


def test_calendar_aoi_not_found(client):
    r = client.get("/api/v1/calendar",
                   params={"aoi_id": "nope", "start": "2024-01-01", "end": "2024-04-01"})
    assert r.status_code == 404


def test_coverage(client):
    r = client.get("/api/v1/coverage")
    assert r.status_code == 200
    assert "availability" in r.json()


def test_coverage_filters_product_platform_and_sensor(client, seeded_db):
    from datetime import datetime, timezone

    for pid, platform in (("MODIS_SP", "Terra"), ("VIIRS_SNPP_SP", "Suomi-NPP")):
        seeded_db.insert_availability({
            "availability_id": f"availability-{pid}",
            "product_id": pid,
            "platform": platform,
            "date_or_interval": "2024-03-01..2024-03-31",
            "availability_status": "available",
            "source_reference": "synthetic-test",
            "checked_at_utc": datetime.now(timezone.utc),
            "notes": "SYNTHETIC test evidence",
        })
    r = client.get("/api/v1/coverage", params={"sensor": "VIIRS", "platform": "Suomi-NPP", "product_id": "VIIRS_SNPP_SP"})
    assert r.status_code == 200
    assert {item["product_id"] for item in r.json()["availability"]} == {"VIIRS_SNPP_SP"}


def test_coverage_filters_source_intervals_and_missing_days_by_date_range(client, seeded_db):
    from datetime import datetime, timezone

    rows = [
        ("modis-interval", "MODIS_SP", "Terra", "2024-01-01..2024-12-31", "available"),
        ("viirs-feb-gap", "VIIRS_SNPP_SP", "Suomi-NPP", "2024-02-15", "missing"),
        ("viirs-mar-gap", "VIIRS_SNPP_SP", "Suomi-NPP", "2024-03-01", "missing"),
    ]
    for availability_id, product_id, platform, date_or_interval, status in rows:
        seeded_db.insert_availability({
            "availability_id": availability_id,
            "product_id": product_id,
            "platform": platform,
            "date_or_interval": date_or_interval,
            "availability_status": status,
            "source_reference": "synthetic-test",
            "checked_at_utc": datetime.now(timezone.utc),
            "notes": "SYNTHETIC test evidence",
        })

    response = client.get("/api/v1/coverage", params={
        "start": "2024-02-01", "end": "2024-03-01",
    })

    assert response.status_code == 200
    availability = response.json()["availability"]
    assert {item["availability_id"] for item in availability} == {"modis-interval", "viirs-feb-gap"}
    assert "not observation opportunities inside this AOI" in response.json()["note"]


def test_coverage_rejects_invalid_date_ranges(client):
    invalid_date = client.get("/api/v1/coverage", params={"start": "not-a-date"})
    reversed_range = client.get("/api/v1/coverage", params={
        "start": "2024-03-01", "end": "2024-02-01",
    })
    assert invalid_date.status_code == 422
    assert invalid_date.json()["error"]["code"] == "INVALID_DATE_RANGE"
    assert reversed_range.status_code == 422
    assert reversed_range.json()["error"]["code"] == "INVALID_DATE_RANGE"


def test_calendar_marks_firms_missing_day_as_partial_source_data(client, seeded_db):
    from datetime import datetime, timezone

    seeded_db.insert_availability({
        "availability_id": "synthetic-modis-missing-day",
        "product_id": "MODIS_NRT",
        "platform": "Terra",
        "date_or_interval": "2024-03-15",
        "availability_status": "missing",
        "source_reference": "synthetic-test",
        "checked_at_utc": datetime.now(timezone.utc),
        "notes": "SYNTHETIC test evidence",
    })
    response = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
    })

    assert response.status_code == 200
    terra = next(series for series in response.json()["series"]
                 if series["sensor"] == "MODIS" and series["platform"] == "Terra")
    march = next(value for value in terra["values"] if value["period_start"].startswith("2024-03"))
    assert march["observation_count"] == 0
    assert march["coverage_status"] == "partial_source_data"


def test_calendar_source_available_interval_does_not_prove_zero_detections(client, seeded_db):
    from datetime import datetime, timezone

    seeded_db.insert_availability({
        "availability_id": "synthetic-source-available-interval",
        "product_id": "VNP14IM",
        "platform": "Suomi-NPP",
        "date_or_interval": "2024-01-01..2024-12-31",
        "availability_status": "available",
        "source_reference": "synthetic-test",
        "checked_at_utc": datetime.now(timezone.utc),
        "notes": "SYNTHETIC test evidence",
    })
    response = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
    })

    assert response.status_code == 200
    viirs = next(series for series in response.json()["series"] if series["sensor"] == "VIIRS")
    january = next(value for value in viirs["values"] if value["period_start"].startswith("2024-01"))
    assert january["observation_count"] == 0
    assert january["coverage_status"] == "no_records_returned_coverage_unverified"


def test_calendar_includes_registered_series_with_no_matching_observations(client, seeded_db):
    from datetime import datetime, timezone

    seeded_db.insert_snapshot({
        "source_snapshot_id": "empty-synthetic-snapshot",
        "provider": "NASA FIRMS",
        "source_endpoint": "synthetic-test",
        "product_id": "EMPTY_SP",
        "platform": "Test-Platform",
        "sensor": "VIIRS",
        "requested_start_utc": datetime(2024, 1, 1, tzinfo=timezone.utc),
        "requested_end_utc": datetime(2024, 3, 31, tzinfo=timezone.utc),
        "retrieved_at_utc": datetime.now(timezone.utc),
        "source_file_uri": "synthetic-empty.csv",
        "row_count": 0,
    })
    response = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
        "products": "EMPTY_SP",
    })

    assert response.status_code == 200
    series = response.json()["series"]
    assert len(series) == 1
    assert (series[0]["sensor"], series[0]["platform"], series[0]["product_id"]) == (
        "VIIRS", "Test-Platform", "EMPTY_SP",
    )
    assert [value["observation_count"] for value in series[0]["values"]] == [0, 0, 0]
    assert all(value["coverage_status"] == "no_records_returned_coverage_unverified"
               for value in series[0]["values"])


def test_combined_modis_snapshot_does_not_create_a_false_combined_calendar_series(client, seeded_db):
    seeded_db.conn.execute(
        "UPDATE source_snapshot SET platform='Terra+Aqua' WHERE product_id='MODIS_NRT'",
    )
    response = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01",
    })
    modis_platforms = {
        item["platform"] for item in response.json()["series"] if item["sensor"] == "MODIS"
    }
    assert response.status_code == 200
    assert modis_platforms == {"Terra", "Aqua"}

    terra_only = client.get("/api/v1/calendar", params={
        "aoi_id": "demo-aoi", "start": "2024-01-01", "end": "2024-04-01", "platforms": "Terra",
    })
    assert {(item["sensor"], item["platform"]) for item in terra_only.json()["series"]} == {("MODIS", "Terra")}


def test_export_csv_direct_with_manifest(client):
    r = client.post("/api/v1/exports", json={"dataset_type": "observations", "format": "csv",
                                             "sensors": ["VIIRS"]})
    assert r.status_code == 200
    assert "metadata_manifest" in r.text
    assert "NASA FIRMS" in r.text


def test_export_manifest_uses_only_contributing_sanitized_snapshots(client, seeded_db):
    seeded_db.conn.execute(
        "UPDATE source_snapshot SET source_endpoint=? WHERE product_id='VNP14IM'",
        ["https://firms.example/api/area/csv/0123456789abcdef0123456789abcdef/VNP14IM/"],
    )
    r = client.post("/api/v1/exports", json={
        "dataset_type": "observations", "format": "json", "aoi_id": "demo-aoi",
        "sensors": ["VIIRS"], "start": "2024-01-01", "end": "2024-04-01",
    })
    assert r.status_code == 200
    manifest = r.json()["metadata_manifest"]
    snapshots = manifest["source_snapshots"]
    assert len(snapshots) == 1
    assert snapshots[0]["product_id"] == "VNP14IM"
    assert "0123456789abcdef0123456789abcdef" not in snapshots[0]["source_endpoint"]
    assert "<MAP_KEY>" in snapshots[0]["source_endpoint"]
    assert "/" not in snapshots[0]["source_file_uri"]
    assert "\\" not in snapshots[0]["source_file_uri"]
    assert manifest["aoi"]["geometry_source"] == "test"
    assert manifest["aoi"]["bbox_wsen"] == [89.0, 21.0, 91.0, 23.0]


def test_empty_csv_export_keeps_schema_header_and_manifest(client):
    r = client.post("/api/v1/exports", json={
        "dataset_type": "observations", "format": "csv", "aoi_id": "demo-aoi",
        "start": "2027-01-01", "end": "2027-01-02",
    })
    assert r.status_code == 200
    csv_body, manifest_text = r.text.rsplit("\n# metadata_manifest: ", 1)
    assert csv_body.startswith("observation_id,source_snapshot_id,source_row_fingerprint,")
    assert json.loads(manifest_text)["row_count"] == 0


def test_export_applies_quality_filters_and_records_them(client):
    r = client.post("/api/v1/exports", json={
        "dataset_type": "observations", "format": "json", "min_frp_native": 12,
        "daynight": "N", "min_modis_confidence": 80,
        "viirs_confidence_classes": ["H"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["metadata_manifest"]["row_count"] == len(body["data"])
    assert body["metadata_manifest"]["filters"] == {
        "sensors": None, "platforms": None, "products": None,
        "min_frp_native": 12.0, "daynight": "N", "min_modis_confidence": 80.0,
        "viirs_confidence_classes": ["H"],
    }


def test_export_recomputes_quality_filtered_calendar(client):
    r = client.post("/api/v1/exports", json={
        "dataset_type": "calendar", "format": "json", "aoi_id": "demo-aoi",
        "start": "2024-01-01", "end": "2024-04-01", "min_modis_confidence": 90,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["metadata_manifest"]["row_count"] == 6
    sums = {}
    for row in body["data"]:
        sums[row["sensor"]] = sums.get(row["sensor"], 0) + row["observation_count"]
    assert sums == {"MODIS": 2, "VIIRS": 4}


def test_unfiltered_calendar_export_is_standalone(client, seeded_db):
    response = client.post("/api/v1/exports", json={
        "dataset_type": "calendar", "format": "json", "aoi_id": "demo-aoi",
        "start": "2024-01-01", "end": "2024-04-01",
    })
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 9  # three series × three months
    assert {row["product_id"] for row in body["data"]} == {"MODIS_NRT", "VNP14IM"}
    assert body["metadata_manifest"]["row_count"] == 9
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


def test_calendar_geojson_export_is_rejected_with_error_envelope(client):
    response = client.post("/api/v1/exports", json={
        "dataset_type": "calendar", "format": "geojson", "aoi_id": "demo-aoi",
        "start": "2024-01-01", "end": "2024-02-01",
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_COMBINATION"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
