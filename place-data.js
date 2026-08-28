(function(){
'use strict';
const BASE_FILES=['data/places.csv','data/places_extra.csv','data/places_services.csv'];
const ATTR_FILES=['data/place_attributes_web_landmarks.csv','data/place_attributes_web_restaurants_1.csv','data/place_attributes_web_restaurants_2.csv'];
const MANAGEMENT_FILE='data/place_management.csv';
function parseCSV(text){
  text=(text||'').replace(/^\uFEFF/,'');
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted && text[i+1]==='"'){field+='"';i++;} else quoted=!quoted;
    } else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);field=''; if(row.some(v=>v!==''))rows.push(row); row=[];
    } else field+=c;
  }
  if(field||row.length){row.push(field);if(row.some(v=>v!==''))rows.push(row);}
  if(!rows.length)return[];
  const head=rows.shift().map(x=>x.trim());
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
}
function csvCell(v){v=String(v??'');return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function toCSV(rows,headers){return '\uFEFF'+headers.map(csvCell).join(',')+'\r\n'+rows.map(r=>headers.map(h=>csvCell(r[h])).join(',')).join('\r\n')+'\r\n';}
function truthy(v){return ['yes','true','○','1','on','積極','通常'].includes(String(v||'').trim().toLowerCase())||String(v||'').trim()==='○';}
function no(v){return ['no','false','×','0','off'].includes(String(v||'').trim().toLowerCase())||String(v||'').trim()==='×';}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function lat(p){return num(p.latitude||p.lat,0)}
function lng(p){return num(p.longitude||p.lng,0)}
function hasCoord(p){return !!(lat(p)&&lng(p));}
function keyOf(p){return String(p.place_id||p['名称']||'').trim();}
function mergeRows(base,patch){
  const m=new Map();
  for(const p of base){const k=keyOf(p);if(k)m.set(k,{...p});}
  for(const p of patch){const k=keyOf(p);if(!k)continue;const old=m.get(k)||{};const merged={...old};for(const [a,v] of Object.entries(p)){if(v!==''&&v!=null)merged[a]=v;}m.set(k,merged);}
  return [...m.values()];
}
function defaultManagement(p){
  const text=((p['種別']||'')+' '+(p['カテゴリ']||'')+' '+(p['サブカテゴリ']||'')).toLowerCase();
  let level='normal',score='3';
  if(/コンビニ|スーパー|公衆トイレ|行政|医療|駐車場|レンタサイクル|生活サービス/.test(text)){level='conditional';score='2';}
  if(/神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|足湯|観光|文化|自然/.test(text)){level='normal';score='4';}
  if(/鉄道駅|交通ハブ/.test(text)){level='conditional';score='3';}
  return {'おすすめ度':score,'自動提案':level,'おすすめ時間帯':'','対象':'','除外条件':'','公開メモ':'','運営メモ':'','管理更新日':''};
}
function applyManagementDefaults(rows){return rows.map(p=>({...defaultManagement(p),...p}));}
async function fetchText(path){try{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});return r.ok?await r.text():'';}catch(e){return'';}}
async function loadAll(){
  const baseTexts=await Promise.all(BASE_FILES.map(fetchText));
  const attrTexts=await Promise.all(ATTR_FILES.map(fetchText));
  const managementText=await fetchText(MANAGEMENT_FILE);
  let places=baseTexts.flatMap(parseCSV);
  places=mergeRows(places,attrTexts.flatMap(parseCSV));
  places=mergeRows(places,parseCSV(managementText));
  places=applyManagementDefaults(places);
  return {places,management:parseCSV(managementText),files:{base:BASE_FILES,attributes:ATTR_FILES,management:MANAGEMENT_FILE}};
}
function managementHeaders(){return ['place_id','名称','おすすめ度','自動提案','おすすめ用途','おすすめ時間帯','対象','除外条件','公開メモ','運営メモ','管理更新日','営業日_override','営業時間_override','定休日_override','朝食向き_override','おやつ向き_override','昼食向き_override','夕食向き_override','休憩向き_override','観光向き_override','買い物向き_override','雨の日向き_override','子ども向き_override','高齢者向き_override','一人向き_override','短時間立寄り向き_override','最短滞在時間_分_override','推奨滞在時間_分_override','最大滞在時間_分_override'];}
function effective(p,name){const o=p[name+'_override'];return o!==undefined&&o!==''?o:(p[name]??'');}
function autoLevel(p){return String(p['自動提案']||'normal');}
function recommendation(p){return Math.max(1,Math.min(5,num(p['おすすめ度'],3)));}
window.PlaceData={parseCSV,toCSV,truthy,no,num,lat,lng,hasCoord,keyOf,mergeRows,loadAll,managementHeaders,effective,autoLevel,recommendation,defaultManagement};
})();