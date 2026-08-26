from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

# v4.5: direct latitude/longitude paste for Places that Google search cannot resolve.
if '緯度経度を直接入力' in s and 'v4.5' in s:
    print('v4.5 already patched')
    raise SystemExit(0)

if 'v4.4' not in s:
    raise SystemExit('Expected v4.4 index.html')
s = s.replace('v4.4', 'v4.5')

# Treat a coordinate manually copied from Google Maps as a completed location verification.
old_verified = "function isGoogleVerified(p){return !!(p&&(p['座標ステータス']==='Google Places確認済'||p['google_place_id']))}"
new_verified = "function isGoogleVerified(p){return !!(p&&(p['座標ステータス']==='Google Places確認済'||p['座標ステータス']==='Google Places自動確認済'||p['座標ステータス']==='Google Maps座標確認済'||p['google_place_id']))}"
if old_verified not in s:
    raise SystemExit('isGoogleVerified function not found')
s = s.replace(old_verified, new_verified)

# Add coordinate paste UI between Google candidate results and the legacy Google Maps URL tool.
needle = '''<div id="placesApiResults" class="api-results"></div></div><details style="margin-top:12px"><summary>Google Maps URLから手動補正（予備）</summary>'''
replacement = '''<div id="placesApiResults" class="api-results"></div></div><div class="api-box"><b>緯度経度を直接入力</b><div class="small" style="margin-top:5px">Google Mapsで地点を右クリックしてコピーした緯度経度を、そのまま貼り付けられます。</div><div class="g" style="margin-top:8px"><div><label>緯度, 経度</label><input id="manualLatLng" placeholder="36.10676547583541, 138.15904218528112"></div><div style="align-self:end"><button class="alt" onclick="previewManualLatLng()">地図でプレビュー</button><button onclick="applyManualLatLng()">この座標で確定して次へ</button></div></div><div id="manualLatLngStatus" class="small" style="margin-top:6px"></div></div><details style="margin-top:12px"><summary>Google Maps URLから手動補正（予備）</summary>'''
if needle not in s:
    raise SystemExit('Google result/manual URL boundary not found')
s = s.replace(needle, replacement)

# Add parser, preview, and apply functions before the legacy Google Maps URL parser.
js_needle = "function parseGoogleCoords(u){"
js = r'''let manualCoordMarker=null;function parseManualLatLng(v){let nums=String(v||'').replace(/[，、]/g,',').match(/-?\d+(?:\.\d+)?/g);if(!nums||nums.length<2)return null;let lat=+nums[0],lng=+nums[1];if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return null;return{lat,lng}}function previewManualLatLng(){let p=P[+$('gmPlace').value],c=parseManualLatLng($('manualLatLng').value);if(!p){$('manualLatLngStatus').innerHTML='<span class="errmsg">Placeを選択してください。</span>';return}if(!c){$('manualLatLngStatus').innerHTML='<span class="errmsg">「緯度, 経度」の形式で入力してください。</span>';return}if(manualCoordMarker)map.removeLayer(manualCoordMarker);manualCoordMarker=L.circleMarker([c.lat,c.lng],{radius:11,weight:3,fillOpacity:.18}).addTo(map).bindPopup('手動座標候補: '+esc(p['名称'])).openPopup();map.setView([c.lat,c.lng],18);$('manualLatLngStatus').textContent=`${p['名称']} の候補位置：${c.lat.toFixed(8)}, ${c.lng.toFixed(8)}` }function applyManualLatLng(){let currentIndex=+$('gmPlace').value,p=P[currentIndex],c=parseManualLatLng($('manualLatLng').value);if(!p){$('manualLatLngStatus').innerHTML='<span class="errmsg">Placeを選択してください。</span>';return}if(!c){$('manualLatLngStatus').innerHTML='<span class="errmsg">緯度経度を読み取れません。例：36.10676547583541, 138.15904218528112</span>';return}p.latitude=c.lat;p.longitude=c.lng;p['座標ステータス']='Google Maps座標確認済';p['座標情報源']='Google Maps右クリック座標';localStorage.setItem(pinKey(p),JSON.stringify({lat:c.lat,lng:c.lng,url:p['GoogleマップURL_確定']||p['Googleマップ検索URL']||'',googlePlaceId:p['google_place_id']||'',formattedAddress:p['Google確認住所']||'',status:'Google Maps座標確認済'}));$('manualLatLngStatus').innerHTML='<span class="okmsg">'+esc(p['名称'])+' を '+c.lat.toFixed(8)+', '+c.lng.toFixed(8)+' で確定しました。</span>';if(manualCoordMarker){map.removeLayer(manualCoordMarker);manualCoordMarker=null}rebuild();map.setView([c.lat,c.lng],18);$('manualLatLng').value='';setTimeout(()=>nextUnverifiedPlace(currentIndex),450)}'''
if js_needle not in s:
    raise SystemExit('parseGoogleCoords function not found')
s = s.replace(js_needle, js + js_needle)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.5 direct coordinate paste')
