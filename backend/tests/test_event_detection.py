"""Experimental hotspot-group tests with synthetic records only."""

from datetime import datetime, timedelta, timezone

from backend.event_detection.clustering import cluster_observations


def _row(oid, *, sensor="VIIRS", platform="Suomi-NPP", product="VIIRS_SNPP_SP", lon=90.0, hours=0):
    return {
        "observation_id": oid,
        "source_snapshot_id": f"snapshot-{product}",
        "sensor": sensor,
        "platform": platform,
        "product_id": product,
        "latitude": 22.0,
        "longitude": lon,
        "acquired_at_utc": datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(hours=hours),
    }


def test_groups_nearby_same_series_and_preserves_provenance():
    rows = [_row("a"), _row("b", lon=90.001, hours=12), _row("c", sensor="MODIS", platform="Terra", product="MODIS_SP", lon=90.001, hours=12)]
    groups = cluster_observations(rows)
    assert len(groups) == 1
    assert groups[0]["observation_ids"] == ["a", "b"]
    assert groups[0]["source_snapshot_ids"] == ["snapshot-VIIRS_SNPP_SP"]
    assert groups[0]["label"] == "algorithmic hotspot group"


def test_distance_and_time_thresholds_are_applied():
    far = [_row("a"), _row("b", lon=90.02, hours=1)]
    late = [_row("c"), _row("d", lon=90.001, hours=30)]
    assert cluster_observations(far) == []
    assert cluster_observations(late) == []


def test_component_duration_cap_prevents_unbounded_temporal_chaining():
    rows = [_row(str(i), hours=i * 20) for i in range(5)]
    groups = cluster_observations(rows)
    assert len(groups) == 1
    assert groups[0]["observation_count"] == 4
    assert groups[0]["duration_hours"] == 60


def test_group_ids_are_deterministic():
    rows = [_row("a"), _row("b", lon=90.001, hours=12)]
    assert cluster_observations(rows)[0]["group_id"] == cluster_observations(list(reversed(rows)))[0]["group_id"]
