from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

# v4.4: bulk Google Places verification with confidence filtering.
if '一括自動補正' in s and 'v4.4' in s:
    print('v4.4 already patched')
    raise SystemExit(0)

if 'v4.3' not in s:
    raise SystemExit('Expected v4.3 index.html')
s = s.replace('v4.3', 'v4.4')

# Add bulk controls to the existing Google Places API area.
old = '''<div><button onclick="searchGooglePlaces()">Googleで候補検索</button><button class="alt" onclick="nextUnverifiedPlace()">次の未確認Place</button></div></div><div id="googleVerifyProgress" class="small" style="margin-top:8px"></div><div id="placesApiStatus" class="small" style="margin-top:5px"></div>'''
new = '''<div><button onclick="searchGooglePlaces()">Googleで候補検索</button><button class="alt" onclick="nextUnverifiedPlace()">次の未確認Place</button></div></div><div style="margin-top:10px;padding-top:10px;border-top:1px solid #e8ecef"><button onclick="bulkVerifyGooglePlaces()">未確認Placeを一括自動補正</button><button id="bulkStopBtn" class="alt" onclick="stopBulkVerify()" disabled>停止</button><div class="key-note">未確認Placeを順番に検索し、名称・住所・位置が十分一致する候補だけ自動確定します。曖昧な候補は未確認のまま残します。</div></div><div id="googleVerifyProgress" class="small" style="margin-top:8px"></div><div id="bulkVerifyStatus" class="small" style="margin-top:5px"></div><div id="placesApiStatus" class="small" style="margin-top:5px"></div>'''
if old not in s:
    raise SystemExit('Google Places controls not found')
s = s.replace(old, new)

# Add bulk verification helpers before the Google API loader declaration.
needle = 'let googlePlacesLoading=null,googleCandidateMarker=null;'
helpers = r'''let bulkVerifyRunning=false,bulkVerifyStopRequested=false;
function normPlaceText(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/[\s　・･,，.。\-ー_()（）\[\]「」『』]/g,'').replace(/株式会社|有限会社|合同会社|店$/g,'')}
function googleDisplayName(x){let v=x?.displayName;return typeof v==='string'?v:(v?.text||String(v||''))}
function candidateConfidence(p,x,resultCount=1,secondScore=null){let pn=normPlaceText(p['名称']),xn=normPlaceText(googleDisplayName(x)),score=0;if(pn&&xn){if(pn===xn)score+=60;else if(pn.includes(xn)||xn.includes(pn))score+=47;else{let chars=[...new Set(pn)].filter(c=>xn.includes(c)).length,den=Math.max(1,new Set([...pn]).size),ratio=chars/den;if(ratio>=.8)score+=35;else if(ratio>=.6)score+=20}}let ad=String(x?.formattedAddress||'');if(ad.includes('下諏訪町'))score+=22;else if(ad.includes('諏訪郡'))score+=8;else score-=18;let lat=x?.location?.lat?.(),lng=x?.location?.lng?.();if(Number.isFinite(lat)&&Number.isFinite(lng)&&p.latitude&&p.longitude){let km=dist({lat:+p.latitude,lng:+p.longitude},{lat,lng});if(km<=.25)score+=22;else if(km<=.7)score+=16;else if(km<=1.5)score+=10;else if(km<=3)score+=3;else score-=25}if(resultCount===1)score+=6;if(secondScore!==null&&score-secondScore>=18)score+=7;return score}
async function googleSearchForPlace(p,maxResultCount=5){await ensureGooglePlaces();const {Place}=await google.maps.importLibrary('places');let query=(p['名称']||'')+' '+(p['住所']||'')+' 下諏訪町 長野県';const {places}=await Place.searchByText({textQuery:query,fields:['id','displayName','formattedAddress','location','googleMapsURI'],language:'ja',region:'jp',maxResultCount});return places||[]}
function applyGoogleCandidateToPlace(p,x,status='Google Places確認済'){let lat=x?.location?.lat?.(),lng=x?.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng))return false;p.latitude=lat;p.longitude=lng;p['座標ステータス']=status;p['google_place_id']=x.id||'';p['Google確認住所']=x.formattedAddress||'';p['GoogleマップURL_確定']=x.googleMapsURI||p['Googleマップ検索URL']||'';localStorage.setItem(pinKey(p),JSON.stringify({lat,lng,url:p['GoogleマップURL_確定'],googlePlaceId:p['google_place_id'],formattedAddress:p['Google確認住所'],status}));return true}
function stopBulkVerify(){bulkVerifyStopRequested=true;$('bulkVerifyStatus').textContent='停止要求を受け付けました。現在の検索が終わったら停止します。'}
async function bulkVerifyGooglePlaces(){if(bulkVerifyRunning)return;let targets=P.map((p,i)=>({p,i})).filter(x=>!isGoogleVerified(x.p));if(!targets.length){$('bulkVerifyStatus').innerHTML='<span class="okmsg">未確認Placeはありません。</span>';return}try{await ensureGooglePlaces()}catch(e){$('bulkVerifyStatus').innerHTML='<span class="errmsg">'+esc(e.message||String(e))+'</span>';return}bulkVerifyRunning=true;bulkVerifyStopRequested=false;$('bulkStopBtn').disabled=false;let auto=0,review=0,notfound=0,errors=0,done=0;window.__bulkReviewIndices=[];$('bulkVerifyStatus').textContent=`一括確認を開始します。対象 ${targets.length}件`;for(const item of targets){if(bulkVerifyStopRequested)break;let p=item.p;try{$('bulkVerifyStatus').textContent=`${done+1}/${targets.length}　${p['名称']} を検索中…　自動確定 ${auto} / 要確認 ${review} / 見つからず ${notfound}`;let places=await googleSearchForPlace(p,5);if(!places.length){notfound++;window.__bulkReviewIndices.push(item.i)}else{let prelim=places.map(x=>({x,score:candidateConfidence(p,x,places.length,null)})).sort((a,b)=>b.score-a.score),best=prelim[0],second=prelim[1]?.score??null,bestScore=candidateConfidence(p,best.x,places.length,second);let exactTown=String(best.x.formattedAddress||'').includes('下諏訪町');let margin=second===null?99:bestScore-second;if(bestScore>=78&&exactTown&&(margin>=8||places.length===1)){if(applyGoogleCandidateToPlace(p,best.x,'Google Places自動確認済'))auto++;else{review++;window.__bulkReviewIndices.push(item.i)}}else{review++;window.__bulkReviewIndices.push(item.i);p['Google候補信頼度']=String(bestScore)}}}catch(e){console.error('bulk verify',p['名称'],e);errors++;window.__bulkReviewIndices.push(item.i)}done++;updateGoogleProgress();await new Promise(r=>setTimeout(r,180))}bulkVerifyRunning=false;$('bulkStopBtn').disabled=true;rebuild();let remaining=P.filter(p=>!isGoogleVerified(p)).length;$('bulkVerifyStatus').innerHTML=`<span class="okmsg">一括処理終了：</span> 自動確定 ${auto}件 / 要確認 ${review}件 / 見つからず ${notfound}件 / エラー ${errors}件 / 未確認残り ${remaining}件${bulkVerifyStopRequested?'（途中停止）':''}`;if(remaining){let idx=(window.__bulkReviewIndices||[]).find(i=>!isGoogleVerified(P[i]));if(idx!==undefined){$('gmPlace').value=String(idx);$('placesApiStatus').textContent='自動確定できなかったPlaceを残しています。「次の未確認Place」で確認できます。'}}}
'''
if needle not in s:
    raise SystemExit('Google API declaration not found')
