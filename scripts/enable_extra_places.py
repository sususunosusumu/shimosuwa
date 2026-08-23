#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "index.html"
s = p.read_text(encoding="utf-8")

s = s.replace("v4.0", "v4.1")

old = "Promise.all([fetch('data/places.csv').then(r=>{if(!r.ok)throw Error('places.csv '+r.status);return r.text()}),loadTransitStops()]).then(([t,b])=>{P=parseCSV(t);B=b;applyCache();applyEdits();rebuild();"
new = "Promise.all([fetch('data/places.csv').then(r=>{if(!r.ok)throw Error('places.csv '+r.status);return r.text()}),fetch('data/places_extra.csv').then(r=>r.ok?r.text():''),loadTransitStops()]).then(([t,te,b])=>{P=parseCSV(t).concat(te?parseCSV(te):[]);B=b;applyCache();applyEdits();rebuild();"

if old in s:
    s = s.replace(old, new)
elif "fetch('data/places_extra.csv')" not in s:
    raise SystemExit("Could not find the expected Places loader in index.html")

p.write_text(s, encoding="utf-8")
print("Enabled places_extra.csv in index.html")
