"""Shared fixtures. All data here is SYNTHETIC — NOT NASA DATA."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from shapely.geometry import box

# Importing backend.app constructs the module-level ASGI app. Keep that
# construction isolated from a developer's national/demo database by default;
# an explicitly configured test database still takes precedence.
os.environ.setdefault("EMBERLENS_DB", ":memory:")

from backend.app import create_app
from backend.db.database import init_db
from backend.local_loader import load_csv

FIXTURES = Path(__file__).parent / "fixtures" / "SYNTHETIC_NOT_NASA_DATA"

AOI_GEOMETRY = box(89.0, 21.0, 91.0, 23.0)  # box(minx, miny, maxx, maxy) = lon 89..91, lat 21..23

TEST_START = datetime(2024, 1, 1, tzinfo=timezone.utc)
TEST_END = datetime(2024, 4, 1, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    d = init_db(":memory:")
    d.upsert_aoi(aoi_id="demo-aoi", name="Demo AOI (synthetic)", geometry=AOI_GEOMETRY, source="test")
    yield d
    d.close()


@pytest.fixture()
def seeded_db(db):
    """Seed MODIS + VIIRS synthetic CSVs. Hand-checkable counts:

    MODIS (synthetic): 2024-01 -> 2, 2024-02 -> 2 (leap day included), 2024-03 -> 0
    VIIRS (synthetic): 2024-01 -> 0, 2024-02 -> 2, 2024-03 -> 1
    """
    load_csv(db, FIXTURES / "modis_synthetic.csv", sensor="MODIS", product_id="MODIS_NRT")
    load_csv(db, FIXTURES / "viirs_synthetic.csv", sensor="VIIRS", product_id="VNP14IM")
    return db


@pytest.fixture()
def client(seeded_db, monkeypatch):
    monkeypatch.setenv("EMBERLENS_AOI_IDS", "demo-aoi")
    app = create_app()
    from backend.api import routes

    routes._db = seeded_db
    with __import__("fastapi.testclient", fromlist=["TestClient"]).TestClient(app) as c:
        yield c
    routes._db = None
