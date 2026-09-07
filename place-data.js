(function(){
'use strict';
const BASE_FILES=['data/places.csv','data/places_extra.csv','data/places_services.csv'];
const ATTR_FILES=['data/place_attributes_web_landmarks.csv','data/place_attributes_web_restaurants_1.csv','data/place_attributes_web_restaurants_2.csv'];
const MANAGEMENT_FILE='data/place_management.csv';
const LOCAL_EDITS_STORE='shimosuwa_place_management_edits_v1';
const LOCAL_NEW_STORE='shimosuwa_place_new_v1';
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

const WEEKDAYS=['月','火','水','木','金','土','日'];
function hydrateStructuredSchedule(p){
  const hasDay=WEEKDAYS.some(d=>String(p['営業_'+d]??'').trim()!=='');
  if(hasDay){
    const open=WEEKDAYS.filter(d=>truthy(p['営業_'+d]));
    const closed=WEEKDAYS.filter(d=>!open.includes(d));
    p['営業日_override']=open.length===7?'毎日':open.join('・');
    p['定休日_override']=closed.join('・');
  }
  const ranges=[];
  for(let i=1;i<=3;i++){
    const a=String(p['営業時間'+i+'_開始']??'').trim();
    const b=String(p['営業時間'+i+'_終了']??'').trim();
    if(a&&b)ranges.push(a+'-'+b);
  }
  if(ranges.length)p['営業時間_override']=ranges.join(' / ');
  return p;
}
function applyLocalMaintenance(rows){
  let out=[...rows];
  try{
    const added=JSON.parse(localStorage.getItem(LOCAL_NEW_STORE)||'[]');
    if(Array.isArray(added)&&added.length)out=mergeRows(out,added);
  }catch(e){}
  try{
    const edits=JSON.parse(localStorage.getItem(LOCAL_EDITS_STORE)||'{}');
    if(edits&&typeof edits==='object'){
      out=out.map(p=>({...p,...(edits[keyOf(p)]||{})}));
    }
  }catch(e){}
  return out.map(hydrateStructuredSchedule);
}

function inferStructuredFromLegacy(p){
  // Weekdays: derive structured flags only when they are not already explicitly stored.
  const existingDayFlags=WEEKDAYS.some(d=>String(p['営業_'+d]??'').trim()!=='');
  if(!existingDayFlags){
    const days=String(effective(p,'営業日')||'').trim();
    const closed=String(effective(p,'定休日')||'').trim();
    if(days){
      for(const d of WEEKDAYS){
        let open=true;
        if(days==='毎日') open=true;
        else if(days==='平日') open=!['土','日'].includes(d);
        else open=days.includes(d);
        if(closed&&closed.includes(d))open=false;
        p['営業_'+d]=open?'yes':'no';
      }
    }
  }

  // Hours: derive up to 3 structured ranges from the legacy hours string.
  const hasRanges=[1,2,3].some(i=>String(p['営業時間'+i+'_開始']??'').trim()||String(p['営業時間'+i+'_終了']??'').trim());
  if(!hasRanges){
    const hours=String(effective(p,'営業時間')||'');
    const ranges=[...hours.matchAll(/(\d{1,2}:\d{2})\s*(?:-|〜|～)\s*(\d{1,2}:\d{2})/g)].slice(0,3);
    ranges.forEach((m,i)=>{
      p['営業時間'+(i+1)+'_開始']=m[1];
      p['営業時間'+(i+1)+'_終了']=m[2];
    });
  }

  // Food tags: infer only empty tags from existing category/menu text.
  const text=[p['種別'],p['カテゴリ'],p['サブカテゴリ'],p['料理ジャンル'],p['提供メニュータグ'],p['体験・できること'],p['名称']].filter(Boolean).join(' ');
  const rules={
    '日本酒':/日本酒|地酒|清酒/,
    'クラフトビール':/クラフトビール|地ビール/,
    'うなぎ':/うなぎ|鰻/,
    '肉':/肉料理|焼肉|ステーキ|ハンバーグ|とんかつ|豚|牛|鶏/,
    'とんかつ':/とんかつ|トンカツ|豚カツ/,
    'ステーキ':/ステーキ/,
    '寿司':/寿司|鮨|すし/,
    'そば':/そば|蕎麦/,
    '洋食':/洋食|オムライス|ハンバーグ|パスタ|ピザ/,
    '中華':/中華|中国料理|餃子|チャーハン|麻婆/,
    '定食':/定食|食堂/,
    'カフェ':/カフェ|喫茶|コーヒー/,
    'スイーツ':/スイーツ|ケーキ|菓子|甘味|ジェラート|アイス/,
    'テイクアウト':/テイクアウト|持ち帰り/,
    '地元料理':/郷土料理|地元料理|信州|諏訪名物|ご当地/
  };
  for(const [tag,re] of Object.entries(rules)){
    const k='飲食タグ_'+tag;
    if(String(p[k]??'').trim()===''&&re.test(text))p[k]='yes';
  }
  return hydrateStructuredSchedule(p);
}

function foodTags(p){return ['日本酒','クラフトビール','うなぎ','肉','とんかつ','ステーキ','寿司','そば','洋食','中華','定食','カフェ','スイーツ','テイクアウト','地元料理'].filter(n=>truthy(p?.['飲食タグ_'+n]));}
function hasFoodTag(p,tag){return foodTags(p).includes(tag)}
function isFoodType(p){
  return /^(飲食店|ラーメン系|焼肉|その他飲食|軽食)$/.test(String(p?.['種別']||''));
}

function defaultManagement(p){
  const text=((p['種別']||'')+' '+(p['カテゴリ']||'')+' '+(p['サブカテゴリ']||'')).toLowerCase();
  let level='normal',score='3';
  if(/コンビニ|スーパー|公衆トイレ|行政|医療|駐車場|レンタサイクル|生活サービス/.test(text)){level='conditional';score='2';}
  if(/神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|足湯|観光|文化|自然/.test(text)){level='normal';score='4';}
  if(/鉄道駅|交通ハブ/.test(text)){level='conditional';score='3';}
  return {'おすすめ度':score,'オーナー推し度':'0','オーナーおすすめ順':'','オーナー評価メモ':'','削除予定':'','自動提案':level,'おすすめ時間帯':'','対象':'','除外条件':'','公開メモ':'','運営メモ':'','管理更新日':''};
}
function applyManagementDefaults(rows){return rows.map(p=>inferStructuredFromLegacy({...defaultManagement(p),...p}));}
function localJSON(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}}
function applyLegacyCoordinates(rows){
  const stats={googlePins:0,manualEdits:0,addressCache:0,restored:0,alreadyHad:0,total:rows.length,storageAvailable:true};
  try{void localStorage.length}catch(e){stats.storageAvailable=false;return stats}
  for(const p of rows){
    if(hasCoord(p)){stats.alreadyHad++;continue}
    const id=String(p.place_id||'').trim();
    let restored=false;
    if(id){
      const x=localJSON('gmap-pin:'+id);
      if(x&&Number.isFinite(+x.lat)&&Number.isFinite(+x.lng)){
        p.latitude=+x.lat;p.longitude=+x.lng;
        p['座標ステータス']=x.status||'旧Google座標復元';
        p['座標情報源']='旧Google Placesブラウザ保存';
        if(x.googlePlaceId)p.google_place_id=x.googlePlaceId;
        if(x.formattedAddress)p['Google確認住所']=x.formattedAddress;
        if(x.url)p['GoogleマップURL_確定']=x.url;
        p._legacy_coordinate_source='google';stats.googlePins++;restored=true;
      }
      if(!restored){
        const x=localJSON('point-edit:place:'+id);
        if(x&&Number.isFinite(+x.lat)&&Number.isFinite(+x.lng)){
          p.latitude=+x.lat;p.longitude=+x.lng;
          p['座標ステータス']='旧手動補正復元';p['座標情報源']='旧メンテナンス画面ブラウザ保存';
          p._legacy_coordinate_source='manual';stats.manualEdits++;restored=true;
        }
      }
    }
    if(!restored&&p['住所']){
      const x=localJSON('geo:'+p['住所']);
      if(x&&Number.isFinite(+x.lat)&&Number.isFinite(+x.lng)){
        p.latitude=+x.lat;p.longitude=+x.lng;
        p['座標ステータス']='旧住所検索復元';p['座標情報源']='旧住所検索ブラウザ保存';
        p._legacy_coordinate_source='address';stats.addressCache++;restored=true;
      }
    }
    if(restored)stats.restored++;
  }
  stats.withCoord=rows.filter(hasCoord).length;
  stats.missing=rows.length-stats.withCoord;
  return stats;
}
async function fetchText(path){try{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});return r.ok?await r.text():'';}catch(e){return'';}}
async function loadAll(){
  const baseTexts=await Promise.all(BASE_FILES.map(fetchText));
  const attrTexts=await Promise.all(ATTR_FILES.map(fetchText));
  const managementText=await fetchText(MANAGEMENT_FILE);
  let places=baseTexts.flatMap(parseCSV);
  places=mergeRows(places,attrTexts.flatMap(parseCSV));
  places=mergeRows(places,parseCSV(managementText));
  places=applyManagementDefaults(places);
  places=applyLocalMaintenance(places);
  const legacyStats=applyLegacyCoordinates(places);
  return {places,management:parseCSV(managementText),legacyStats,files:{base:BASE_FILES,attributes:ATTR_FILES,management:MANAGEMENT_FILE}};
}
function managementHeaders(){return ['place_id','名称','種別','カテゴリ','サブカテゴリ','住所','latitude','longitude','公式WebページURL','GoogleマップURL_確定','google_place_id','Google評価','口コミ件数','電話番号','おすすめ度','オーナー推し度','オーナーおすすめ順','オーナー評価メモ','削除予定','自動提案','おすすめ用途','おすすめ時間帯','対象','除外条件','公開メモ','運営メモ','管理更新日','営業_月','営業_火','営業_水','営業_木','営業_金','営業_土','営業_日','営業時間1_開始','営業時間1_終了','営業時間2_開始','営業時間2_終了','営業時間3_開始','営業時間3_終了','営業日_override','営業時間_override','定休日_override','朝食向き_override','おやつ向き_override','昼食向き_override','夕食向き_override','休憩向き_override','観光向き_override','買い物向き_override','雨の日向き_override','子ども向き_override','高齢者向き_override','一人向き_override','短時間立寄り向き_override','体験・できること','最短滞在時間_分_override','推奨滞在時間_分_override','最大滞在時間_分_override','屋内外','徒歩アクセス難易度','坂道','トイレ','多目的トイレ','座れる場所','車椅子対応','駐車場','最寄りバス停','情報源_web','飲食タグ_日本酒','飲食タグ_クラフトビール','飲食タグ_うなぎ','飲食タグ_肉','飲食タグ_とんかつ','飲食タグ_ステーキ','飲食タグ_寿司','飲食タグ_そば','飲食タグ_洋食','飲食タグ_中華','飲食タグ_定食','飲食タグ_カフェ','飲食タグ_スイーツ','飲食タグ_テイクアウト','飲食タグ_地元料理','確認ステータス'];}
function effective(p,name){const o=p[name+'_override'];return o!==undefined&&o!==''?o:(p[name]??'');}
function autoLevel(p){return String(p['自動提案']||'normal');}
function recommendation(p){return Math.max(1,Math.min(5,num(p['おすすめ度'],3)));}
function ownerRecommendation(p){const push=Math.max(0,Math.min(5,num(p['オーナー推し度'],0)));const raw=String(p['オーナーおすすめ順']??'').trim();const n=raw===''?null:Number(raw);const rank=Number.isFinite(n)&&n>0?Math.round(n):null;return {push,rank,note:String(p['オーナー評価メモ']||'')};}
window.PlaceData={parseCSV,toCSV,truthy,no,num,lat,lng,hasCoord,keyOf,mergeRows,loadAll,managementHeaders,effective,autoLevel,recommendation,ownerRecommendation,defaultManagement,applyLegacyCoordinates,hydrateStructuredSchedule,applyLocalMaintenance,isFoodType,foodTags,hasFoodTag};
})();

