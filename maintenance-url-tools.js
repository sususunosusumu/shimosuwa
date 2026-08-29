(() => {
'use strict';
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
    status.textContent='Google Maps URLは保存できますが、このURL内には緯度経度が見つかりません。短縮URLの場合は、座標の直接貼り付け欄も使ってください。';
  }
}
function openUrl(id){const v=document.getElementById(id)?.value.trim();if(validHttpUrl(v))window.open(v,'_blank','noopener')}
function inject(){
  if(document.getElementById('placeUrlBox'))return;
  const lat=document.getElementById('latitude');if(!lat)return;const section=lat.closest('.section');if(!section)return;
  const box=document.createElement('div');box.id='placeUrlBox';box.style.cssText='margin-top:10px;padding:11px;border:1px solid #dfe5e8;border-radius:10px;background:#fbfcfc';
  box.innerHTML=`<div style="font-weight:800;margin-bottom:8px">Web・Google Maps</div><div class="g2"><div><label>公式WebページURL</label><input id="公式WebページURL" type="url" placeholder="https://..."><button type="button" class="alt" id="openOfficial" style="margin-top:5px">公式ページを開く</button></div><div><label>Google Maps 地点URL</label><input id="GoogleマップURL_確定" type="url" placeholder="https://www.google.com/maps/..."><div class="row" style="margin-top:5px"><button type="button" id="applyMapUrl">URLを保存・座標を反映</button><button type="button" class="alt" id="openMapUrl">Google Mapsを開く</button></div></div></div><div id="mapUrlStatus" class="sm" style="margin-top:6px">通常のGoogle Maps URLに <code>@36...,138...</code> または <code>!3d36...!4d138...</code> が含まれていれば、URL貼り付けから座標も自動入力します。</div>`;
  section.appendChild(box);
  document.getElementById('applyMapUrl').onclick=applyGoogleUrl;document.getElementById('openOfficial').onclick=()=>openUrl('公式WebページURL');document.getElementById('openMapUrl').onclick=()=>openUrl('GoogleマップURL_確定');
  const g=document.getElementById('GoogleマップURL_確定');g.addEventListener('paste',()=>setTimeout(()=>{if(g.value.trim())applyGoogleUrl()},0));
  document.addEventListener('place-maintenance-selected',ev=>{const p=ev.detail||{};document.getElementById('公式WebページURL').value=p['公式WebページURL']||p['公式URL']||p['Webサイト']||'';document.getElementById('GoogleマップURL_確定').value=p['GoogleマップURL_確定']||'';document.getElementById('mapUrlStatus').textContent=p['GoogleマップURL_確定']?'登録済みのGoogle Maps URLがあります。':'Google Mapsの地点URLを登録できます。'});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
window.applyGoogleMapsUrl=applyGoogleUrl;window.parseGoogleMapsCoordinates=parseGoogleUrl;
})();