s = s.replace(needle, helpers + needle)

# Use the shared apply function for manual candidate confirmation too.
old_apply = '''function applyGoogleCandidate(i){let currentIndex=+$('gmPlace').value,p=P[currentIndex],x=window.__googlePlaceCandidates?.[i];if(!p||!x)return;let lat=x.location?.lat?.(),lng=x.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng)){$('placesApiStatus').innerHTML='<span class="errmsg">候補の座標を取得できませんでした。</span>';return}p.latitude=lat;p.longitude=lng;p['座標ステータス']='Google Places確認済';p['google_place_id']=x.id||'';p['Google確認住所']=x.formattedAddress||'';p['GoogleマップURL_確定']=x.googleMapsURI||p['Googleマップ検索URL']||'';localStorage.setItem(pinKey(p),JSON.stringify({lat,lng,url:p['GoogleマップURL_確定'],googlePlaceId:p['google_place_id'],formattedAddress:p['Google確認住所'],status:'Google Places確認済'}));$('placesApiStatus').innerHTML='<span class="okmsg">'+esc(p['名称'])+' を確認しました。次の未確認Placeへ進みます。</span>';rebuild();map.setView([lat,lng],18);setTimeout(()=>nextUnverifiedPlace(currentIndex),450)}'''
new_apply = '''function applyGoogleCandidate(i){let currentIndex=+$('gmPlace').value,p=P[currentIndex],x=window.__googlePlaceCandidates?.[i];if(!p||!x)return;let lat=x.location?.lat?.(),lng=x.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng)){$('placesApiStatus').innerHTML='<span class="errmsg">候補の座標を取得できませんでした。</span>';return}if(!applyGoogleCandidateToPlace(p,x,'Google Places確認済'))return;$('placesApiStatus').innerHTML='<span class="okmsg">'+esc(p['名称'])+' を確認しました。次の未確認Placeへ進みます。</span>';rebuild();map.setView([lat,lng],18);setTimeout(()=>nextUnverifiedPlace(currentIndex),450)}'''
if old_apply not in s:
    raise SystemExit('manual apply function not found')
s = s.replace(old_apply, new_apply)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.4 bulk Google Places auto-correction')
