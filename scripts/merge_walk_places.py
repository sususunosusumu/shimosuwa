from pathlib import Path
import csv

root = Path(__file__).resolve().parents[1]
services = root / 'data' / 'places_services.csv'
walk = root / 'data' / 'places_walk.csv'

with services.open(encoding='utf-8-sig', newline='') as f:
    base = list(csv.DictReader(f))
with walk.open(encoding='utf-8-sig', newline='') as f:
    extra = list(csv.DictReader(f))

if not base:
    raise SystemExit('places_services.csv is empty')

fields = list(base[0].keys())
for r in extra:
    for k in r:
        if k not in fields:
            fields.append(k)

by_id = {r.get('place_id'): r for r in base if r.get('place_id')}
order = [r.get('place_id') for r in base if r.get('place_id')]
for r in extra:
    pid = r.get('place_id')
    if not pid:
        continue
    if pid not in by_id:
        order.append(pid)
    old = by_id.get(pid, {})
    merged = dict(old)
    merged.update({k: v for k, v in r.items() if v != ''})
    by_id[pid] = merged

with services.open('w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    w.writeheader()
    for pid in order:
        w.writerow({k: by_id[pid].get(k, '') for k in fields})

print(f'merged {len(extra)} walking/footbath places into services; total {len(order)}')
