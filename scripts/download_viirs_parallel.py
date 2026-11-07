#!/usr/bin/env python3
"""Shard-safe VIIRS_SNPP_SP downloader for the Bangladesh national snapshot.

Downloads ONE shard of the frozen plan (data/processed/download_chunks/
viirs_shard_plan.json) with ONE authorized FIRMS MAP_KEY. Both shards are
disjoint by construction (parity split of the same frozen list) and each key
is gated against its own 5,000 transactions / 10-minute window independently,
verified via the live mapkey_status endpoint before every batch.

- Checkpoints use the project's standard format
  (data/processed/download_chunks/VIIRS_SNPP_SP/<start>_<end>.csv), written
  atomically, so a later `python scripts/ingest.py --download` assembles the
  raw CSV, validates it, and writes the manifest unchanged.
- Keys are never printed; HTTP/API errors report exception type names only.
- Not idempotent-safe across concurrent invocations on the SAME shard: launch
  exactly one process per shard, shard 0 and shard 1 only.

Usage:
  python scripts/download_viirs_parallel.py --shard 0            # key from .env (NASA_FIRMS_MAP_KEY)
  python scripts/download_viirs_parallel.py --shard 1 --key-file C:/path/to/keyb.txt
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import importlib.util

spec = importlib.util.spec_from_file_location("firms_ingest", ROOT / "scripts" / "ingest.py")
INGEST = importlib.util.module_from_spec(spec)
spec.loader.exec_module(INGEST)  # loads .env via scripts/ingest.py's load_env()

PRODUCT_ID = "VIIRS_SNPP_SP"
DEFAULT_PLAN = INGEST.PROC_DIR / "download_chunks" / "viirs_shard_plan.json"
CKPT_DIR = INGEST.PROC_DIR / "download_chunks" / PRODUCT_ID


def read_key(args) -> str:
    if args.key_file:
        key = Path(args.key_file).read_text(encoding="utf-8").strip()
    else:
        key = os.environ.get(args.key_env, "").strip()
    if not key:
        print("ERROR: no key provided (env var or --key-file).", file=sys.stderr)
        raise SystemExit(2)
    return key


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--shard", required=True, type=int, choices=[0, 1])
    ap.add_argument("--plan", default=str(DEFAULT_PLAN))
    ap.add_argument("--key-env", default="NASA_FIRMS_MAP_KEY")
    ap.add_argument("--key-file", default=None)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=100)
    args = ap.parse_args()

    key = read_key(args)  # never printed
    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    assert plan["product_id"] == PRODUCT_ID
    shard_ranges = [tuple(t) for t in plan["shards"][str(args.shard)]]
    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    pending_before = [(s, e) for s, e in shard_ranges if not (CKPT_DIR / f"{s}_{e}.csv").exists()]
    print(f"shard {args.shard}: plan={len(shard_ranges)} ranges, "
          f"already checkpointed={len(shard_ranges) - len(pending_before)}, "
          f"to download={len(pending_before)}, workers={args.workers}", flush=True)

    prod = next(p for p in INGEST.PRODUCTS if p["product_id"] == PRODUCT_ID)

    def fetch_range(s, e):
        """Mirror ingest.py's dense-request handling, minus printing the URL/key."""
        bb = INGEST.AOI["bbox"]
        days = (date.fromisoformat(e) - date.fromisoformat(s)).days + 1
        body, status = INGEST.download_chunk(
            INGEST._area_url(key, PRODUCT_ID, bb, min(days, 5) if days else 1, s))
        if status == "ok":
            return [(s, e, body)], []
        if status.startswith("http_400") and b"Exceeding" in body and days > 1:
            out, errs = [], []
            cur = date.fromisoformat(s)
            while cur <= date.fromisoformat(e):
                ds = cur.isoformat()
                parts, sub = fetch_range(ds, ds)
                out.extend(parts)
                errs.extend(sub)
                cur += timedelta(days=1)
            return out, errs
        return [], [(s, e, status, body[:200])]

    failed: list[tuple] = []
    for batch_start in range(0, len(pending_before), args.batch_size):
        batch = pending_before[batch_start:batch_start + args.batch_size]
        estimated_cost = 3 * sum((date.fromisoformat(e) - date.fromisoformat(s)).days + 1 for s, e in batch)
        while True:
            try:
                used, limit = INGEST._mapkey_usage(key)
            except Exception:
                used, limit = 0, 0
            if limit and used + estimated_cost <= limit:
                break
            print(f"shard {args.shard}: quota at {used}/{limit or 'unknown'} transactions; waiting 10m…", flush=True)
            time.sleep(610)
        done = batch_start + len(batch)
        print(f"shard {args.shard}: downloading {batch_start + 1}-{done} of {len(pending_before)}", flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(fetch_range, s, e): (s, e) for s, e in batch}
            for fut in as_completed(futs):
                s, e = futs[fut]
                parts, errs = fut.result()
                if errs:
                    failed.extend(errs)
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
                INGEST.atomic_write(CKPT_DIR / f"{s}_{e}.csv", [("\n".join(lines_out) + "\n").encode()])
    if failed:
        for s, e, status, preview in sorted(failed)[:5]:
            print(f"shard {args.shard} ERROR {s}..{e} -> {status}: {preview!r}", flush=True)
        print(f"shard {args.shard}: {len(failed)} range(s) failed; checkpoints preserved — fix and rerun this shard.", flush=True)
        return 3
    done_now = sum(1 for s, e in shard_ranges if (CKPT_DIR / f"{s}_{e}.csv").exists())
    print(f"shard {args.shard}: OK — {done_now}/{len(shard_ranges)} assigned ranges checkpointed", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
