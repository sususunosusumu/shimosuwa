(() => {
'use strict';
function parseLatLng(v){
  const nums=String(v||'').replace(/[，、]/g,',').match(/-?\d+(?:\.\d+)?/g);
  if(!nums||nums.length<2)return null;
  const lat=Number(nums[0]),lng=Number(nums[1]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)return null;
  return {lat,lng};
}
function applyValue(){
  const input=document.getElementById('coordPasteInput');
  const status=document.getElementById('coordPasteStatus');
  const c=parseLatLng(input?.value);
  if(!c){if(status)status.textContent='「36.07421951613529, 138.08072898627694」の形式で貼り付けてください。';return false;}
  const lat=document.getElementById('latitude'),lng=document.getElementById('longitude');
  if(lat)lat.value=String(c.lat);if(lng)lng.value=String(c.lng);
  if(status)status.innerHTML=`反映しました：<b>${c.lat}</b>, <b>${c.lng}</b>　→ 最後に「このブラウザに保存」を押してください。`;
  return true;
}
function inject(){
  if(document.getElementById('coordPasteBox'))return;
  const lat=document.getElementById('latitude');
  if(!lat)return;
  const section=lat.closest('.section');
  const lng=document.getElementById('longitude');
  const grid=lat.closest('.g2');
  if(!section||!grid||!lng)return;
  const box=document.createElement('div');
  box.id='coordPasteBox';
  box.style.cssText='margin-top:9px;padding:10px;border:1px solid #dfe7e3;border-radius:10px;background:#f8fbf9';
  box.innerHTML=`<label style="font-weight:800;color:#34434f">Google Maps 座標をそのまま貼り付け</label><div style="display:grid;grid-template-columns:1fr auto;gap:7px;align-items:end"><input id="coordPasteInput" placeholder="36.07421951613529, 138.08072898627694"><button id="coordPasteApply" type="button">座標を反映</button></div><div id="coordPasteStatus" class="sm" style="margin-top:5px">Google Mapsで地点を右クリックしてコピーした座標を、そのまま貼れます。</div>`;
  grid.insertAdjacentElement('afterend',box);
  const input=document.getElementById('coordPasteInput');
  document.getElementById('coordPasteApply').addEventListener('click',applyValue);
  input.addEventListener('paste',()=>setTimeout(()=>{if(parseLatLng(input.value))applyValue()},0));
  input.addEventListener('change',()=>{if(parseLatLng(input.value))applyValue()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
window.applyCoordinatePaste=applyValue;
})();