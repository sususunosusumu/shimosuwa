(() => {
'use strict';
const $=id=>document.getElementById(id),M=window.DiscoverModel,PD=window.PlaceData;
const STORE='shimosuwa_discover_wanted_v1',PAGE_SIZE=6;
const state={mood:'',keywords:[],query:'',rain:false,short:false,sort:'recommended',origin:null,gps:false,limit:PAGE_SIZE,active:''};
let places=[],byId=new Map(),saved=new Set(),toastTimer,loadPending=false,currentDetail=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{const items=JSON.parse(localStorage.getItem(STORE)||'[]');if(Array.isArray(items))saved=new Set(items.filter(id=>typeof id==='string'))}catch(_){}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4000)}
function tagsFor(p){return PD.foodTags(p).slice(0,3)}
function category(p){return p['カテゴリ1']||p['カテゴリ']||p['種別']||'下諏訪のスポット'}
function description(p){return [p['公開メモ'],p['体験・できること'],p['サブカテゴリ']].map(v=>String(v||'').replace(/https?:\/\/\S+/g,'').trim()).find(Boolean)||''}
function summary(p){const raw=description(p);return raw.length>72?raw.slice(0,71)+'…':raw}
function art(p){
 if(PD.isFoodType(p)){if(M.inMood(p,'drink'))return ['🍺','art-drink','A LITTLE TOAST'];if(M.inMood(p,'cafe'))return ['☕','art-cafe','TAKE A BREAK'];return ['🍽','art-food','A GOOD MEAL']}
 if(M.inMood(p,'relax'))return ['♨','art-water','SLOW DOWN'];if(M.inMood(p,'culture'))return ['⛩','art-culture','MEET THE TOWN'];return ['↗','art-walk','A LITTLE DETOUR'];
}
function distanceLabel(p){const km=M.distance(p,state.origin);return km===null?'距離情報なし':(km<1?Math.round(km*1000/10)*10+'m':km.toFixed(1)+'km')+'（目安）'}
function updateURL(){try{const u=new URL(location.href);u.searchParams.delete('mood');u.searchParams.delete('keywords');if(state.mood)u.searchParams.set('mood',state.mood);if(state.keywords.length)u.searchParams.set('keywords',state.keywords.join(','));history.replaceState(null,'',u.pathname+u.search+u.hash)}catch(_){} }
function renderMood(){
 $('moods').innerHTML=M.moods.map(m=>`<button class="mood" type="button" data-mood="${m.id}" aria-pressed="${state.mood===m.id}"><span class="mood-icon" aria-hidden="true">${m.icon}</span><span class="mood-arrow" aria-hidden="true">↗</span><span class="mood-label">${m.label}</span><span class="mood-caption">${m.caption}</span></button>`).join('');
 const mood=M.moods.find(m=>m.id===state.mood);$('deepening').hidden=!mood;
 if(mood){$('selected-mood').textContent=mood.label;$('keywords').innerHTML=mood.children.map(([key,label])=>{const count=places.filter(p=>M.visible(p)&&M.match(p,key)).length;return `<button type="button" class="chip" data-keyword="${key}" aria-pressed="${state.keywords.includes(key)}">${esc(label)}<span class="chip-count">${count}</span></button>`}).join('');}
}
function saveButton(p){const id=PD.keyOf(p),active=saved.has(id);return `<button type="button" class="save-button" data-save="${esc(id)}" aria-pressed="${active}" aria-label="${esc(p['名称'])}を${active?'行きたいから外す':'行きたいに追加'}">${active?'行きたいから外す':'＋ 行きたい'}</button>`}
function card(p){const id=PD.keyOf(p),[icon,cls,label]=art(p);return `<article class="place-card"><div class="card-art ${cls}" aria-hidden="true"><span>${icon}</span><small>${label}</small></div><div class="card-body"><p class="card-category">${esc(category(p))}</p><h3>${esc(p['名称'])}</h3><p class="card-description">${esc(summary(p))}</p><div class="card-badges">${tagsFor(p).map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="card-meta"><span>${esc(distanceLabel(p))}</span><span>${M.duration(p)?'滞在 '+M.duration(p)+'分程度':''}</span></div><div class="card-actions"><button type="button" class="detail-button" data-focus="${esc(id)}">地図・行き方</button><button type="button" class="detail-button" data-detail="${esc(id)}" aria-label="${esc(p['名称'])}の詳細を見る">詳しく見る ↗</button>${saveButton(p)}</div></div></article>`}
function results(){
 const pool=!state.mood&&!state.query?places.filter(p=>M.moods.some(m=>M.inMood(p,m.id))):places;
 return M.search(pool,state);
}
function renderResults(){
 const found=results(),mood=M.moods.find(m=>m.id===state.mood);
 $('results-title').textContent=mood?mood.label+'なら、こんな場所。':'こんな場所、どう？';
 $('results-count').textContent=`${found.length}件の候補${state.keywords.length?' · 選んだ言葉のどれかに合う場所':''}`;
 $('results').innerHTML=found.slice(0,state.limit).map(card).join('');
 $('empty-state').hidden=found.length!==0;$('more-button').hidden=found.length<=state.limit;
 $('saved-count').textContent=saved.size;renderSelection();
}
function refresh(resetLimit=true){if(resetLimit)state.limit=PAGE_SIZE;renderMood();renderResults();updateURL()}
function reset(){Object.assign(state,{mood:'',keywords:[],query:'',rain:false,short:false});$('search-input').value='';$('rain-filter').checked=false;$('short-filter').checked=false;refresh()}
function persist(){try{localStorage.setItem(STORE,JSON.stringify([...saved]))}catch(_){notify('このブラウザには保存できません。開いている間は候補を保持します。')}}
function renderSelection(){
 const chosen=[...saved].map(id=>byId.get(id)).filter(Boolean);
 $('selection-bar').hidden=chosen.length===0;$('selection-label').textContent='行きたい '+chosen.length+'件';
 $('selected-places').innerHTML=chosen.length?'<p class="small-note">行きたい場所を選んで、移動手段を確認してください。</p><div class="chips">'+chosen.map(p=>'<div class="selected-place"><button type="button" class="chip" data-focus="'+esc(PD.keyOf(p))+'" aria-pressed="'+(state.active===PD.keyOf(p))+'">'+esc(p['名称'])+'</button><button type="button" class="remove-selected" data-remove="'+esc(PD.keyOf(p))+'" aria-label="'+esc(p['名称'])+'を行きたいから外す">× 外す</button></div>').join('')+'</div>':'<p class="small-note">「行きたい」に追加した場所はここに集まります。候補の「地図・行き方」からも確認できます。</p>';
 window.DiscoverMap?.draw({places:results(),allPlaces:places,saved:chosen,origin:state.origin,gps:state.gps,originLabel:state.gps?'現在地':'下諏訪駅',station:places.find(p=>p['名称']==='下諏訪駅'),active:byId.get(state.active)||null});
}
function revealMap(){if($('saved-dialog').open)$('saved-dialog').close();if($('place-dialog').open)$('place-dialog').close();$('map-section').scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});window.DiscoverMap?.reveal();}
function focus(id,scroll=true){state.active=byId.has(id)?id:'';renderSelection();if(scroll)revealMap()}
function toggleSaved(id){if(!byId.has(id))return;const adding=!saved.has(id);if(adding){saved.add(id);state.active=id}else{saved.delete(id);if(state.active===id)state.active=[...saved][0]||''}persist();renderResults();renderSaved();if(currentDetail===id)renderDetail(byId.get(id));if(adding)notify('行きたいに追加しました。次は「地図・行き方を見る」で出発を確認できます。');else notify(byId.get(id)['名称']+'を行きたいから外しました。');}
window.DiscoverUI={focus,refreshLocation:locate};

