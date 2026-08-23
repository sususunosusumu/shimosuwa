from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

# v4.3: sequential Google Places verification workflow.
if '次の未確認Place' in s and 'v4.3' in s:
    print('v4.3 already patched')
    raise SystemExit(0)

s = s.replace('v4.2', 'v4.3')

# Add the sequential button and progress display beside Google candidate search.
old = '''<div><button onclick="searchGooglePlaces()">Googleで候補検索</button></div></div><div id="placesApiStatus" class="small" style="margin-top:8px"></div>'''
new = '''<div><button onclick="searchGooglePlaces()">Googleで候補検索</button><button class="alt" onclick="nextUnverifiedPlace()">次の未確認Place</button></div></div><div id="googleVerifyProgress" class="small" style="margin-top:8px"></div><div id="placesApiStatus" class="small" style="margin-top:5px"></div>'''
if old not in s:
    raise SystemExit('Google Places control block not found')
s = s.replace(old, new)

# Add helper functions immediately before the existing Google API loader declarations.
needle = '''let googlePlacesLoading=null,googleCandidateMarker=null;'''
helpers = r'''function isGoogleVerified(p){return !!(p&&(p['座標ステータス']==='Google Places確認済'||p['google_place_id']))}function updateGoogleProgress(){let el=$('googleVerifyProgress');if(!el)return;let done=P.filter(isGoogleVerified).length,total=P.length,left=total-done;el.textContent=`Google確認済 ${done} / ${total}件　・　未確認 ${left}件`}async function nextUnverifiedPlace(startAfter=null){if(!P.length)return;let current=Number.isFinite(startAfter)?startAfter:+($('gmPlace').value||-1),next=-1;for(let step=1;step<=P.length;step++){let i=(current+step+P.length)%P.length;if(!isGoogleVerified(P[i])){next=i;break}}if(next<0){$('placesApiStatus').innerHTML='<span class="okmsg">すべてのPlaceがGoogle確認済みです。</span>';updateGoogleProgress();return}$('gmPlace').value=String(next);let p=P[next];$('placesApiStatus').textContent=`次の未確認Place：${p['名称']}。Google候補を自動検索します。`;await searchGooglePlaces()}'''
if needle not in s:
    raise SystemExit('Google API declaration not found')
s = s.replace(needle, helpers + needle)

# Preserve the current Place selection across rebuilds and refresh verification progress.
old_rebuild = '''$('gmPlace').innerHTML=P.map((p,i)=>`<option value="${i}">${esc(p['名称'])} — ${esc(p['座標ステータス']||'')}</option>`).join('');$('status').textContent=`Places ${P.length}件（座標あり ${P.filter(p=>p.latitude&&p.longitude).length}件） / GTFSバス停 ${B.length}地点`;renderPointManager()}'''
new_rebuild = '''let gmCurrent=$('gmPlace').value;$('gmPlace').innerHTML=P.map((p,i)=>`<option value="${i}">${isGoogleVerified(p)?'✓ ':''}${esc(p['名称'])} — ${esc(p['座標ステータス']||'')}</option>`).join('');if(gmCurrent!==''&&P[+gmCurrent])$('gmPlace').value=gmCurrent;$('status').textContent=`Places ${P.length}件（座標あり ${P.filter(p=>p.latitude&&p.longitude).length}件） / GTFSバス停 ${B.length}地点`;updateGoogleProgress();renderPointManager()}'''
if old_rebuild not in s:
    raise SystemExit('rebuild Google select block not found')
s = s.replace(old_rebuild, new_rebuild)

# After confirming one candidate, automatically move to and search the next unverified Place.
old_apply = '''function applyGoogleCandidate(i){let p=P[+$('gmPlace').value],x=window.__googlePlaceCandidates?.[i];if(!p||!x)return;let lat=x.location?.lat?.(),lng=x.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng)){$('placesApiStatus').innerHTML='<span class="errmsg">候補の座標を取得できませんでした。</span>';return}p.latitude=lat;p.longitude=lng;p['座標ステータス']='Google Places確認済';p['google_place_id']=x.id||'';p['Google確認住所']=x.formattedAddress||'';p['GoogleマップURL_確定']=x.googleMapsURI||p['Googleマップ検索URL']||'';localStorage.setItem(pinKey(p),JSON.stringify({lat,lng,url:p['GoogleマップURL_確定'],googlePlaceId:p['google_place_id'],formattedAddress:p['Google確認住所'],status:'Google Places確認済'}));$('placesApiStatus').innerHTML='<span class="okmsg">'+esc(p['名称'])+' を '+lat.toFixed(6)+', '+lng.toFixed(6)+' に補正しました。</span>';rebuild();map.setView([lat,lng],18)}'''
new_apply = '''function applyGoogleCandidate(i){let currentIndex=+$('gmPlace').value,p=P[currentIndex],x=window.__googlePlaceCandidates?.[i];if(!p||!x)return;let lat=x.location?.lat?.(),lng=x.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng)){$('placesApiStatus').innerHTML='<span class="errmsg">候補の座標を取得できませんでした。</span>';return}p.latitude=lat;p.longitude=lng;p['座標ステータス']='Google Places確認済';p['google_place_id']=x.id||'';p['Google確認住所']=x.formattedAddress||'';p['GoogleマップURL_確定']=x.googleMapsURI||p['Googleマップ検索URL']||'';localStorage.setItem(pinKey(p),JSON.stringify({lat,lng,url:p['GoogleマップURL_確定'],googlePlaceId:p['google_place_id'],formattedAddress:p['Google確認住所'],status:'Google Places確認済'}));$('placesApiStatus').innerHTML='<span class="okmsg">'+esc(p['名称'])+' を確認しました。次の未確認Placeへ進みます。</span>';rebuild();map.setView([lat,lng],18);setTimeout(()=>nextUnverifiedPlace(currentIndex),450)}'''
if old_apply not in s:
    raise SystemExit('applyGoogleCandidate function not found')
s = s.replace(old_apply, new_apply)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.3 sequential Google Places verification')
