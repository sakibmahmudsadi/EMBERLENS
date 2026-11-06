"""Loader idempotency + duplicate handling — SYNTHETIC data only."""

from pathlib import Path

from backend.local_loader import load_csv

FIXTURES = Path(__file__).parent / "fixtures" / "SYNTHETIC_NOT_NASA_DATA"


def test_duplicate_csv_exact_dedup(db):
    result = load_csv(db, FIXTURES / "duplicates_synthetic.csv", sensor="MODIS", product_id="MODIS_NRT")
    assert result["row_count"] == 3
    assert result["exact_duplicates"] == 1
    assert db.count_observations() == 2


def test_reload_is_idempotent(db):
    load_csv(db, FIXTURES / "duplicates_synthetic.csv", sensor="MODIS", product_id="MODIS_NRT")
    first = db.count_observations()
    load_csv(db, FIXTURES / "duplicates_synthetic.csv", sensor="MODIS", product_id="MODIS_NRT")
    assert db.count_observations() == first


def test_snapshot_registered(db):
    load_csv(db, FIXTURES / "modis_synthetic.csv", sensor="MODIS", product_id="MODIS_NRT")
    snaps = db.list_snapshots()
    assert len(snaps) == 1 and snaps[0]["row_count"] == 4
    assert snaps[0]["sha256"]
