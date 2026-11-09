"""Backend configuration from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


def _frontend_origins() -> tuple[str, ...]:
    configured = os.environ.get("FRONTEND_ORIGINS")
    if configured:
        return tuple(origin.strip() for origin in configured.split(",") if origin.strip())
    legacy = os.environ.get("FRONTEND_ORIGIN")
    if legacy:
        return (legacy.strip(),)
    return ("http://localhost:5173", "http://127.0.0.1:5173")


def _configured_aoi_ids() -> tuple[str, ...]:
    raw = os.environ.get("EMBERLENS_AOI_IDS", "bangladesh-bd")
    values = tuple(dict.fromkeys(value.strip() for value in raw.split(",") if value.strip()))
    if not values:
        raise ValueError("EMBERLENS_AOI_IDS must contain at least one AOI identifier.")
    return values


@dataclass(frozen=True)
class Settings:
    frontend_origins: tuple[str, ...] = field(default_factory=_frontend_origins)
    aoi_ids: tuple[str, ...] = field(default_factory=_configured_aoi_ids)
    data_root: Path = field(default_factory=lambda: Path(os.environ.get("DATA_ROOT", str(PROJECT_ROOT / "data"))))
    db_path: Path = field(
        # National Bangladesh store (sole active database); EMBERLENS_DB can override.
        default_factory=lambda: Path(os.environ.get("EMBERLENS_DB", str(BACKEND_DIR / "emberlens-bangladesh.duckdb")))
    )
    app_name: str = "EMBERLENS"
    api_version: str = "v1"
    normalization_version: str = "canonical-v1"
    method_version: str = "calendar-v0"


def get_settings() -> Settings:
    return Settings()
