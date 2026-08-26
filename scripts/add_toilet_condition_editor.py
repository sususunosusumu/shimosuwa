from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

if 'id="dToiletCondition"' in s and 'v4.8' in s:
    print('v4.8 already patched')
    raise SystemExit(0)
if 'v4.7' not in s:
    raise SystemExit('Expected v4.7 index.html')
s = s.replace('v4.7', 'v4.8')

needle = '<div><label>多目的トイレ</label><input id="dAccessibleToilet" placeholder="例：オストメイト・ベビーベッド"></div>'
repl = needle + '<div><label>トイレ利用条件</label><input id="dToiletCondition" placeholder="例：店舗営業時間内のみ / 24時間 / 利用時間要確認"></div>'
if needle not in s:
    raise SystemExit('toilet detail field marker not found')
s = s.replace(needle, repl, 1)

needle = "$('dAccessibleToilet').value=p['多目的トイレ']||'';"
repl = needle + "$('dToiletCondition').value=p['トイレ利用条件']||'';"
if needle not in s:
    raise SystemExit('openPlaceDetail toilet marker not found')
s = s.replace(needle, repl, 1)

needle = "'多目的トイレ':$('dAccessibleToilet').value.trim(),'自転車貸出'"
repl = "'多目的トイレ':$('dAccessibleToilet').value.trim(),'トイレ利用条件':$('dToiletCondition').value.trim(),'自転車貸出'"
if needle not in s:
    raise SystemExit('detailValues marker not found')
s = s.replace(needle, repl, 1)

needle = "'多目的トイレ','自転車貸出','営業時間_曜日別'"
repl = "'多目的トイレ','トイレ利用条件','自転車貸出','営業時間_曜日別'"
if needle not in s:
    raise SystemExit('Google attribute persist field list marker not found')
s = s.replace(needle, repl, 1)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.8 with toilet usage condition editor')