function mapURL(p){return M.safeURL(p['GoogleマップURL_確定'])||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([p['名称'],p['住所']].filter(Boolean).join(' '))}
function field(label,value){return value?`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`:''}
function renderDetail(p){
 const official=M.safeURL(p['公式WebページURL']),hours=String(PD.effective(p,'営業時間')||'').trim(),days=String(PD.effective(p,'営業日')||'').trim(),closed=String(PD.effective(p,'定休日')||'').trim();
 $('place-detail').innerHTML=`<p class="detail-category">${esc(category(p))}</p><h2 class="detail-title">${esc(p['名称'])}</h2><p class="detail-summary">${esc(description(p))}</p><div class="card-badges">${tagsFor(p).map(t=>`<span>${esc(t)}</span>`).join('')}</div><dl class="detail-fields">${field('住所',p['住所'])}${field('距離',distanceLabel(p))}${field('営業時間',hours||'未登録')}${field('営業日',days||'未登録')}${field('定休日',closed)}${field('滞在の目安',M.duration(p)?M.duration(p)+'分程度':'未登録')}${field('設備',['トイレ','座れる場所','車椅子対応','駐車場'].filter(k=>PD.truthy(PD.effective(p,k))).join('・'))}</dl><p class="small-note">営業時間・営業日は登録情報です。ご訪問前に最新情報をご確認ください。</p><div class="detail-links"><a href="${esc(mapURL(p))}" target="_blank" rel="noopener noreferrer">Google Mapsで見る ↗</a>${official?`<a href="${esc(official)}" target="_blank" rel="noopener noreferrer">公式サイト ↗</a>`:''}</div>${saveButton(p)}`;
}
function openDetail(id){const p=byId.get(id);if(!p)return;currentDetail=id;renderDetail(p);if($('saved-dialog').open)$('saved-dialog').close();if(!$('place-dialog').open)$('place-dialog').showModal()}
function renderSaved(){
 $('saved-count').textContent=saved.size;$('copy-list').disabled=saved.size===0;
 $('saved-list').innerHTML=saved.size?[...saved].map(id=>{const p=byId.get(id);return p?`<div class="saved-row"><button type="button" data-detail="${esc(id)}">${esc(p['名称'])}</button><button type="button" class="remove-saved" data-remove="${esc(id)}" aria-label="${esc(p['名称'])}を行きたいから外す">外す</button></div>`:''}).join(''):'<p class="small-note">気になる場所の「＋ 行きたい」を押すと、ここに集まります。</p>';
}
async function copySaved(){
 const report='下諏訪で行きたい場所\n'+[...saved].map(id=>{const p=byId.get(id);return `${p['名称']}｜${category(p)}\n${mapURL(p)}`}).join('\n\n');
 try{await navigator.clipboard.writeText(report);notify('候補をコピーしました。メモやチャットに貼り付けられます。')}catch(_){let area=$('copy-fallback');if(!area){area=document.createElement('textarea');area.id='copy-fallback';area.className='copy-area';area.setAttribute('aria-label','行きたい場所を選択してコピー');$('saved-list').appendChild(area)}area.value=report;area.focus();area.select();notify('表示された文章を選択してコピーしてください。')}
}
function stationOrigin(){const station=places.find(p=>p['名称']==='下諏訪駅'&&PD.hasCoord(p));state.origin=station?{lat:PD.lat(station),lng:PD.lng(station)}:{lat:36.0720136,lng:138.0849189};state.gps=false;$('origin-label').textContent='下諏訪駅を基準に探す';$('station-button').hidden=true;$('location-status').textContent=''}
function locate(){
 if(!navigator.geolocation){$('location-status').textContent='現在地に対応していません。下諏訪駅を基準に探せます。';return}
 const button=$('location-button');button.disabled=true;$('location-status').textContent='現在地を確認しています…';
 navigator.geolocation.getCurrentPosition(position=>{
   state.origin={lat:position.coords.latitude,lng:position.coords.longitude};state.gps=true;state.sort='near';$('sort-select').value='near';$('origin-label').textContent='現在地を基準に探す';$('station-button').hidden=false;$('location-status').textContent='現在地に近い順に並べました。';button.disabled=false;renderResults();
 },error=>{button.disabled=false;$('location-status').textContent=error.code===1?'位置情報の許可がありません。下諏訪駅を基準に探せます。':'現在地を取得できませんでした。もう一度お試しいただくか、下諏訪駅を基準に探してください。';},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
}
async function load(){
 if(loadPending)return;loadPending=true;$('load-error').hidden=true;$('empty-state').hidden=true;$('results-count').textContent='地点を読み込んでいます…';
 try{
  const data=await PD.loadAll();if(!data.places.length||!data.management.length)throw new Error('No place data');
  places=data.places;byId=new Map(places.filter(p=>M.visible(p)).map(p=>[PD.keyOf(p),p]));saved=new Set([...saved].filter(id=>byId.has(id)));persist();stationOrigin();if(saved.size)state.active=[...saved][0];refresh();renderSaved();
 }catch(_){$('load-error').hidden=false;$('results-count').textContent='地点の読み込みに失敗しました';$('results').innerHTML='';$('more-button').hidden=true}finally{loadPending=false}
}
const params=new URLSearchParams(location.search),initialMood=params.get('mood');if(M.moods.some(m=>m.id===initialMood)){state.mood=initialMood;const allowed=new Set(M.moods.find(m=>m.id===initialMood).children.map(c=>c[0]));state.keywords=String(params.get('keywords')||'').split(',').filter(k=>allowed.has(k))}
document.addEventListener('click',event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.dataset.mood){state.mood=state.mood===target.dataset.mood?'':target.dataset.mood;state.keywords=[];refresh();}
 else if(target.dataset.keyword){const k=target.dataset.keyword;state.keywords=state.keywords.includes(k)?state.keywords.filter(x=>x!==k):state.keywords.concat(k);refresh();}
 else if(target.dataset.focus)focus(target.dataset.focus);
 else if(target.dataset.save)toggleSaved(target.dataset.save);
 else if(target.dataset.detail)openDetail(target.dataset.detail);
 else if(target.dataset.remove)toggleSaved(target.dataset.remove);
});
$('search-input').addEventListener('input',event=>{state.query=event.target.value;state.limit=PAGE_SIZE;renderResults()});
$('rain-filter').onchange=event=>{state.rain=event.target.checked;state.limit=PAGE_SIZE;renderResults()};
$('short-filter').onchange=event=>{state.short=event.target.checked;state.limit=PAGE_SIZE;renderResults()};
$('sort-select').onchange=event=>{state.sort=event.target.value;renderResults()};
$('reset-button').onclick=reset;$('clear-filters').onclick=reset;
$('more-button').onclick=()=>{state.limit+=PAGE_SIZE;renderResults()};
$('location-button').onclick=locate;$('station-button').onclick=()=>{stationOrigin();renderResults()};
$('saved-toggle').onclick=()=>{renderSaved();$('saved-dialog').showModal()};
$('close-saved').onclick=()=>$('saved-dialog').close();$('close-dialog').onclick=()=>$('place-dialog').close();
$('place-dialog').addEventListener('close',()=>currentDetail=null);
$('selection-map-button').onclick=revealMap;$('saved-map-button').onclick=revealMap;
$('copy-list').onclick=copySaved;$('retry-button').onclick=load;
if(window.IntersectionObserver){new IntersectionObserver(entries=>{for(const entry of entries)$('selection-bar').classList.toggle('at-map',entry.isIntersecting)},{threshold:.03}).observe($('map-section'));}
renderMood();load();
})();
