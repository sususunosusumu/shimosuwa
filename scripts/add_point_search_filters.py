from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

if 'v4.7' in s and 'pointNameSearch' in s:
    print('v4.7 search filters already applied')
    raise SystemExit(0)
if 'v4.6' not in s:
    raise SystemExit('Expected v4.6 index.html')

s = s.replace('v4.6', 'v4.7')
s = s.replace('.point-tools{display:grid;grid-template-columns:2fr 1fr auto;', '.point-tools{display:grid;grid-template-columns:1.6fr 1.4fr 1fr auto;')

old_ui = '''<div class="point-tools"><div><label>検索</label><input id="pointSearch" placeholder="名称・カテゴリで検索" oninput="renderPointManager()"></div><div><label>種類</label><select id="pointType" onchange="renderPointManager()"><option value="all">すべて</option><option value="place">Place</option><option value="bus">バス停</option></select></div><div><button class="alt" onclick="exportPointOverrides()">編集内容を書き出す</button></div></div>'''
new_ui = '''<div class="point-tools"><div><label>名称を検索</label><input id="pointNameSearch" placeholder="例：秋宮、セブンイレブン、足湯" oninput="renderPointManager()"></div><div><label>カテゴリを検索</label><input id="pointCategorySearch" list="pointCategoryList" placeholder="例：公園、足湯、コンビニ、公衆トイレ" oninput="renderPointManager()"><datalist id="pointCategoryList"></datalist></div><div><label>種類</label><select id="pointType" onchange="renderPointManager()"><option value="all">すべて</option><option value="place">Place</option><option value="bus">バス停</option></select></div><div><button class="alt" onclick="clearPointFilters()">検索クリア</button><button class="alt" onclick="exportPointOverrides()">編集内容を書き出す</button></div></div>'''
if old_ui not in s:
    raise SystemExit('Point search UI not found')
s = s.replace(old_ui, new_ui)

old_fn = '''function renderPointManager(){if(!$('pointBody'))return;let q=($('pointSearch').value||'').toLowerCase(),type=$('pointType').value,rows=[];P.forEach((p,i)=>rows.push({source:'place',i,name:p['名称'],cat:p['カテゴリ']||p['種別'],lat:p.latitude,lng:p.longitude,status:p['座標ステータス']||''}));B.forEach((b,i)=>rows.push({source:'bus',i,name:b.stop_name,cat:b.bus_system||'GTFS',lat:b.latitude,lng:b.longitude,status:b.manual_edit?'手動編集':'GTFS'}));rows=rows.filter(r=>(type==='all'||r.source===type)&&(!q||(r.name+' '+r.cat).toLowerCase().includes(q)));$('pointCount').textContent=`表示 ${rows.length}件 / Place ${P.length}件 / バス停 ${B.length}件`;'''
new_fn = '''function renderPointManager(){if(!$('pointBody'))return;let nq=($('pointNameSearch')?.value||'').trim().toLowerCase(),cq=($('pointCategorySearch')?.value||'').trim().toLowerCase(),type=$('pointType').value,rows=[];P.forEach((p,i)=>rows.push({source:'place',i,name:p['名称'],cat:p['カテゴリ']||p['種別'],lat:p.latitude,lng:p.longitude,status:p['座標ステータス']||''}));B.forEach((b,i)=>rows.push({source:'bus',i,name:b.stop_name,cat:b.bus_system||'GTFS',lat:b.latitude,lng:b.longitude,status:b.manual_edit?'手動編集':'GTFS'}));let dl=$('pointCategoryList');if(dl){let cats=[...new Set(rows.map(r=>r.cat).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ja'));dl.innerHTML=cats.map(c=>`<option value="${esc(c)}"></option>`).join('')}rows=rows.filter(r=>(type==='all'||r.source===type)&&(!nq||String(r.name||'').toLowerCase().includes(nq))&&(!cq||String(r.cat||'').toLowerCase().includes(cq)));$('pointCount').textContent=`表示 ${rows.length}件 / Place ${P.length}件 / バス停 ${B.length}件`;'''
if old_fn not in s:
    raise SystemExit('renderPointManager prefix not found')
s = s.replace(old_fn, new_fn)

# Add filter clear helper before renderPointManager.
needle = 'function renderPointManager(){'
helper = "function clearPointFilters(){if($('pointNameSearch'))$('pointNameSearch').value='';if($('pointCategorySearch'))$('pointCategorySearch').value='';if($('pointType'))$('pointType').value='all';renderPointManager()}"
s = s.replace(needle, helper + needle, 1)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.7 with separate name/category filters')
