"""Backend configuration from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


@dataclass(frozen=True)
class Settings:
    frontend_origin: str = field(default_factory=lambda: os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173"))
    data_root: Path = field(default_factory=lambda: Path(os.environ.get("DATA_ROOT", str(PROJECT_ROOT / "data"))))
    db_path: Path = field(
        default_factory=lambda: Path(os.environ.get("EMBERLENS_DB", str(BACKEND_DIR / "emberlens.duckdb")))
    )
    app_name: str = "EMBERLENS"
    api_version: str = "v1"
    normalization_version: str = "canonical-v1"
    method_version: str = "calendar-v0"


def get_settings() -> Settings:
    return Settings()
