#!/usr/bin/env python3
"""Idempotent NASA FIRMS raw ingestion for EMBERLENS Phase 1.

Usage
-----
Download (requires NASA_FIRMS_MAP_KEY in env or .env at project root):
    python scripts/ingest.py --download

Ingest manually supplied CSVs (no key needed — files already in data/raw/):
    python scripts/ingest.py --manual

Validate CSVs already in data/raw/ (checks columns, ranges, dates, dupes):
    python scripts/ingest.py --validate

Stdlib only. Never overwrites an existing raw file whose sha256 matches the
manifest — re-runs are no-ops. Raw files are written atomically (temp+rename).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# --- Frozen demo configuration (keep in sync with DATA_SOURCE_REGISTER.md) ---

ROOT = Path(__file__).resolve().parent.parent  # project root (for .env lookup)

def load_env() -> None:
    """Minimal .env loader (stdlib only): reads ROOT/.env, sets absent vars only."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if k and k not in os.environ:
            os.environ[k] = v


load_env()

AOI = {
    "aoi_id": "bangladesh-bd",
    "name": "Bangladesh (national bounding box; includes small out-of-country overhang)",
    "bbox": {"west": 88.0, "south": 20.5, "east": 92.7, "north": 26.7},
    "bbox_source": "Task-specified national bounding box (user-approved 2026-11-06); not an authoritative boundary and over-includes border-adjacent India/Myanmar",
    "crs": "EPSG:4326",
}
# Frozen common Standard Product window verified against FIRMS data_availability (2026-11-06):
# MODIS_SP 2000-11-01..2026-08-31; VIIRS_SNPP_SP 2012-01-20..2026-07-31.
# End is capped at the common VIIRS_SNPP_SP maximum; MODIS-only Aug-2026 is intentionally excluded.
WINDOW = {"start": "2010-01-01", "end": "2026-07-31"}  # National Bangladesh dataset 2010-present; user-requested 2026-11-06; replaces Sundarbans demo scope
PRODUCTS = [
    {
        "product_id": "MODIS_SP",
        "sensor": "MODIS",
        "platform": "Terra+Aqua (combined)",
        "processing_level": "Standard (science quality, SP)",
        "collection_version": "Collection 6.1 (MCD14IM / MCD14DL)",
        "chunk_days": 5,  # FIRMS area API day-range limit
    },
    {
        "product_id": "VIIRS_SNPP_SP",
        "sensor": "VIIRS",
        "platform": "Suomi-NPP",
        "available_from": "2012-01-20",
        "processing_level": "Standard (science quality, SP)",
        "collection_version": "VNP14IMGTDL_SP (375 m)",
        "chunk_days": 5,
    },
]
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov"
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROC_DIR = ROOT / "data" / "processed"
MANIFESTS = PROC_DIR / "manifests"
REPORTS = PROC_DIR / "validation"
EXPECTED_FILES = [
    RAW_DIR / "MODIS_SP_2010-01-01_2026-07-31_bangladesh-bd.csv",
    RAW_DIR / "VIIRS_SNPP_SP_2010-01-01_2026-07-31_bangladesh-bd.csv",
]
REQUIRED_COLUMNS = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "daynight"]
# Brightness is product-specific: MODIS uses 'brightness' (ti4), VIIRS 375m uses 'bright_ti4'
BRIGHTNESS_COLUMNS = ["brightness", "bright_ti4"]


