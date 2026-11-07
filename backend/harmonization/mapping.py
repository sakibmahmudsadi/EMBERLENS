"""Source-to-canonical mapping v1 (FIRMS MODIS + VIIRS active-fire CSVs).

Scientific rules enforced here:
- confidence_raw + confidence_semantics kept separate per sensor; no universal
  confidence_0_100 is ever fabricated.
- UTC timestamp normalized while native date/time fields are preserved.
- sensor/platform vocabulary normalized, source strings retained.
- deterministic fingerprint scoped to product/version (see fingerprinter).
- no cross-sensor deduplication; exact duplicates only within a product snapshot.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from backend.validation.checks import validate_row

NORMALIZATION_VERSION = "canonical-v1"
FINGERPRINT_ALGO = "sha256-v1"

# Controlled vocabularies — source strings are preserved alongside.
SENSOR_VOCAB = {"MODIS": "MODIS", "VIIRS": "VIIRS"}
PLATFORM_ALIASES = {
    "terra": "Terra",
    "aqua": "Aqua",
    # FIRMS VIIRS SP country/area exports encode Suomi-NPP as "N" (verified
    # in data/raw/VIIRS_SNPP_SP_*.csv, 2026-11-06; see D-26 fix).
    "n": "Suomi-NPP",
    "suomi-npp": "Suomi-NPP",
    "s-npp": "Suomi-NPP",
    "snpp": "Suomi-NPP",
    "noaa-20": "NOAA-20",
    "noaa20": "NOAA-20",
    "noaa-21": "NOAA-21",
    "noaa21": "NOAA-21",
}

# Confidence semantics per sensor — never equated numerically.
CONFIDENCE_SEMANTICS = {
    "MODIS": "numeric_score_0_100_source_native",
    "VIIRS": "categorical_class_source_native",
}

# Native column -> canonical field, per product family. Verify against the
# exact downloaded product files + product guides before production use.
MODIS_FIELDS = {
    "latitude": "latitude",
    "longitude": "longitude",
    "brightness": "brightness_primary_native",
    "scan": "scan_native",
    "track": "track_native",
    "acq_date": "acq_date_native",
    "acq_time": "acq_time_native",
    "satellite": "platform",
    "confidence": "confidence_raw",
    "version": "collection_version",
    "bright_ti4": "brightness_secondary_native",
    "frp": "frp_native",
    "daynight": "daynight_native",
}
VIIRS_FIELDS = {
    "latitude": "latitude",
    "longitude": "longitude",
    # VIIRS 375m SP exports carry bright_ti4 (primary 3.7um) + bright_ti5,
    # NOT MODIS 'brightness'. D-26 fix (verified 2026-11-06).
    "bright_ti4": "brightness_primary_native",
    "bright_ti5": "brightness_secondary_native",
    "scan": "scan_native",
    "track": "track_native",
    "acq_date": "acq_date_native",
    "acq_time": "acq_time_native",
    "satellite": "platform",
    "confidence": "confidence_raw",
    "version": "collection_version",
    "frp": "frp_native",
    "daynight": "daynight_native",
}
FIELD_MAPS = {"MODIS": MODIS_FIELDS, "VIIRS": VIIRS_FIELDS}


def normalize_platform(raw: str) -> str:
    return PLATFORM_ALIASES.get(raw.strip().lower(), raw.strip())


def normalize_sensor(raw: str) -> str:
    key = raw.strip().upper()
    if key not in SENSOR_VOCAB:
        raise ValueError(f"Unsupported sensor: {raw!r} (expected MODIS or VIIRS)")
    return SENSOR_VOCAB[key]


def parse_acquired_at_utc(acq_date: str, acq_time: Any) -> datetime:
    """FIRMS acq_date is YYYY-MM-DD; acq_time is HHMM (e.g. 325 -> 03:25 UTC)."""
    if not acq_date:
        raise ValueError("acq_date is required")
    date = datetime.strptime(acq_date.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    t = str(acq_time).strip() if acq_time is not None else "0"
    if t in ("", "None"):
        t = "0"
    # D-14 fix: strict HHMM — never silently truncate >4 digits.
    if not t.isdigit() or len(t) > 4:
        raise ValueError(f"Invalid acq_time: {acq_time!r} (expected 1-4 digit HHMM)")
    t = t.zfill(4)
    hh, mm = int(t[:2]), int(t[2:4])
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise ValueError(f"Invalid acq_time: {acq_time!r}")
    return date.replace(hour=hh, minute=mm, second=0, microsecond=0)


def fingerprint(*, product_id: str, collection_version: str | None, row: dict[str, Any]) -> str:
    """Deterministic fingerprint scoped to product/version.

    Uses the full source row so a changed coordinate/date is a different row.
    Coordinates alone are never identity.
    """
    parts = [product_id, collection_version or ""]
    for key in sorted(row):
        parts.append(f"{key}={row[key]}")
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return f"{FINGERPRINT_ALGO}:{digest}"


@dataclass
class CanonicalObservation:
    observation_id: str
    source_snapshot_id: str
    source_row_fingerprint: str
    source_record_id: str | None
    provider: str
    product_id: str
    collection_version: str | None
    processing_level: str | None
    sensor: str
    platform: str
    instrument: str | None
    acquired_at_utc: datetime
    acq_date_native: str
    acq_time_native: str | None
    latitude: float
    longitude: float
    brightness_primary_native: float | None
    brightness_secondary_native: float | None
    frp_native: float | None
    frp_unit_native: str | None
    frp_mw: float | None
    confidence_raw: Any
    confidence_semantics: str
    confidence_class_native: str | None
    daynight_native: str | None
    scan_native: float | None
    track_native: float | None
    source_attributes: dict[str, Any] = field(default_factory=dict)
    ingested_at_utc: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    normalization_version: str = NORMALIZATION_VERSION


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def map_row(
    source_row: dict[str, Any],
    *,
    sensor: str,
    product_id: str,
    source_snapshot_id: str,
    provider: str = "NASA FIRMS",
    collection_version: str | None = None,
    processing_level: str | None = None,
    instrument: str | None = None,
    frp_unit_native: str | None = None,
    frp_mw: float | None = None,
) -> CanonicalObservation:
    """Map one raw FIRMS row into the canonical schema. Raises on invalid data."""
    sensor = normalize_sensor(sensor)
    fmap = FIELD_MAPS[sensor]
    canonical: dict[str, Any] = {}
    source_attrs: dict[str, Any] = {}
    for native, target in fmap.items():
        if native in source_row:
            canonical[target] = source_row[native]
        else:
            source_attrs[native] = source_row.get(native)
    # Anything not mapped stays in source_attributes (source stays authoritative).
    mapped_native = set(fmap)
    for key, value in source_row.items():
        if key not in mapped_native:
            source_attrs[key] = value

    validate_row(
        {
            "latitude": canonical.get("latitude"),
            "longitude": canonical.get("longitude"),
            "acq_date_native": canonical.get("acq_date_native"),
        }
    )

    platform_raw = str(canonical.get("platform", ""))
    confidence_raw = canonical.get("confidence_raw")
    semantics = CONFIDENCE_SEMANTICS[sensor]
    confidence_class = None
    if sensor == "VIIRS" and confidence_raw is not None:
        confidence_class = str(confidence_raw)

    acquired = parse_acquired_at_utc(str(canonical["acq_date_native"]), canonical.get("acq_time_native"))
    fp = fingerprint(product_id=product_id, collection_version=collection_version, row=dict(source_row))
    # D-12 fix: observation identity is per (snapshot, row) — identical rows
    # loaded under two snapshots must BOTH survive (no cross-snapshot loss).
    obs_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_snapshot_id}|{fp}"))
    return CanonicalObservation(
        observation_id=obs_id,
        source_snapshot_id=source_snapshot_id,
        source_row_fingerprint=fp,
        source_record_id=None,  # FIRMS CSVs supply no upstream unique ID
        provider=provider,
        product_id=product_id,
        collection_version=collection_version,
        processing_level=processing_level,
        sensor=sensor,
        platform=normalize_platform(platform_raw),
        instrument=instrument,
        acquired_at_utc=acquired,
        acq_date_native=str(canonical["acq_date_native"]),
        acq_time_native=(None if canonical.get("acq_time_native") is None else str(canonical["acq_time_native"])),
        latitude=float(canonical["latitude"]),
        longitude=float(canonical["longitude"]),
        brightness_primary_native=_to_float(canonical.get("brightness_primary_native")),
        brightness_secondary_native=_to_float(canonical.get("brightness_secondary_native")),
        frp_native=_to_float(canonical.get("frp_native")),
        frp_unit_native=frp_unit_native,
        frp_mw=frp_mw,
        confidence_raw=confidence_raw,
        confidence_semantics=semantics,
        confidence_class_native=confidence_class,
        daynight_native=canonical.get("daynight_native"),
        scan_native=_to_float(canonical.get("scan_native")),
        track_native=_to_float(canonical.get("track_native")),
        source_attributes=source_attrs,
    )


def deduplicate(rows: list[CanonicalObservation]) -> tuple[list[CanonicalObservation], int]:
    """Exact dedup within one product snapshot scope (fingerprint equality)."""
    seen: dict[str, CanonicalObservation] = {}
    dups = 0
    for r in rows:
        if r.source_row_fingerprint in seen:
            dups += 1
        else:
            seen[r.source_row_fingerprint] = r
    return list(seen.values()), dups
