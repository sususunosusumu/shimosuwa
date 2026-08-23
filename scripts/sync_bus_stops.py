#!/usr/bin/env python3
import csv
import io
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/sususunosusumu/SHIMOSUWA-LAB/main/GTFS/shimosuwa_azami_swan_merged_gtfs_v6.zip"
OUT = ROOT / "data" / "bus_stops_corrected.json"
INDEX = ROOT / "index.html"

OLD_LOADER = "async function loadTransitStops(){const u='https://raw.githubusercontent.com/sususunosusumu/SHIMOSUWA-LAB/main/GTFS/ccby4_shimosuwa_suwa_all_routes_gtfs.zip',r=await fetch(u);if(!r.ok)throw Error('GTFS '+r.status);let z=await JSZip.loadAsync(await r.arrayBuffer()),f=z.file('stops.txt');if(!f)throw Error('GTFS stops.txt がありません');return parseCSV(await f.async('string')).map((x,i)=>({uid:x.stop_id||String(i),stop_id:x.stop_id||String(i),stop_name:x.stop_name||'',latitude:+x.stop_lat,longitude:+x.stop_lon,bus_system:'GTFS'})).filter(x=>x.stop_name&&Number.isFinite(x.latitude)&&Number.isFinite(x.longitude))}"

NEW_LOADER = "async function loadTransitStops(){const r=await fetch('data/bus_stops_corrected.json',{cache:'no-store'});if(!r.ok)throw Error('bus_stops_corrected.json '+r.status);const j=await r.json();if(!Array.isArray(j))throw Error('補正済みバス停データの形式が不正です');return j.filter(x=>x.stop_name&&Number.isFinite(+x.latitude)&&Number.isFinite(+x.longitude))}"


def export_stops():
    with urllib.request.urlopen(SOURCE, timeout=30) as response:
        payload = response.read()

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        text = zf.read("stops.txt").decode("utf-8-sig")

    stops = []
    for row in csv.DictReader(io.StringIO(text)):
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


def patch_index():
    text = INDEX.read_text(encoding="utf-8")
    original = text
    text = text.replace("下諏訪 時間プランナー v3.9", "下諏訪 時間プランナー v4.0")
    text = text.replace('<span class="ver">v3.9</span>', '<span class="ver">v4.0</span>')
    text = text.replace(
        "● Place　・ 小さい点はGTFSのあざみ号／スワンバス停。徒歩時間は現在、直線距離＋補正の概算です。",
        "● Place　・ 小さい点は補正済みGTFS（real_json）のあざみ号／スワンバス停。徒歩時間は現在、直線距離＋補正の概算です。",
    )
    if OLD_LOADER in text:
        text = text.replace(OLD_LOADER, NEW_LOADER)
    elif NEW_LOADER not in text:
        raise RuntimeError("index.html の loadTransitStops が想定と異なります")
    if text != original:
        INDEX.write_text(text, encoding="utf-8")
        print("patched index.html to v4.0 corrected bus-stop source")
    else:
        print("index.html already patched")


def main():
    export_stops()
    patch_index()


if __name__ == "__main__":
    main()
