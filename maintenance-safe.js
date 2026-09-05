(() => {
'use strict';

const $=id=>document.getElementById(id);
let BASE=[],P=[],selected=null;
const STORE='shimosuwa_place_management_edits_v1';

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function key(p){return PlaceData.keyOf(p)}
function loadEdits(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}}
function saveEdits(o){localStorage.setItem(STORE,JSON.stringify(o))}
function applyLocal(){const e=loadEdits();P=BASE.map(p=>({...p,...(e[key(p)]||{})}))}
function owner(p){return PlaceData.ownerRecommendation(p)}
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
function renderList(){
  const q=($('q')?.value||'').trim().toLowerCase(),f=$('filter')?.value||'all',sort=$('sort')?.value||'data';
  let rows=P.filter(p=>{
    const txt=[p['名称'],p['種別'],p['カテゴリ'],p['住所']].join(' ').toLowerCase();
    if(q&&!txt.includes(q))return false;
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
  const rows=[...P].filter(p=>value(p)>=4||PlaceData.hasCoord(p)).sort((a,b)=>value(b)-value(a)||owner(b).push-owner(a).push||(owner(a).rank??99999)-(owner(b).rank??99999)).slice(0,24);
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
  $('saveState').textContent='';
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
window.saveCurrent=function(){
  if(!selected)return;const edits=loadEdits();edits[selected]={...(edits[selected]||{}),...gather()};saveEdits(edits);refresh();selectPlace(selected);$('saveState').innerHTML='<span class="unsaved">ブラウザ保存済み・GitHub未反映</span>';
};
window.resetCurrent=function(){if(!selected)return;const edits=loadEdits();delete edits[selected];saveEdits(edits);refresh();selectPlace(selected)};
window.clearLocal=function(){if(!confirm('このブラウザに保存した全変更を破棄しますか？'))return;localStorage.removeItem(STORE);selected=null;refresh();$('editor').style.display='none';$('empty').style.display='block'};
function rankingRows(){
  const f=$('rankFilter')?.value||'all',q=($('rankQ')?.value||'').trim().toLowerCase(),sort=$('rankSort')?.value||'rank';
  let rows=P.filter(p=>{
    const txt=[p['名称'],p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' ').toLowerCase();
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

async function init(){
  const status=$('count');if(status)status.textContent='Placeデータ読込中…';
  const {places}=await PlaceData.loadAll();
  BASE=places;refresh();
  if(status)status.textContent=P.length+'件読み込み済み';
  const top=document.querySelector('.top .sm');if(top)top.textContent='Place一覧・行く価値・オーナー推薦を管理します。SAFE版';
}
$('q').oninput=renderList;
$('filter').onchange=renderList;
if($('sort'))$('sort').onchange=renderList;
if($('rankFilter'))$('rankFilter').onchange=renderRanking;
if($('rankSort'))$('rankSort').onchange=renderRanking;
if($('rankQ'))$('rankQ').oninput=renderRanking;
init().catch(e=>{console.error(e);if($('count'))$('count').textContent='読込エラー: '+e.message;if($('list'))$('list').innerHTML='<div class="item"><b>読込エラー</b><div class="sm">'+esc(e.message)+'</div></div>';});
})();