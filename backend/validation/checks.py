"""Schema / coordinate / time / duplicate checks (FR-02)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def check_coordinates(latitude: Any, longitude: Any) -> list[str]:
    errors: list[str] = []
    try:
        lat = float(latitude)
    except (TypeError, ValueError):
        return [f"latitude not numeric: {latitude!r}"]
    try:
        lon = float(longitude)
    except (TypeError, ValueError):
        return errors + [f"longitude not numeric: {longitude!r}"]
    if not (-90.0 <= lat <= 90.0):
        errors.append(f"latitude out of range [-90, 90]: {lat}")
    if not (-180.0 <= lon <= 180.0):
        errors.append(f"longitude out of range [-180, 180]: {lon}")
    return errors


def validate_row(row: dict[str, Any]) -> ValidationResult:
    errors = check_coordinates(row.get("latitude"), row.get("longitude"))
    if not row.get("acq_date_native"):
        errors.append("acq_date_native is required")
    return ValidationResult(ok=not errors, errors=errors)


def find_duplicates(fingerprints: list[str]) -> list[str]:
    seen: set[str] = set()
    dupes: list[str] = []
    for fp in fingerprints:
        if fp in seen and fp not in dupes:
            dupes.append(fp)
        seen.add(fp)
    return dupes
