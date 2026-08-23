#!/usr/bin/env python3
import csv
import io
import json
import urllib.request
import zipfile
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/sususunosusumu/SHIMOSUWA-LAB/main/GTFS/shimosuwa_azami_swan_merged_gtfs_v6.zip"
OUT = Path(__file__).resolve().parents[1] / "data" / "bus_stops_corrected.json"


def main():
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        payload = response.read()

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        text = zf.read("stops.txt").decode("utf-8-sig")

    rows = csv.DictReader(io.StringIO(text))
    stops = []
    for row in rows:
        source = (row.get("location_source") or "").strip()
        lat = (row.get("stop_lat") or "").strip()
        lon = (row.get("stop_lon") or "").strip()
        if not source.startswith("real_json") or not lat or not lon:
            continue
        stop_id = (row.get("stop_id") or "").strip()
        stops.append({
            "stop_id": stop_id,
            "uid": stop_id,
            "stop_name": (row.get("stop_name") or "").strip(),
            "latitude": float(lat),
            "longitude": float(lon),
            "bus_system": "あざみ号" if stop_id.startswith("AZAMI_") else "スワンバス",
            "location_source": source,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(stops, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(stops)} corrected bus stops to {OUT}")


if __name__ == "__main__":
    main()