def sha256_of(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def date_chunks(start: str, end: str, days: int):
    """Split an inclusive [start,end] range into <=days chunks (FIRMS area limit)."""
    from datetime import date, timedelta

    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    cur = s
    while cur <= e:
        nxt = min(cur + timedelta(days=days - 1), e)
        yield cur.isoformat(), nxt.isoformat(), days
        cur = nxt + timedelta(days=1)


def download_chunk(url: str) -> tuple[bytes, str]:
    """Return (chunk_bytes, status); chunk_bytes empty on HTTP error."""
    req = urllib.request.Request(url, headers={"User-Agent": "EMBERLENS-ingest/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read(), "ok"
    except urllib.error.HTTPError as ex:
        return ex.read()[:500], f"http_{ex.code}"
    except Exception as ex:  # noqa: BLE001
        return b"", f"error:{ex}"


def check_availability() -> dict:
    """Query FIRMS data-availability (needs key). Returns last available date per product."""
    report: dict = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "products": {}}
    key = os.environ.get("NASA_FIRMS_MAP_KEY", "")
    if not key:
        report["status"] = "BLOCKED — NASA_FIRMS_MAP_KEY absent; availability API requires a key (HTTP 401 verified 2026-11-06)"
        return report
    for p in PRODUCTS:
        url = f"{FIRMS_BASE}/api/data_availability/csv/{key}/{p['product_id']}/"
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                body = r.read().decode("utf-8", "replace")
            dates = [d[:10] for d in __import__("re").findall(r"20\d\d-\d\d-\d\d", body)]
            if not dates or "invalid map_key" in body.lower():
                report["products"][p["product_id"]] = {"status": "error: FIRMS did not return valid availability dates"}
            else:
                report["products"][p["product_id"]] = {"status": "ok", "latest_date_in_window_probe": max(dates)}
        except Exception as ex:  # noqa: BLE001
            # Exception messages can include request URLs; never log a MAP_KEY.
            report["products"][p["product_id"]] = {"status": f"error:{type(ex).__name__}"}
    report["status"] = "ok" if all(p["status"] == "ok" for p in report["products"].values()) else "error"
    return report


def validate_csv(path: Path) -> dict:
    """Run schema/range/date/duplicate checks. Returns pass/warn/fail counts and stats."""
    stats: dict = {
        "file": str(path.name),
        "checks": {"pass": 0, "warn": 0, "fail": 0},
        "issues": [],
        "row_count": 0,
        "sha256": sha256_of(path),
        "size_bytes": path.stat().st_size,
    }
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        missing = [c for c in REQUIRED_COLUMNS if c not in cols]
        if not any(c in cols for c in BRIGHTNESS_COLUMNS):
            missing.append("brightness(brightness|bright_ti4)")
        if missing:
            stats["checks"]["fail"] += 1
            stats["issues"].append(f"missing required columns: {missing}")
        else:
            stats["checks"]["pass"] += 1
        unexpected = [c for c in cols if c not in REQUIRED_COLUMNS]
        if unexpected:
            stats["checks"]["warn"] += 1
            stats["issues"].append(f"unexpected extra columns preserved: {unexpected}")
        lat_min = lat_max = lon_min = lon_max = None
        n_lat = n_lon = n_bad = n_dates = n_dupes = 0
        seen = set()
        for i, row in enumerate(reader):
            stats["row_count"] += 1
            try:
                lat = float(row["latitude"])
                n_lat += 1
                lat_min = lat if lat_min is None else min(lat_min, lat)
                lat_max = lat if lat_max is None else max(lat_max, lat)
            except (KeyError, TypeError, ValueError):
                n_bad += 1
            try:
                lon = float(row["longitude"])
                n_lon += 1
                lon_min = lon if lon_min is None else min(lon_min, lon)
                lon_max = lon if lon_max is None else max(lon_max, lon)
            except (KeyError, TypeError, ValueError):
                n_bad += 1
            if row.get("acq_date"):
                n_dates += 1
            key = tuple(row.get(c, "") for c in ["latitude", "longitude", "acq_date", "acq_time", "brightness", "frp"])
            if key in seen:
                n_dupes += 1
            seen.add(key)
    stats["lat_range"] = [lat_min, lat_max] if n_lat else None
    stats["lon_range"] = [lon_min, lon_max] if n_lon else None
    stats["bad_coords"] = n_bad
    stats["exact_duplicate_rows"] = n_dupes
    if n_bad:
        stats["checks"]["fail"] += 1
        stats["issues"].append(f"{n_bad} rows with unparseable latitude/longitude")
    else:
        stats["checks"]["pass"] += 1
    if n_dates != stats["row_count"] and stats["row_count"] > 0:
        stats["checks"]["warn"] += 1
        stats["issues"].append(f"{stats['row_count'] - n_dates} rows missing acq_date")
    else:
        stats["checks"]["pass"] += 1
    if n_dupes:
        stats["checks"]["warn"] += 1
        stats["issues"].append(f"{n_dupes} exact duplicate rows (kept; dedupe is a later stage)")
    else:
        stats["checks"]["pass"] += 1
    # AOI containment sanity (points may fall just outside bbox only on error)
    bb = AOI["bbox"]
    if n_lat and lat_min is not None:
        if not (bb["south"] - 0.01 <= lat_min and lat_max <= bb["north"] + 0.01):
            stats["checks"]["warn"] += 1
            stats["issues"].append("latitude range extends beyond AOI bbox (check FIRMS area semantics)")
        else:
            stats["checks"]["pass"] += 1
    stats["coverage_status"] = "no_records_returned_coverage_unverified" if stats["row_count"] == 0 else "records_present"
    return stats


def write_manifest(run_id: str, path: Path, product: dict, validation: dict, mode: str) -> Path:
    name = f"{run_id}_{path.stem}.json"
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source_snapshot_id": uuid.uuid4().hex[:12],
        "ingestion_run_id": run_id,
        "provider": "NASA FIRMS",
        "source_endpoint": f"{FIRMS_BASE}/api/area/csv/<MAP_KEY>/{product['product_id']}/<west>/<south>/<east>/<north>/<days>/<start>/<end>",
        "product_id": product["product_id"],
        "processing_level": product["processing_level"],
        "collection_version": product["collection_version"],
        "sensor": product["sensor"],
        "platform": product["platform"],
        "requested_aoi": AOI,
        "requested_start_utc": product.get("request_start", WINDOW["start"]),
        "requested_end_utc": WINDOW["end"],
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_file": str(path.relative_to(ROOT)),
        "sha256": validation["sha256"],
        "row_count": validation["row_count"],
        "ingestion_mode": mode,
        "validation_status": "passed" if validation["checks"]["fail"] == 0 else "failed",
        "validation": validation,
        "documentation_url": f"{FIRMS_BASE}/api/data_availability/",
        "documentation_checked_at": "2026-11-06",
    }
    out = MANIFESTS / name
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return out


def atomic_write(path: Path, chunks: list[bytes]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp-{uuid.uuid4().hex[:8]}")
    with open(tmp, "wb") as f:
        for ch in chunks:
            f.write(ch)
    tmp.rename(path)


def ingest_manual(run_id: str) -> list[Path]:
    """Ingest CSVs already present in data/raw/ (no key needed)."""
    out = []
    for p in EXPECTED_FILES:
        if not p.exists():
            print(f"  MISSING  {p.name} — see DATA_SOURCE_REGISTER.md for the manual request steps")
            continue
        v = validate_csv(p)
        m = write_manifest(run_id, p, next(pr for pr in PRODUCTS if pr["product_id"] in p.name), v, "manual")
        print(f"  INGESTED {p.name}  rows={v['row_count']}  sha256={v['sha256'][:12]}...  -> {m.name}")
        out.append(p)
    return out


def _area_url(key, prod_id, bb, days, s) -> str:
    return (f"{FIRMS_BASE}/api/area/csv/{key}/{prod_id}/"
            # FIRMS Area API accepts a day range plus its start date; the end
            # date is implied as start + days - 1. Appending an explicit end
            # path segment made otherwise valid requests fail with MAP_KEY errors.
            f"{bb['west']},{bb['south']},{bb['east']},{bb['north']}/{days}/{s}")


def _mapkey_usage(key: str) -> tuple[int, int]:
    """Return current transaction usage and limit without logging the secret URL."""
    url = f"https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={key}"
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return int(payload["current_transactions"]), int(payload["transaction_limit"])


def _fetch_chunk(args):
    (url, prod_id, s, e) = args
    body, status = download_chunk(url)
    return (prod_id, s, e, body, status)


def ingest_download(run_id: str, key: str, workers: int = 8) -> list[Path]:
    # Download in bounded batches to respect FIRMS' 5000-transaction/10min
    # key quota. Completed date ranges are checkpointed so a quota or network
    # interruption can resume without paying for successful requests again.
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import date, timedelta
    import shutil
    import time

    def _fetch_range(prod, s, e):
        """Fetch [s,e] (ISO dates); split to days when FIRMS limits us."""
        bb = AOI["bbox"]
        days = (date.fromisoformat(e) - date.fromisoformat(s)).days + 1
        body, status = download_chunk(_area_url(key, prod['product_id'], bb, min(days, 5) if days else 1, s))
        if status == "ok":
            return [(s, e, body)], []
        if status.startswith("http_400") and b"Exceeding" in body and days > 1:
            # split into single days and recurse
            out, errs = [], []
            cur = date.fromisoformat(s)
            while cur <= date.fromisoformat(e):
                ds = cur.isoformat()
                parts, sub = _fetch_range(prod, ds, ds)
                out.extend(parts)
                errs.extend(sub)
                cur += timedelta(days=1)
            return out, errs
        return [], [(s, e, status, body[:200])]

    out = []
    batch_size = 100  # conservative: dense national requests can cost several quota units per day
    for prod in PRODUCTS:
        target = RAW_DIR / f"{prod['product_id']}_{WINDOW['start']}_{WINDOW['end']}_bangladesh-bd.csv"
        if target.exists():
            print(f"  SKIP (exists) {target.name}")
            continue
        request_start = max(WINDOW["start"], prod.get("available_from", WINDOW["start"]))
        prod["request_start"] = request_start
        tasks = [(s, e) for s, e, _ in date_chunks(request_start, WINDOW["end"], prod["chunk_days"])]
        checkpoint_dir = PROC_DIR / "download_chunks" / prod["product_id"]
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        pending = [(s, e) for s, e in tasks if not (checkpoint_dir / f"{s}_{e}.csv").exists()]
        print(f"  {prod['product_id']}: {len(tasks)} ranges, {len(tasks)-len(pending)} checkpointed, {workers} workers", flush=True)

        for batch_start in range(0, len(pending), batch_size):
            batch = pending[batch_start:batch_start + batch_size]
            errors: list[tuple] = []
            # FIRMS can charge dense/long requests multiple transactions; use
            # 3x source-days as a safety margin and still verify live usage.
            estimated_cost = 3 * sum((date.fromisoformat(e) - date.fromisoformat(s)).days + 1 for s, e in batch)
            while True:
                try:
                    used, limit = _mapkey_usage(key)
                except Exception:
                    used, limit = 0, 0
                if limit and used + estimated_cost <= limit:
                    break
                print(f"  FIRMS quota window is at {used}/{limit or 'unknown'} transactions; waiting 10m…", flush=True)
                time.sleep(610)
            print(f"  {prod['product_id']}: downloading {batch_start+1}-{batch_start+len(batch)} of {len(pending)} pending ranges", flush=True)
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futs = {ex.submit(_fetch_range, prod, s, e): (s, e) for s, e in batch}
                for fut in as_completed(futs):
                    s, e = futs[fut]
                    parts, errs = fut.result()
                    errors.extend(errs)
                    if errs:
                        continue
                    lines_out: list[str] = []
                    for _, _, body in parts:
                        lines = body.decode("utf-8", "replace").splitlines()
                        if lines and lines[0].lower().startswith("latitude"):
                            if not lines_out:
                                lines_out.append(lines[0])
                            lines_out.extend(line for line in lines[1:] if line.strip())
                        else:
                            lines_out.extend(line for line in lines if line.strip())
                    # Header-only is a valid empty day-range response.
                    atomic_write(checkpoint_dir / f"{s}_{e}.csv", [("\n".join(lines_out) + "\n").encode()])
            if errors:
                for s, e, status, preview in sorted(errors)[:5]:
                    # FIRMS error bodies are safe; never print a request URL or MAP_KEY.
                    print(f"  ERROR  {prod['product_id']} {s}..{e} -> {status}: {preview!r}", flush=True)
                print(f"  {len(errors)} range(s) failed. Successful ranges are checkpointed; fix the cause and rerun to resume.", flush=True)
                return out

        chunks: list[bytes] = []
        for s, e in tasks:
            path = checkpoint_dir / f"{s}_{e}.csv"
            lines = path.read_text(encoding="utf-8").splitlines()
            if chunks and lines and lines[0].lower().startswith("latitude"):
                chunks.extend((ln + "\n").encode() for ln in lines[1:] if ln.strip())
            else:
                chunks.extend((ln + "\n").encode() for ln in lines if ln.strip())
        atomic_write(target, chunks)
        v = validate_csv(target)
        m = write_manifest(run_id, target, prod, v, "firms-api-download")
        print(f"  DOWNLOADED {target.name} rows={v['row_count']} sha256={v['sha256'][:12]}... -> {m.name}")
        out.append(target)
        shutil.rmtree(checkpoint_dir)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--download", action="store_true", help="download via FIRMS area API (needs NASA_FIRMS_MAP_KEY)")
    ap.add_argument("--manual", action="store_true", help="ingest CSVs already in data/raw/")
    ap.add_argument("--validate", action="store_true", help="validate CSVs in data/raw/ and write a validation report")
    args = ap.parse_args()

    run_id = f"ingest-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:6]}"
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if args.download:
        key = os.environ.get("NASA_FIRMS_MAP_KEY", "")
        if not key:
            print("ERROR: --download needs NASA_FIRMS_MAP_KEY in env or project .env. "
                  "Register free at https://firms.modaps.eosdis.nasa.gov/api/map_key/", file=sys.stderr)
            return 2
        avail = check_availability()
        print(f"Availability check: {avail.get('status')}", flush=True)
        if avail.get("status") != "ok":
            try:
                used, limit = _mapkey_usage(key)
            except Exception:
                used, limit = 0, 0
            if limit and used + 10 >= limit:
                print("FIRMS key quota is exhausted; waiting 10m before rechecking…", flush=True)
                import time
                time.sleep(610)
                avail = check_availability()
                print(f"Availability recheck: {avail.get('status')}", flush=True)
            if avail.get("status") != "ok":
                print("ERROR: FIRMS availability could not be verified; check the NASA_FIRMS_MAP_KEY and retry.", file=sys.stderr)
                return 2
        ingest_download(run_id, key)
    elif args.manual:
        ingest_manual(run_id)
    elif args.validate:
        REPORTS.mkdir(parents=True, exist_ok=True)
        report = {"ingestion_run_id": run_id, "generated_at_utc": datetime.now(timezone.utc).isoformat(), "files": []}
        for p in EXPECTED_FILES:
            if p.exists():
                v = validate_csv(p)
                report["files"].append(v)
                print(f"  {p.name}: rows={v['row_count']} pass={v['checks']['pass']} warn={v['checks']['warn']} "
                      f"fail={v['checks']['fail']} {v.get('issues', v['issues'] if isinstance(v,dict) else [])}")
            else:
                report["files"].append({"file": p.name, "status": "ABSENT — no CSV in data/raw/; manual request required"})
                print(f"  ABSENT {p.name} (expected — FIRMS key required; see DATA_SOURCE_REGISTER.md)")
        (REPORTS / f"validation_{run_id}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    else:
        ap.print_help()
        return 2
    print(f"Run {run_id} complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
