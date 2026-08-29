(() => {
'use strict';
const KEY='shimosuwa-google-maps-api-key';
let loading=null,running=false,stopRequested=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function esc2(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function inject(){
  const aside=document.querySelector('aside.p'); if(!aside||document.getElementById('coordRecoveryBox'))return;
  const box=document.createElement('div');box.id='coordRecoveryBox';box.style.cssText='margin-top:10px;padding:10px;border:1px solid #dfe7e3;border-radius:11px;background:#f8fbf9';
  box.innerHTML=`<b style="font-size:13px">座標データ復元</b><div id="legacyCoordStatus" class="sm" style="margin-top:5px">確認中...</div><button class="alt" style="margin-top:7px" onclick="reloadLegacyCoordinates()">旧Google座標を再読込</button><details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;font-weight:800">Google Placesで未取得を再検索</summary><div style="margin-top:7px"><label>Google Maps APIキー</label><input id="mgApiKey" type="password" placeholder="Google Maps Platform API key"><div class="sm">以前このブラウザで使ったキーが残っていれば自動表示します。キーはGitHubには保存しません。</div></div><div class="row" style="margin-top:7px"><button onclick="bulkRefreshGoogleCoordinates()">未座標を一括再取得</button><button id="mgStop" class="alt" onclick="stopGoogleCoordinateRefresh()" disabled>停止</button></div><div id="mgStatus" class="sm" style="margin-top:6px"></div></details>`;
  const count=document.getElementById('count');aside.insertBefore(box,count||aside.lastChild);
  const key=document.getElementById('mgApiKey');try{key.value=localStorage.getItem(KEY)||''}catch(e){}key.addEventListener('change',()=>{try{localStorage.setItem(KEY,key.value.trim())}catch(e){}});
  updateRecoveryStatus();
}
async function updateRecoveryStatus(){
  const e=document.getElementById('legacyCoordStatus');if(!e)return;
  try{const {places,legacyStats}=await PlaceData.loadAll();const s=legacyStats||{};e.innerHTML=`全${places.length}件 / 座標あり <b>${places.filter(PlaceData.hasCoord).length}</b>件 / 未取得 <b>${places.filter(p=>!PlaceData.hasCoord(p)).length}</b>件<br>旧ブラウザ保存から復元：Google ${s.googlePins||0}件・手動 ${s.manualEdits||0}件・住所検索 ${s.addressCache||0}件`;}
  catch(err){e.textContent='復元状況を確認できませんでした: '+err.message}
}
window.reloadLegacyCoordinates=async function(){
  try{const r=await PlaceData.loadAll();BASE=r.places;applyLocal();renderList();if(selected)selectPlace(selected);updateRecoveryStatus();}
  catch(e){alert('再読込できませんでした: '+e.message)}
};
async function ensureGoogle(){
  if(window.google?.maps?.importLibrary)return;
  if(loading)return loading;
  const input=document.getElementById('mgApiKey'),key=(input?.value||'').trim();if(!key)throw Error('Google Maps APIキーを入力してください');
  try{localStorage.setItem(KEY,key)}catch(e){}
  loading=new Promise((resolve,reject)=>{const old=document.getElementById('mg-google-js');if(old)old.remove();const s=document.createElement('script');s.id='mg-google-js';s.async=true;s.defer=true;s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&loading=async&libraries=places';s.onload=resolve;s.onerror=()=>{loading=null;reject(Error('Google Maps JavaScript APIを読み込めませんでした。API設定を確認してください'))};document.head.appendChild(s)});
  return loading;
}
function norm(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/[\s　・･,，.。\-ー_()（）\[\]「」『』]/g,'').replace(/株式会社|有限会社|合同会社|店$/g,'')}
function displayName(x){const v=x?.displayName;return typeof v==='string'?v:(v?.text||String(v||''))}
function score(p,x){const a=norm(p['名称']),b=norm(displayName(x));let s=0;if(a&&b){if(a===b)s+=60;else if(a.includes(b)||b.includes(a))s+=46;else{const hit=[...new Set(a)].filter(c=>b.includes(c)).length/Math.max(1,new Set([...a]).size);if(hit>=.8)s+=34;else if(hit>=.6)s+=20}}const ad=String(x?.formattedAddress||'');if(ad.includes('下諏訪町'))s+=25;else if(ad.includes('諏訪郡'))s+=10;else s-=20;return s}
async function searchOne(p){
  await ensureGoogle();const {Place}=await google.maps.importLibrary('places');const q=[p['名称'],p['住所'],'下諏訪町 長野県'].filter(Boolean).join(' ');const {places}=await Place.searchByText({textQuery:q,fields:['id','displayName','formattedAddress','location','googleMapsURI'],language:'ja',region:'jp',maxResultCount:5});if(!places?.length)return null;const ranked=places.map(x=>({x,s:score(p,x)})).sort((a,b)=>b.s-a.s);const best=ranked[0];if(best.s<65||!String(best.x.formattedAddress||'').includes('下諏訪町'))return null;return best.x;
}
function saveGoogle(p,x){const lat=x.location?.lat?.(),lng=x.location?.lng?.();if(!Number.isFinite(lat)||!Number.isFinite(lng))return false;p.latitude=lat;p.longitude=lng;p['座標ステータス']='Google Places再取得';p['座標情報源']='Google Places API';p.google_place_id=x.id||'';p['Google確認住所']=x.formattedAddress||'';p['GoogleマップURL_確定']=x.googleMapsURI||p['Googleマップ検索URL']||'';try{localStorage.setItem('gmap-pin:'+p.place_id,JSON.stringify({lat,lng,url:p['GoogleマップURL_確定'],googlePlaceId:p.google_place_id,formattedAddress:p['Google確認住所'],status:'Google Places再取得'}))}catch(e){}const b=BASE.find(v=>PlaceData.keyOf(v)===PlaceData.keyOf(p));if(b)Object.assign(b,p);return true}
window.stopGoogleCoordinateRefresh=function(){stopRequested=true;const s=document.getElementById('mgStatus');if(s)s.textContent='停止要求を受け付けました。現在の検索後に停止します。'};
window.bulkRefreshGoogleCoordinates=async function(){
  if(running)return;const status=document.getElementById('mgStatus'),btn=document.getElementById('mgStop');let targets=P.filter(p=>!PlaceData.hasCoord(p)&&p.place_id);if(!targets.length){status.textContent='未取得座標はありません。';return}
  try{await ensureGoogle()}catch(e){status.textContent=e.message;return}
  running=true;stopRequested=false;btn.disabled=false;let ok=0,review=0,err=0;
  for(let i=0;i<targets.length;i++){
    if(stopRequested)break;const p=targets[i];status.textContent=`${i+1}/${targets.length} ${p['名称']} を検索中…　取得 ${ok} / 要確認 ${review}`;
    try{const x=await searchOne(p);if(x&&saveGoogle(p,x))ok++;else review++;}catch(e){console.warn(e);err++;}await sleep(180);
  }
  running=false;btn.disabled=true;applyLocal();renderList();if(selected)selectPlace(selected);await updateRecoveryStatus();status.innerHTML=`再取得終了：<b>${ok}件</b>取得 / 要確認 ${review}件 / エラー ${err}件。<br>取得結果はブラウザに保存されています。「管理CSVを書き出す」でCSVにもできます。`;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();