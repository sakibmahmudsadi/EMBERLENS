#!/usr/bin/env python3
"""Capture FIRMS Standard-product missing-day evidence for the frozen window.

FIRMS' missing-data page lists source-service days/satellites missing from its
database. This is global source evidence, not AOI observation opportunity.
Only the Standard columns and registered MODIS/VIIRS SNPP platforms are stored.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import uuid
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.db.database import init_db  # noqa: E402

URL = "https://firms.modaps.eosdis.nasa.gov/api/missing_data/?action=fetch_data"
SOURCE_REF = "https://firms.modaps.eosdis.nasa.gov/api/missing_data/ (standard columns)"
START, END = date(2010, 1, 1), date(2026, 7, 31)
SATELLITES = {
    "Terra (MODIS)": ("MODIS_SP", "Terra"),
    "Aqua (MODIS)": ("MODIS_SP", "Aqua"),
    "Suomi NPP (VIIRS)": ("VIIRS_SNPP_SP", "Suomi-NPP"),
}


class TableRows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=None; self.cell=None
    def handle_starttag(self, tag, attrs):
        if tag == "tr": self.row=[]
        elif tag == "td" and self.row is not None: self.cell=[]
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data.strip())
    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join(x for x in self.cell if x)); self.cell=None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row); self.row=None


def fetch_rows():
    req=urllib.request.Request(URL, headers={"X-Requested-With":"XMLHttpRequest", "User-Agent":"EMBERLENS/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        payload=json.loads(response.read().decode("utf-8"))
    if not payload.get("success") or not isinstance(payload.get("html"), str):
        raise RuntimeError("FIRMS missing-data endpoint returned an invalid response")
    parser=TableRows(); parser.feed(payload["html"])
    result=set()
    for cells in parser.rows:
        if len(cells) < 2: continue
        raw_day, satellite = cells[0], cells[1]
        if satellite not in SATELLITES or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_day): continue
        day=date.fromisoformat(raw_day)
        if START <= day <= END:
            product, platform=SATELLITES[satellite]
            result.add((product,platform,raw_day))
    return sorted(result), int(payload.get("rowCount", len(parser.rows)))


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=str(ROOT/"backend"/"emberlens-bangladesh.duckdb"))
    args=ap.parse_args()
    records, source_row_count=fetch_rows()
    retrieved=datetime.now(timezone.utc)
    archive=ROOT/"data"/"processed"/"availability"; archive.mkdir(parents=True,exist_ok=True)
    artifact=archive/f"firms_missing_days_{retrieved:%Y%m%dT%H%M%SZ}.json"
    artifact.write_text(json.dumps({"source":URL,"retrieved_at_utc":retrieved.isoformat(),"window":{"start":START.isoformat(),"end_inclusive":END.isoformat()},"source_row_count":source_row_count,"filtered_standard_missing_days":[{"product_id":p,"platform":s,"date":d} for p,s,d in records]},indent=2)+"\n",encoding="utf-8")
    db=init_db(Path(args.db))
    try:
        db.conn.execute("BEGIN TRANSACTION")
        try:
            db.conn.execute("DELETE FROM data_availability WHERE source_reference = ?",[SOURCE_REF])
            for product,platform,day in records:
                db.insert_availability({"availability_id":uuid.uuid4().hex,"product_id":product,"platform":platform,"date_or_interval":day,"availability_status":"missing","source_reference":SOURCE_REF,"checked_at_utc":retrieved,"notes":"NASA FIRMS reports this global Standard-product satellite date missing from its database; not AOI observation opportunity."})
            db.conn.execute("COMMIT")
        except Exception:
            db.conn.execute("ROLLBACK"); raise
        print(f"stored {len(records)} standard missing-day records from {source_row_count} page rows; artifact={artifact.relative_to(ROOT)}")
    finally: db.close()


if __name__ == "__main__": main()
