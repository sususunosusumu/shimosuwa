(() => {
'use strict';

const $=id=>document.getElementById(id);
let BASE=[],SOURCE_BASE=[],P=[],selected=null;
const STORE='shimosuwa_place_management_edits_v1';

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function key(p){return PlaceData.keyOf(p)}
function loadEdits(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}}
function saveEdits(o){localStorage.setItem(STORE,JSON.stringify(o))}
function applyLocal(){const e=loadEdits();P=BASE.map(p=>({...p,...(e[key(p)]||{})}))}
function owner(p){return PlaceData.ownerRecommendation(p)}

const NEW_STORE='shimosuwa_place_new_v1';

const GOOGLE_KEY_STORE='shimosuwa_google_maps_api_key_v1';
let googleLoader=null;
let googleLoadedKey='';

function parseGoogleMapsUrl(url){
  const s=String(url||'').trim();
  if(!s)return {query:'',lat:null,lng:null};
  let lat=null,lng=null,query='';
  let m=s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if(m){lat=+m[1];lng=+m[2]}
  try{
    const u=new URL(s);
    const q=u.searchParams.get('query')||u.searchParams.get('q')||'';
    if(q)query=decodeURIComponent(q);
    if(!query){
      const pm=u.pathname.match(/\/place\/([^/]+)/);
      if(pm)query=decodeURIComponent(pm[1].replace(/\+/g,' '));
    }
  }catch(e){}
  return {query,lat,lng};
}

function classifyGooglePlace(types=[],primary=''){
  const t=[primary,...types].filter(Boolean).join(' ').toLowerCase();
  if(/restaurant|cafe|bakery|bar|food|meal_takeaway|meal_delivery/.test(t))return {type:'飲食店',category:primary||types[0]||'飲食'};
  if(/train_station|transit_station|bus_station/.test(t))return {type:'交通',category:primary||types[0]||'交通'};
  if(/park|tourist_attraction|museum|art_gallery|place_of_worship|shrine|temple|spa|natural_feature|point_of_interest/.test(t))return {type:'ランドマーク',category:primary||types[0]||'観光'};
  if(/store|shopping_mall|supermarket|convenience_store/.test(t))return {type:'サービス',category:primary||types[0]||'店舗'};
  return {type:'ランドマーク',category:primary||types[0]||'地点'};
}

function normalizeWeekdayText(periods){
  if(!Array.isArray(periods)||!periods.length)return {hours:'',days:'',closed:''};
  const dayNames=['日','月','火','水','木','金','土'];
  const grouped={};
  for(const p of periods){
    const d=p.open?.day;
    const oh=p.open?.hour,om=p.open?.minute,ch=p.close?.hour,cm=p.close?.minute;
    if(d==null||oh==null||ch==null)continue;
    const range=String(oh).padStart(2,'0')+':'+String(om||0).padStart(2,'0')+'-'+String(ch).padStart(2,'0')+':'+String(cm||0).padStart(2,'0');
    (grouped[d]||(grouped[d]=[])).push(range);
  }
  const openDays=Object.keys(grouped).map(Number).sort((a,b)=>a-b);
  const closed=[0,1,2,3,4,5,6].filter(d=>!openDays.includes(d));
  const dayText=openDays.length===7?'毎日':openDays.map(d=>dayNames[d]).join('・');
  const closedText=closed.length?closed.map(d=>dayNames[d]).join('・'):'';
  const uniq=[...new Set(Object.values(grouped).flat())];
  return {hours:uniq.join(' / '),days:dayText,closed:closedText};
}

async function ensureGoogleForNewPlace(){
  const key=$('newGoogleApiKey')?.value.trim()||localStorage.getItem(GOOGLE_KEY_STORE)||'';
  if(!key)throw new Error('Google Maps APIキーを入力してください。');
  localStorage.setItem(GOOGLE_KEY_STORE,key);
  if(window.google?.maps?.importLibrary){
    if(googleLoadedKey && googleLoadedKey!==key){
      throw new Error('APIキーを変更しました。ページを再読み込みしてから、もう一度「Google Mapsから取得」を押してください。');
    }
    return;
  }
  if(googleLoader)return googleLoader;
  googleLoader=new Promise((resolve,reject)=>{
    const old=document.getElementById('new-google-maps-js');
    if(old)old.remove();
    const s=document.createElement('script');
    s.id='new-google-maps-js';
    s.async=true;s.defer=true;
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&loading=async&libraries=places';
    s.onload=()=>{googleLoadedKey=key;resolve()};
    s.onerror=()=>{googleLoader=null;reject(new Error('Google Maps JavaScript APIを読み込めませんでした。APIキーとAPI設定を確認してください。'))};
    document.head.appendChild(s);
  });
  return googleLoader;
}

window.importNewPlaceFromGoogle=async function(){
  const state=$('newGoogleState');
  const url=$('newGoogleMapsURL').value.trim();
  if(!url){state.textContent='Google Maps URLを貼り付けてください。';return}
  state.textContent='Google Mapsから地点情報を取得中…';
  try{
    await ensureGoogleForNewPlace();
    const parsed=parseGoogleMapsUrl(url);
    const {Place}=await google.maps.importLibrary('places');
    const fields=['id','displayName','formattedAddress','location','googleMapsURI','websiteURI','types','primaryType','regularOpeningHours','rating','userRatingCount','nationalPhoneNumber'];

    let results=[];
    if(parsed.query){
      const r=await Place.searchByText({
        textQuery:parsed.query+' 下諏訪町 長野県',
        fields,
        language:'ja',
        region:'jp',
        maxResultCount:5
      });
      results=r.places||[];
    }
    if(!results.length&&parsed.lat!=null&&parsed.lng!=null){
      const r=await Place.searchNearby({
        locationRestriction:{center:{lat:parsed.lat,lng:parsed.lng},radius:80},
        fields,
        language:'ja',
        region:'jp',
        maxResultCount:10
      });
      results=r.places||[];
    }
    if(!results.length)throw new Error('地点を特定できませんでした。Google Mapsの地点ページURLを使ってください。');

    const best=results.map(x=>{
      const name=typeof x.displayName==='string'?x.displayName:(x.displayName?.text||'');
      let score=0;
      if(parsed.query&&normName(name)===normName(parsed.query))score+=100;
      if(String(x.formattedAddress||'').includes('下諏訪町'))score+=40;
      if(parsed.lat!=null&&parsed.lng!=null&&x.location){
        const lat=typeof x.location.lat==='function'?x.location.lat():x.location.lat;
        const lng=typeof x.location.lng==='function'?x.location.lng():x.location.lng;
        const d=coordDistanceMeters({latitude:parsed.lat,longitude:parsed.lng},{latitude:lat,longitude:lng});
        if(d!=null)score+=Math.max(0,60-d);
      }
      return {x,score};
    }).sort((a,b)=>b.score-a.score)[0].x;

    const name=typeof best.displayName==='string'?best.displayName:(best.displayName?.text||'');
    const lat=typeof best.location?.lat==='function'?best.location.lat():best.location?.lat;
    const lng=typeof best.location?.lng==='function'?best.location.lng():best.location?.lng;
    const cls=classifyGooglePlace(best.types||[],best.primaryType||'');
    const wh=normalizeWeekdayText(best.regularOpeningHours?.periods||[]);

    $('new名称').value=name||$('new名称').value;
    $('new種別').value=cls.type;
    $('newカテゴリ').value=cls.category||$('newカテゴリ').value;
    $('new住所').value=best.formattedAddress||$('new住所').value;
    if(Number.isFinite(+lat))$('newLatitude').value=lat;
    if(Number.isFinite(+lng))$('newLongitude').value=lng;
    $('newOfficialURL').value=best.websiteURI||'';
    $('new営業日').value=wh.days;
    $('new営業時間').value=wh.hours;
    $('new定休日').value=wh.closed;
    $('newGoogle評価').value=best.rating??'';
    $('new口コミ件数').value=best.userRatingCount??'';
    $('new電話番号').value=best.nationalPhoneNumber||'';
    if(best.googleMapsURI)$('newGoogleMapsURL').value=best.googleMapsURI;

    state.innerHTML='<span class="badge good">取得完了</span> 名称・住所・座標・営業情報などを反映しました。内容を確認してから追加してください。';
  }catch(e){
    console.error(e);
    state.textContent='取得できませんでした: '+e.message;
  }
};

function loadNewPlaces(){try{return JSON.parse(localStorage.getItem(NEW_STORE)||'[]')}catch(e){return[]}}
function saveNewPlaces(rows){localStorage.setItem(NEW_STORE,JSON.stringify(rows))}
function nextPlaceId(type){
  const prefix=type==='飲食店'?'R':type==='交通'?'T':type==='ランドマーク'?'L':'N';
  const used=new Set([...BASE,...loadNewPlaces()].map(p=>String(p.place_id||'')));
  let n=1;while(used.has(prefix+String(n).padStart(3,'0')))n++;
  return prefix+String(n).padStart(3,'0');
}
function allBaseWithNew(){return [...SOURCE_BASE,...loadNewPlaces()]}
window.openNewPlace=function(){
  $('newPlacePanel').style.display='block';
  $('newPlaceState').textContent='';
  setTimeout(()=>$('newPlacePanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
};
window.closeNewPlace=function(){$('newPlacePanel').style.display='none'};
window.clearNewPlaceForm=function(){
  for(const id of ['new名称','newカテゴリ','new住所','newLatitude','newLongitude','newGoogleMapsURL','newOfficialURL','new営業日','new営業時間','new定休日','newGoogle評価','new口コミ件数','new電話番号','newMemo']){const e=$(id);if(e)e.value=''}
  if($('new種別'))$('new種別').value='ランドマーク';
  if($('newおすすめ度'))$('newおすすめ度').value='3';
  if($('newOwnerPush'))$('newOwnerPush').value='0';
  if($('newAuto'))$('newAuto').value='normal';
  if($('newPlaceState'))$('newPlaceState').textContent='';
};

function normName(v){
  return String(v||'').normalize('NFKC').toLowerCase()
    .replace(/[\s　・･,，.。\-ー_()（）\[\]「」『』]/g,'')
    .replace(/株式会社|有限会社|合同会社|店$/g,'');
}
function coordDistanceMeters(a,b){
  const lat1=+a.latitude,lng1=+a.longitude,lat2=+b.latitude,lng2=+b.longitude;
  if(![lat1,lng1,lat2,lng2].every(Number.isFinite))return null;
  const R=6371000,toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const q=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
function duplicateCandidates(candidate){
  const cn=normName(candidate['名称']);
  return P.map(p=>{
    let score=0,reasons=[];
    const pn=normName(p['名称']);
    if(cn&&pn){
      if(cn===pn){score+=100;reasons.push('名称一致')}
      else if(cn.includes(pn)||pn.includes(cn)){score+=65;reasons.push('名称が近い')}
    }
    const ca=String(candidate['住所']||'').trim(),pa=String(p['住所']||'').trim();
    if(ca&&pa&&ca===pa){score+=80;reasons.push('住所一致')}
    const cu=String(candidate['GoogleマップURL_確定']||'').trim(),pu=String(p['GoogleマップURL_確定']||'').trim();
    if(cu&&pu&&cu===pu){score+=120;reasons.push('Google Maps URL一致')}
    const d=coordDistanceMeters(candidate,p);
    if(d!==null&&d<=20){score+=90;reasons.push('座標が約'+Math.round(d)+'m')}
    return {p,score,reasons};
  }).filter(x=>x.score>=65).sort((a,b)=>b.score-a.score);
}
function showDuplicateWarning(candidate,dups){
  let box=$('newDuplicateWarning');
  if(!box){
    box=document.createElement('div');
    box.id='newDuplicateWarning';
    box.style.cssText='margin-top:10px;padding:10px;border:1px solid #e2b65c;border-radius:10px;background:#fff8e8';
    $('newPlaceState').insertAdjacentElement('beforebegin',box);
  }
  box.innerHTML='<b>既存Placeと重複している可能性があります</b>'+
    dups.slice(0,5).map(x=>'<div style="margin-top:7px"><b>'+esc(x.p['名称'])+'</b><div class="sm">'+esc(x.reasons.join(' / '))+'</div><button type="button" class="alt dup-open" data-k="'+esc(key(x.p))+'">既存Placeを開く</button></div>').join('')+
    '<div class="row" style="margin-top:9px"><button type="button" id="dupForceAdd">それでも新規追加する</button><button type="button" class="alt" id="dupCancel">追加をやめる</button></div>';
  box.querySelectorAll('.dup-open').forEach(b=>b.onclick=()=>{selectPlace(b.dataset.k);closeNewPlace()});
  $('dupCancel').onclick=()=>box.remove();
  $('dupForceAdd').onclick=()=>{box.remove();commitNewPlace(candidate)};
}
function commitNewPlace(row){
  const rows=loadNewPlaces();rows.push(row);saveNewPlaces(rows);
  BASE=allBaseWithNew();refresh();
  $('newPlaceState').innerHTML='<span class="unsaved">追加しました：'+esc(row.place_id)+' '+esc(row['名称'])+' / ブラウザ保存済み・GitHub未反映</span>';
  selected=key(row);setTimeout(()=>selectPlace(selected),0);
}

window.createNewPlace=function(){
  const name=$('new名称').value.trim(),type=$('new種別').value;
  if(!name){$('newPlaceState').textContent='名称を入力してください。';return}
  const lat=$('newLatitude').value.trim(),lng=$('newLongitude').value.trim();
  if((lat&&!Number.isFinite(+lat))||(lng&&!Number.isFinite(+lng))){$('newPlaceState').textContent='緯度・経度を確認してください。';return}
  const row={
    place_id:nextPlaceId(type),
    '名称':name,
    '種別':type,
    'カテゴリ':$('newカテゴリ').value.trim(),
    '住所':$('new住所').value.trim(),
    latitude:lat,
    longitude:lng,
    'おすすめ度':$('newおすすめ度').value,
    'オーナー推し度':$('newOwnerPush').value,
    'オーナーおすすめ順':'',
    'オーナー評価メモ':$('newMemo').value.trim(),
    '自動提案':$('newAuto').value,
    'GoogleマップURL_確定':$('newGoogleMapsURL').value.trim(),
    '公式WebページURL':$('newOfficialURL').value.trim(),
    '営業日':$('new営業日').value.trim(),
    '営業時間':$('new営業時間').value.trim(),
    '定休日':$('new定休日').value.trim(),
    'Google評価':$('newGoogle評価').value.trim(),
    '口コミ件数':$('new口コミ件数').value.trim(),
    '電話番号':$('new電話番号').value.trim(),
    '管理更新日':new Date().toISOString().slice(0,10),
    _new_place:true
  };
  const dups=duplicateCandidates(row);
  if(dups.length){showDuplicateWarning(row,dups);return}
  commitNewPlace(row);
};

function value(p){return PlaceData.recommendation(p)}
function isTourism(p){return PlaceData.truthy(PlaceData.effective(p,'観光向き'))||/観光|神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|自然|文化/.test([p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' '))}
function card(p,detail=true){
  const o=owner(p);
  return '<div class="item" data-k="'+esc(key(p))+'"><b>'+esc(p['名称'])+'</b>'+
    '<div class="sm">'+esc(p['種別']||'')+' / '+esc(p['カテゴリ']||'')+'</div>'+
    '<div class="badges"><span class="badge '+(value(p)>=4?'good':'')+'">行く価値 '+value(p)+'/5</span>'+
    (o.push?'<span class="badge good">オーナー推し '+o.push+'/5'+(o.rank?' #'+o.rank:'')+'</span>':'<span class="badge warn">オーナー未評価</span>')+
    (!PlaceData.hasCoord(p)?'<span class="badge warn">座標なし</span>':'')+'</div>'+
    (detail?'<div class="row" style="margin-top:6px"><button type="button" class="alt safe-detail" data-key="'+esc(key(p))+'">詳細を編集</button></div>':'')+
    '</div>';
}
function bindDetails(root=document){
  root.querySelectorAll('.safe-detail').forEach(b=>b.onclick=()=>selectPlace(b.dataset.key));
}
function isDeleted(p){return String(p['削除予定']||'').toLowerCase()==='yes'}
function renderList(){
  const q=($('q')?.value||'').trim().toLowerCase(),f=$('filter')?.value||'all',sort=$('sort')?.value||'data';
  let rows=P.filter(p=>{
    const txt=[p['名称'],p['種別'],p['カテゴリ'],p['住所']].join(' ').toLowerCase();
    if(q&&!txt.includes(q))return false;
    if(f!=='deleted'&&isDeleted(p))return false;
    if(f==='deleted'&&!isDeleted(p))return false;
    if(f==='coords'&&PlaceData.hasCoord(p))return false;
    if(f==='conditional'&&!['conditional','hidden'].includes(PlaceData.autoLevel(p)))return false;
    if(f==='unverified'&&!/要|未|unknown/i.test([p['確認ステータス'],p['web確認ステータス'],p['座標ステータス']].join(' ')))return false;
    if(f==='restaurant'&&p['種別']!=='飲食店')return false;
    if(f==='landmark'&&!isTourism(p))return false;
    if(f==='ownerTodo'){const o=owner(p);if(value(p)<4||o.push||o.rank)return false}
    return true;
  });
  if(sort==='ownerRank')rows.sort((a,b)=>(owner(a).rank??99999)-(owner(b).rank??99999)||owner(b).push-owner(a).push||value(b)-value(a));
  if(sort==='ownerPush')rows.sort((a,b)=>owner(b).push-owner(a).push||(owner(a).rank??99999)-(owner(b).rank??99999)||value(b)-value(a));
  if(sort==='visitValue')rows.sort((a,b)=>value(b)-value(a));
  $('count').textContent=rows.length+'件 / 全'+P.length+'件';
  $('list').innerHTML=rows.map(p=>card(p,false)).join('');
  $('list').querySelectorAll('.item').forEach(d=>d.onclick=()=>selectPlace(d.dataset.k));
}
function renderQuick(){
  const el=$('quickStart');if(!el)return;
  const rows=[...P].filter(p=>!isDeleted(p)&&(value(p)>=4||PlaceData.hasCoord(p))).sort((a,b)=>value(b)-value(a)||owner(b).push-owner(a).push||(owner(a).rank??99999)-(owner(b).rank??99999)).slice(0,24);
  el.innerHTML=rows.map(p=>card(p,true)).join('');
  bindDetails(el);
}
function setIf(id,v){const e=$(id);if(e)e.value=v??''}
function selectPlace(k){
  selected=k;const p=P.find(x=>key(x)===k);if(!p)return;
  $('empty').style.display='none';$('editor').style.display='block';
  $('title').textContent=p['名称'];$('idline').textContent=(p.place_id||'')+' / '+(p['種別']||'');
  const fields=['名称','種別','カテゴリ','サブカテゴリ','住所','latitude','longitude','営業日','営業時間','定休日','おすすめ度','オーナー推し度','オーナーおすすめ順','オーナー評価メモ','自動提案','おすすめ時間帯','対象','除外条件','公開メモ','運営メモ','体験・できること','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分','屋内外','徒歩アクセス難易度','坂道','トイレ','多目的トイレ','座れる場所','車椅子対応','駐車場','最寄りバス停','情報源_web','確認ステータス'];
  for(const n of fields)setIf(n,['営業日','営業時間','定休日'].includes(n)?PlaceData.effective(p,n):p[n]);
  renderFlags(p);
  $('saveState').innerHTML=isDeleted(p)?'<span class="unsaved">この地点は削除予定です</span>':'';
  window.scrollTo({top:0,behavior:'smooth'});
}
const flags=['朝食向き','おやつ向き','昼食向き','夕食向き','休憩向き','観光向き','買い物向き','雨の日向き','子ども向き','高齢者向き','一人向き','短時間立寄り向き'];
function renderFlags(p){
  const el=$('flags');if(!el)return;
  el.innerHTML=flags.map(n=>{const v=PlaceData.effective(p,n);return '<div class="flag"><label>'+n+'</label><select id="flag_'+n+'"><option value="">unknown</option><option value="yes" '+(PlaceData.truthy(v)?'selected':'')+'>yes</option><option value="no" '+(PlaceData.no(v)?'selected':'')+'>no</option></select></div>'}).join('');
}
function gather(){
  const p=P.find(x=>key(x)===selected);if(!p)return null;
  const fields=['名称','種別','カテゴリ','サブカテゴリ','住所','latitude','longitude','営業日','営業時間','定休日','おすすめ度','オーナー推し度','オーナーおすすめ順','オーナー評価メモ','自動提案','おすすめ時間帯','対象','除外条件','公開メモ','運営メモ','体験・できること','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分','屋内外','徒歩アクセス難易度','坂道','トイレ','多目的トイレ','座れる場所','車椅子対応','駐車場','最寄りバス停','情報源_web','確認ステータス'];
  const out={};
  for(const n of fields){const e=$(n);if(e)out[n]=e.value.trim()}
  for(const n of flags){const e=$('flag_'+n);if(e)out[n+'_override']=e.value}
  for(const n of ['営業日','営業時間','定休日','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分']){const e=$(n);if(e)out[n+'_override']=e.value.trim()}
  out['管理更新日']=new Date().toISOString().slice(0,10);
  return out;
}
function refresh(){applyLocal();renderList();renderQuick()}

window.toggleDeleteCurrent=function(){
  if(!selected)return;
  const p=P.find(x=>key(x)===selected);if(!p)return;
  const deleting=!isDeleted(p);
  const msg=deleting
    ? 'この地点を削除予定にしますか？\n\n完全削除ではなく、Planner候補と通常一覧から除外します。後で復元できます。'
    : 'この地点を削除予定から戻しますか？';
  if(!confirm(msg))return;
  const edits=loadEdits();
  edits[selected]={...(edits[selected]||{}),'削除予定':deleting?'yes':'','自動提案':deleting?'hidden':(edits[selected]?.['自動提案']||p['自動提案']||'normal'),'管理更新日':new Date().toISOString().slice(0,10)};
  saveEdits(edits);
  refresh();
  const still=P.find(x=>key(x)===selected);
  if(still)selectPlace(selected);
};

window.saveCurrent=function(){
  if(!selected)return;const edits=loadEdits();edits[selected]={...(edits[selected]||{}),...gather()};saveEdits(edits);refresh();selectPlace(selected);$('saveState').innerHTML='<span class="unsaved">ブラウザ保存済み・GitHub未反映</span>';
};
window.resetCurrent=function(){if(!selected)return;const edits=loadEdits();delete edits[selected];saveEdits(edits);refresh();selectPlace(selected)};
window.clearLocal=function(){if(!confirm('このブラウザに保存した全変更を破棄しますか？'))return;localStorage.removeItem(STORE);selected=null;refresh();$('editor').style.display='none';$('empty').style.display='block'};
function rankingRows(){
  const f=$('rankFilter')?.value||'all',q=($('rankQ')?.value||'').trim().toLowerCase(),sort=$('rankSort')?.value||'rank';
  let rows=P.filter(p=>{
    const txt=[p['名称'],p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' ').toLowerCase();
    if(isDeleted(p))return false;
    if(q&&!txt.includes(q))return false;
    if(f==='landmark'&&!isTourism(p))return false;
    if(f==='restaurant'&&p['種別']!=='飲食店')return false;
    if(f==='rated'&&!owner(p).push&&!owner(p).rank)return false;
    return true;
  });
  rows.sort((a,b)=>sort==='push'?owner(b).push-owner(a).push||(owner(a).rank??99999)-(owner(b).rank??99999):sort==='visit'?value(b)-value(a):(owner(a).rank??99999)-(owner(b).rank??99999)||owner(b).push-owner(a).push||value(b)-value(a));
  return rows;
}
function renderRanking(){
  const rows=rankingRows();
  $('rankingRows').innerHTML=rows.map(p=>{
    const o=owner(p),opts=[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(o.push===n?'selected':'')+'>'+n+(n===0?' 未評価':n===5?' 最優先':n===4?' 強く推す':n===3?' おすすめ':n===2?' 弱め':' 推さない')+'</option>').join('');
    return '<tr data-rank-key="'+esc(key(p))+'"><td style="padding:6px;border-bottom:1px solid #eee"><input class="rank-rank" value="'+(o.rank??'')+'" inputmode="numeric" style="width:72px"></td><td style="padding:6px;border-bottom:1px solid #eee"><b>'+esc(p['名称'])+'</b><div class="sm">'+esc(p['種別']||'')+' / '+esc(p['カテゴリ']||'')+'</div></td><td style="padding:6px;border-bottom:1px solid #eee">★'+value(p)+'</td><td style="padding:6px;border-bottom:1px solid #eee"><select class="rank-push">'+opts+'</select></td><td style="padding:6px;border-bottom:1px solid #eee"><input class="rank-note" value="'+esc(o.note||'')+'" placeholder="推す理由・注意点"></td><td style="padding:6px;border-bottom:1px solid #eee"><button type="button" class="alt rank-detail" data-key="'+esc(key(p))+'">詳細</button></td></tr>';
  }).join('');
  document.querySelectorAll('#rankingRows .rank-detail').forEach(b=>b.onclick=()=>{selectPlace(b.dataset.key);closeRankingManager()});
  $('rankingState').textContent=rows.length+'件表示';
}
window.openRankingManager=function(){$('rankingManager').style.display='block';renderRanking();$('rankingManager').scrollIntoView({behavior:'smooth',block:'start'})};
window.closeRankingManager=function(){$('rankingManager').style.display='none'};
window.saveRankingManager=function(){
  const edits=loadEdits();
  document.querySelectorAll('#rankingRows tr[data-rank-key]').forEach(tr=>{const k=tr.dataset.rankKey;edits[k]={...(edits[k]||{}),'オーナーおすすめ順':tr.querySelector('.rank-rank').value.trim(),'オーナー推し度':tr.querySelector('.rank-push').value,'オーナー評価メモ':tr.querySelector('.rank-note').value.trim(),'管理更新日':new Date().toISOString().slice(0,10)}});
  saveEdits(edits);refresh();renderRanking();$('rankingState').innerHTML='<span class="unsaved">ブラウザ保存済み・GitHub未反映</span>';
};
window.normalizeOwnerRanks=function(){const trs=[...document.querySelectorAll('#rankingRows tr[data-rank-key]')].filter(tr=>+tr.querySelector('.rank-push').value>0||tr.querySelector('.rank-rank').value.trim());trs.forEach((tr,i)=>tr.querySelector('.rank-rank').value=String(i+1));$('rankingState').textContent=trs.length+'件を連番にしました。保存すると反映されます。'};
window.exportManagement=function(){
  if(selected)window.saveCurrent();
  const edits=loadEdits();
  const rows=P.map(p=>({...p,...(edits[key(p)]||{})}));
  const csv=PlaceData.toCSV(rows,PlaceData.managementHeaders());
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='place_management_github.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
window.testPlace=function(){const r=$('testResult');if(r)r.textContent='SAFE版では基本属性の編集を優先しています。推薦判定はPlanner側で確認してください。'};


const BULK_GROUPS={
  recommend:[
    ['おすすめ度','行く価値','select','visit'],
    ['オーナー推し度','オーナー推し','select','owner'],
    ['オーナーおすすめ順','順位','input','number'],
    ['自動提案','自動提案','select','auto'],
    ['オーナー評価メモ','評価メモ','input','text']
  ],
  purpose:[
    ['朝食向き','朝食','select','yn'],
    ['おやつ向き','おやつ','select','yn'],
    ['昼食向き','昼食','select','yn'],
    ['夕食向き','夕食','select','yn'],
    ['休憩向き','休憩','select','yn'],
    ['観光向き','観光','select','yn'],
    ['買い物向き','買い物','select','yn'],
    ['雨の日向き','雨の日','select','yn'],
    ['子ども向き','子ども','select','yn'],
    ['高齢者向き','高齢者','select','yn'],
    ['一人向き','一人','select','yn'],
    ['短時間立寄り向き','短時間','select','yn']
  ],
  stay:[
    ['体験・できること','体験・できること','input','text'],
    ['最短滞在時間_分','最短滞在','input','number'],
    ['推奨滞在時間_分','推奨滞在','input','number'],
    ['最大滞在時間_分','最大滞在','input','number'],
    ['おすすめ時間帯','おすすめ時間帯','input','text'],
    ['屋内外','屋内外','input','text']
  ],
  access:[
    ['徒歩アクセス難易度','徒歩難易度','input','text'],
    ['坂道','坂道','input','text'],
    ['トイレ','トイレ','input','text'],
    ['多目的トイレ','多目的トイレ','input','text'],
    ['座れる場所','座れる','input','text'],
    ['車椅子対応','車椅子','input','text'],
    ['駐車場','駐車場','input','text'],
    ['最寄りバス停','最寄りバス停','input','text']
  ],
  hours:[
    ['営業日','営業日','input','text'],
    ['営業時間','営業時間','input','text'],
    ['定休日','定休日','input','text'],
    ['対象','対象','input','text'],
    ['除外条件','除外条件','input','text']
  ]
};

function bulkRows(){
  const f=$('bulkFilter')?.value||'landmark';
  const q=($('bulkQ')?.value||'').trim().toLowerCase();
  return P.filter(p=>{
    const txt=[p['名称'],p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' ').toLowerCase();
    if(isDeleted(p))return false;
    if(q&&!txt.includes(q))return false;
    if(f==='landmark'&&!isTourism(p))return false;
    if(f==='restaurant'&&p['種別']!=='飲食店')return false;
    if(f==='ownerTodo'){const o=owner(p);if(value(p)<4||o.push||o.rank)return false}
    return true;
  }).sort((a,b)=>value(b)-value(a)||owner(b).push-owner(a).push||(owner(a).rank??99999)-(owner(b).rank??99999));
}

function bulkValue(p,name){
  if(['朝食向き','おやつ向き','昼食向き','夕食向き','休憩向き','観光向き','買い物向き','雨の日向き','子ども向き','高齢者向き','一人向き','短時間立寄り向き','営業日','営業時間','定休日','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分'].includes(name)){
    return PlaceData.effective(p,name);
  }
  return p[name]??'';
}

function bulkEditorCell(p,col){
  const [name,label,kind,mode]=col;
  const v=bulkValue(p,name);
  const k=key(p);
  const base='data-bulk-key="'+esc(k)+'" data-bulk-field="'+esc(name)+'"';
  if(kind==='select'&&mode==='visit'){
    return '<select '+base+'>'+[1,2,3,4,5].map(n=>'<option value="'+n+'" '+(+v===n?'selected':'')+'>'+n+'</option>').join('')+'</select>';
  }
  if(kind==='select'&&mode==='owner'){
    return '<select '+base+'>'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(+v===n?'selected':'')+'>'+n+'</option>').join('')+'</select>';
  }
  if(kind==='select'&&mode==='auto'){
    return '<select '+base+'>'+[['promote','積極'],['normal','通常'],['conditional','条件付'],['hidden','出さない']].map(([x,t])=>'<option value="'+x+'" '+(String(v||'normal')===x?'selected':'')+'>'+t+'</option>').join('')+'</select>';
  }
  if(kind==='select'&&mode==='yn'){
    const yes=PlaceData.truthy(v),no=PlaceData.no(v);
    return '<select '+base+'><option value="" '+(!yes&&!no?'selected':'')+'>unknown</option><option value="yes" '+(yes?'selected':'')+'>yes</option><option value="no" '+(no?'selected':'')+'>no</option></select>';
  }
  const type=mode==='number'?'number':'text';
  return '<input type="'+type+'" '+base+' value="'+esc(v)+'" style="min-width:'+(mode==='text'?'150px':'80px')+'">';
}

window.renderBulkEditor=function(){
  const group=$('bulkGroup')?.value||'recommend';
  const cols=BULK_GROUPS[group];
  const rows=bulkRows();
  const sticky='position:sticky;background:#f7f8f9;z-index:2;border-bottom:1px solid #dce2e5;padding:7px;text-align:left;white-space:nowrap';
  $('bulkHead').innerHTML='<tr><th style="'+sticky+';left:0;z-index:4">Place</th><th style="'+sticky+';left:220px;z-index:4">種別</th>'+cols.map(c=>'<th style="'+sticky+'">'+esc(c[1])+'</th>').join('')+'</tr>';
  $('bulkBody').innerHTML=rows.map(p=>{
    return '<tr><td style="position:sticky;left:0;background:#fff;z-index:1;padding:7px;border-bottom:1px solid #eee;min-width:220px"><b>'+esc(p['名称'])+'</b></td>'+
      '<td style="position:sticky;left:220px;background:#fff;z-index:1;padding:7px;border-bottom:1px solid #eee;min-width:120px">'+esc(p['種別']||'')+'</td>'+
      cols.map(c=>'<td style="padding:6px;border-bottom:1px solid #eee">'+bulkEditorCell(p,c)+'</td>').join('')+
      '</tr>';
  }).join('');
  $('bulkState').textContent=rows.length+'件表示';
};

window.openBulkEditor=function(){
  $('bulkEditor').style.display='block';
  renderBulkEditor();
  setTimeout(()=>$('bulkEditor')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
};
window.closeBulkEditor=function(){$('bulkEditor').style.display='none'};

window.saveBulkEditor=function(){
  const edits=loadEdits();
  document.querySelectorAll('#bulkTable [data-bulk-key][data-bulk-field]').forEach(e=>{
    const k=e.dataset.bulkKey,field=e.dataset.bulkField;
    if(!edits[k])edits[k]={};
    const value=e.value.trim();
    if(['朝食向き','おやつ向き','昼食向き','夕食向き','休憩向き','観光向き','買い物向き','雨の日向き','子ども向き','高齢者向き','一人向き','短時間立寄り向き','営業日','営業時間','定休日','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分'].includes(field)){
      edits[k][field+'_override']=value;
    }else{
      edits[k][field]=value;
    }
    edits[k]['管理更新日']=new Date().toISOString().slice(0,10);
  });
  saveEdits(edits);
  refresh();
  renderBulkEditor();
  $('bulkState').innerHTML='<span class="unsaved">一括変更をブラウザ保存済み・GitHub未反映</span>';
};

async function init(){try{if($('newGoogleApiKey')){const saved=localStorage.getItem(GOOGLE_KEY_STORE)||'';$('newGoogleApiKey').value=saved;$('newGoogleApiKey').addEventListener('change',()=>{const v=$('newGoogleApiKey').value.trim();localStorage.setItem(GOOGLE_KEY_STORE,v);if(googleLoadedKey&&googleLoadedKey!==v){const st=$('newGoogleState');if(st)st.textContent='APIキーを変更しました。ページを再読み込みしてから取得してください。'}})}}catch(e){}

  const status=$('count');if(status)status.textContent='Placeデータ読込中…';
  const {places}=await PlaceData.loadAll();
  SOURCE_BASE=places;BASE=allBaseWithNew();refresh();
  if(status)status.textContent=P.length+'件読み込み済み';
  const top=document.querySelector('.top .sm');if(top)top.textContent='Place一覧・行く価値・オーナー推薦を管理します。SAFE版';
}
$('q').oninput=renderList;
$('filter').onchange=renderList;
if($('sort'))$('sort').onchange=renderList;
if($('rankFilter'))$('rankFilter').onchange=renderRanking;
if($('rankSort'))$('rankSort').onchange=renderRanking;
if($('rankQ'))$('rankQ').oninput=renderRanking;
if($('bulkFilter'))$('bulkFilter').onchange=renderBulkEditor;
if($('bulkGroup'))$('bulkGroup').onchange=renderBulkEditor;
if($('bulkQ'))$('bulkQ').oninput=renderBulkEditor;
init().catch(e=>{console.error(e);if($('count'))$('count').textContent='読込エラー: '+e.message;if($('list'))$('list').innerHTML='<div class="item"><b>読込エラー</b><div class="sm">'+esc(e.message)+'</div></div>';});
})();