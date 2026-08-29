(() => {
'use strict';
if(window.PlaceData?.managementHeaders){const old=PlaceData.managementHeaders;PlaceData.managementHeaders=()=>{const h=old();for(const x of ['公式WebページURL','GoogleマップURL_確定','Googleマップ検索URL','google_place_id','Google確認住所'])if(!h.includes(x))h.splice(Math.min(8,h.length),0,x);return h}}
function validHttpUrl(v){try{const u=new URL(String(v||'').trim());return /^https?:$/.test(u.protocol)}catch(e){return false}}
function parsePair(v){const m=String(v||'').replace(/[，、]/g,',').match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{2,3}(?:\.\d+)?)/);if(!m)return null;const lat=+m[1],lng=+m[2];return lat>=-90&&lat<=90&&lng>=-180&&lng<=180?{lat,lng}:null}
function parseGoogleUrl(v){
  const s=String(v||'').trim();if(!s)return null;
  let m=s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);if(m)return{lat:+m[1],lng:+m[2]};
  m=s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);if(m)return{lat:+m[1],lng:+m[2]};
  try{const u=new URL(s);for(const k of ['query','q','ll','center']){const x=parsePair(decodeURIComponent(u.searchParams.get(k)||''));if(x)return x}}catch(e){}
  return null;
}
function selectedPlace(){try{return P.find(x=>PlaceData.keyOf(x)===selected)||null}catch(e){return null}}
function searchQuery(p){return [p?.['名称'],p?.['住所']||'長野県 下諏訪町'].filter(Boolean).join(' ')}
function generatedMapsUrl(p){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery(p))}`}
function generatedOfficialSearchUrl(p){return `https://www.google.com/search?q=${encodeURIComponent(searchQuery(p)+' 公式')}`}
function openSmall(url,name){if(!validHttpUrl(url))return;const w=Math.min(620,Math.max(430,Math.round(screen.availWidth*.42))),h=Math.min(820,Math.max(600,Math.round(screen.availHeight*.86))),left=Math.max(0,Math.round((screen.availWidth-w)/2)),top=Math.max(0,Math.round((screen.availHeight-h)/2));const pop=window.open(url,name||'shimosuwaWeb',`popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);if(!pop)window.open(url,'_blank','noopener');else try{pop.focus()}catch(e){}}
function applyGoogleUrl(){
  const input=document.getElementById('GoogleマップURL_確定'),status=document.getElementById('mapUrlStatus');if(!input)return;
  const url=input.value.trim();if(!url){status.textContent='Google Mapsの地点URLを貼り付けてください。';return}
  if(!validHttpUrl(url)){status.textContent='URLとして読み取れませんでした。';return}
  const c=parseGoogleUrl(url);
  if(c){
    document.getElementById('latitude').value=String(c.lat);document.getElementById('longitude').value=String(c.lng);
    const p=selectedPlace();if(p?.place_id)try{localStorage.setItem('gmap-pin:'+p.place_id,JSON.stringify({lat:c.lat,lng:c.lng,url,status:'Google Maps URL座標'}))}catch(e){}
    status.innerHTML=`Google Maps URLを保存し、座標も反映しました：<b>${c.lat}</b>, <b>${c.lng}</b>　→ 最後に「このブラウザに保存」を押してください。`;
  }else{
    status.textContent='Google Maps URLは保存できますが、このURL内には緯度経度が見つかりません。検索URLや短縮URLの場合は座標を直接入力してください。';
  }
}
function openUrl(id){const v=document.getElementById(id)?.value.trim();if(validHttpUrl(v))openSmall(v,id)}
function inject(){
  if(document.getElementById('placeUrlBox'))return;
  const lat=document.getElementById('latitude');if(!lat)return;const section=lat.closest('.section');if(!section)return;
  const box=document.createElement('div');box.id='placeUrlBox';box.style.cssText='margin-top:10px;padding:11px;border:1px solid #dfe5e8;border-radius:10px;background:#fbfcfc';
  box.innerHTML=`<div style="font-weight:800;margin-bottom:8px">Web・Google Maps</div><div class="g2"><div><label>公式WebページURL</label><input id="公式WebページURL" type="url" placeholder="https://..."><div class="row" style="margin-top:5px"><button type="button" class="alt" id="openOfficial">公式ページを開く</button><button type="button" class="alt" id="searchOfficial">公式Webを検索</button></div></div><div><label>Google Maps 地点URL</label><input id="GoogleマップURL_確定" type="url" placeholder="https://www.google.com/maps/..."><div class="row" style="margin-top:5px"><button type="button" id="applyMapUrl">URLを保存・座標を反映</button><button type="button" class="alt" id="openMapUrl">登録URLを開く</button><button type="button" class="alt" id="searchMapUrl">Google Mapsで探す</button></div></div></div><div id="mapUrlStatus" class="sm" style="margin-top:6px">URLが未登録でも「Google Mapsで探す」を押すと、地点名＋住所でGoogle Mapsを検索します。写真や口コミはGoogle Maps側で確認できます。</div>`;
  section.appendChild(box);
  document.getElementById('applyMapUrl').onclick=applyGoogleUrl;
  document.getElementById('openOfficial').onclick=()=>openUrl('公式WebページURL');
  document.getElementById('openMapUrl').onclick=()=>{const p=selectedPlace(),v=document.getElementById('GoogleマップURL_確定')?.value.trim();openSmall(validHttpUrl(v)?v:generatedMapsUrl(p),'shimosuwaGooglePlace')};
  document.getElementById('searchMapUrl').onclick=()=>openSmall(generatedMapsUrl(selectedPlace()),'shimosuwaGooglePlace');
  document.getElementById('searchOfficial').onclick=()=>openSmall(generatedOfficialSearchUrl(selectedPlace()),'shimosuwaOfficialSearch');
  const g=document.getElementById('GoogleマップURL_確定');g.addEventListener('paste',()=>setTimeout(()=>{if(g.value.trim())applyGoogleUrl()},0));
  document.addEventListener('place-maintenance-selected',ev=>{const p=ev.detail||{};document.getElementById('公式WebページURL').value=p['公式WebページURL']||p['公式URL']||p['Webサイト']||'';document.getElementById('GoogleマップURL_確定').value=p['GoogleマップURL_確定']||'';document.getElementById('mapUrlStatus').textContent=p['GoogleマップURL_確定']?'登録済みのGoogle Maps URLがあります。':'URL未登録です。Google Mapsと公式Webは名称＋住所からその場で検索できます。';});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
window.applyGoogleMapsUrl=applyGoogleUrl;window.parseGoogleMapsCoordinates=parseGoogleUrl;
})();