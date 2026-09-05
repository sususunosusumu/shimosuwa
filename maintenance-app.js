'use strict';const $=id=>document.getElementById(id);let BASE=[],P=[],selected=null;const STORE='shimosuwa_place_management_edits_v1';const flags=['朝食向き','おやつ向き','昼食向き','夕食向き','休憩向き','観光向き','買い物向き','雨の日向き','子ども向き','高齢者向き','一人向き','短時間立寄り向き'];const editable=['名称','種別','カテゴリ','サブカテゴリ','住所','latitude','longitude','公式WebページURL','GoogleマップURL_確定','営業日','営業時間','定休日','おすすめ度','オーナー推し度','オーナーおすすめ順','オーナー評価メモ','自動提案','おすすめ時間帯','対象','除外条件','公開メモ','運営メモ','体験・できること','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分','屋内外','徒歩アクセス難易度','坂道','トイレ','多目的トイレ','座れる場所','車椅子対応','駐車場','最寄りバス停','情報源_web','確認ステータス'];
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function loadEdits(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}}function saveEdits(o){localStorage.setItem(STORE,JSON.stringify(o))}function key(p){return PlaceData.keyOf(p)}
function applyLocal(){const e=loadEdits();P=BASE.map(p=>({...p,...(e[key(p)]||{})}))}
function effective(p,n){const o=p[n+'_override'];return o!==undefined&&o!==''?o:(p[n]??'')}
function isTourism(p){const t=[p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' ');return PlaceData.truthy(effective(p,'観光向き'))||/観光|神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|自然|文化/.test(t)}
function renderList(){const q=$('q').value.toLowerCase(),f=$('filter').value,sort=$('sort')?.value||'data';let rows=P.filter(p=>{const txt=[p['名称'],p['種別'],p['カテゴリ'],p['住所']].join(' ').toLowerCase();if(q&&!txt.includes(q))return false;if(f==='coords'&&PlaceData.hasCoord(p))return false;if(f==='conditional'&&!['conditional','hidden'].includes(PlaceData.autoLevel(p)))return false;if(f==='unverified'&&!/要|未|unknown/i.test([p['確認ステータス'],p['web確認ステータス'],p['座標ステータス']].join(' ')))return false;if(f==='restaurant'&&p['種別']!=='飲食店')return false;if(f==='landmark'&&!isTourism(p))return false;if(f==='ownerTodo'){const o=PlaceData.ownerRecommendation(p);if(PlaceData.recommendation(p)<4||o.push||o.rank)return false}return true});if(sort==='ownerRank')rows.sort((a,b)=>{const x=PlaceData.ownerRecommendation(a),y=PlaceData.ownerRecommendation(b),xr=x.rank??99999,yr=y.rank??99999;return xr-yr||y.push-x.push||PlaceData.recommendation(b)-PlaceData.recommendation(a)});else if(sort==='ownerPush')rows.sort((a,b)=>{const x=PlaceData.ownerRecommendation(a),y=PlaceData.ownerRecommendation(b);return y.push-x.push||(x.rank??99999)-(y.rank??99999)||PlaceData.recommendation(b)-PlaceData.recommendation(a)});else if(sort==='visitValue')rows.sort((a,b)=>PlaceData.recommendation(b)-PlaceData.recommendation(a));$('count').textContent=`${rows.length}件 / 全${P.length}件`;$('list').innerHTML=rows.map(p=>`<div class="item ${selected===key(p)?'sel':''}" onclick="selectPlace('${esc(key(p)).replace(/'/g,'&#39;')}')"><b>${esc(p['名称'])}</b><div class="sm">${esc(p['種別']||'')} / ${esc(p['カテゴリ']||'')}</div><div class="badges"><span class="badge ${PlaceData.recommendation(p)>=4?'good':''}">おすすめ ${PlaceData.recommendation(p)}/5</span><span class="badge ${PlaceData.autoLevel(p)==='conditional'||PlaceData.autoLevel(p)==='hidden'?'warn':''}">${esc(PlaceData.autoLevel(p))}</span>${!PlaceData.hasCoord(p)?'<span class="badge warn">座標なし</span>':''}${p._legacy_coordinate_source?'<span class="badge good">旧座標復元</span>':''}</div></div>`).join('')}
function selectPlace(k){selected=k;const p=P.find(x=>key(x)===k);if(!p)return;$('empty').style.display='none';$('editor').style.display='block';$('title').textContent=p['名称'];$('idline').textContent=(p.place_id||'')+' / '+(p['種別']||'')+(p._legacy_coordinate_source?' / 旧座標復元':'');for(const n of editable){const e=$(n);if(!e)continue;e.value=['営業日','営業時間','定休日'].includes(n)?effective(p,n):(p[n]??'')}renderFlags(p);$('saveState').textContent='';renderList();document.dispatchEvent(new CustomEvent('place-maintenance-selected',{detail:p}))}
function renderFlags(p){$('flags').innerHTML=flags.map(n=>{const v=effective(p,n);return `<div class="flag"><label>${n}</label><select id="flag_${n}"><option value="">unknown</option><option value="yes" ${PlaceData.truthy(v)?'selected':''}>yes</option><option value="no" ${PlaceData.no(v)?'selected':''}>no</option></select></div>`}).join('')}
function gather(){const p=P.find(x=>key(x)===selected);if(!p)return null;const out={};for(const n of editable){const e=$(n);if(e)out[n]=e.value.trim()}for(const n of flags)out[n+'_override']=$('flag_'+n).value;out['営業日_override']=$('営業日').value.trim();out['営業時間_override']=$('営業時間').value.trim();out['定休日_override']=$('定休日').value.trim();out['最短滞在時間_分_override']=$('最短滞在時間_分').value.trim();out['推奨滞在時間_分_override']=$('推奨滞在時間_分').value.trim();out['最大滞在時間_分_override']=$('最大滞在時間_分').value.trim();out['管理更新日']=new Date().toISOString().slice(0,10);return out}
function saveCurrent(){if(!selected)return;const edits=loadEdits(),g=gather();edits[selected]={...(edits[selected]||{}),...g};saveEdits(edits);applyLocal();renderQuickStart();const keep=selected;selectPlace(keep);$('saveState').innerHTML='<span class="unsaved">ブラウザ保存済み・GitHub未反映</span>'}function resetCurrent(){if(!selected)return;const e=loadEdits();delete e[selected];saveEdits(e);applyLocal();renderQuickStart();selectPlace(selected)}function clearLocal(){if(!confirm('このブラウザに保存した全変更を破棄しますか？'))return;localStorage.removeItem(STORE);applyLocal();selected=null;$('editor').style.display='none';$('empty').style.display='block';renderList();renderQuickStart()}
function managementRows(){const edits=loadEdits();return P.map(p=>{const k=key(p),e=edits[k]||{};const pick=n=>e[n]??p[n]??'';const r={place_id:p.place_id||'',名称:pick('名称'),種別:pick('種別'),カテゴリ:pick('カテゴリ'),サブカテゴリ:pick('サブカテゴリ'),住所:pick('住所'),latitude:pick('latitude'),longitude:pick('longitude'),公式WebページURL:pick('公式WebページURL'),GoogleマップURL_確定:pick('GoogleマップURL_確定'),Googleマップ検索URL:pick('Googleマップ検索URL'),google_place_id:pick('google_place_id'),Google確認住所:pick('Google確認住所'),おすすめ度:pick('おすすめ度')||'3',オーナー推し度:pick('オーナー推し度')||'0',オーナーおすすめ順:pick('オーナーおすすめ順'),オーナー評価メモ:pick('オーナー評価メモ'),自動提案:pick('自動提案')||'normal',おすすめ用途:pick('おすすめ用途'),おすすめ時間帯:pick('おすすめ時間帯'),対象:pick('対象'),除外条件:pick('除外条件'),公開メモ:pick('公開メモ'),運営メモ:pick('運営メモ'),管理更新日:pick('管理更新日'),['体験・できること']:pick('体験・できること'),屋内外:pick('屋内外'),徒歩アクセス難易度:pick('徒歩アクセス難易度'),坂道:pick('坂道'),トイレ:pick('トイレ'),多目的トイレ:pick('多目的トイレ'),座れる場所:pick('座れる場所'),車椅子対応:pick('車椅子対応'),駐車場:pick('駐車場'),最寄りバス停:pick('最寄りバス停'),情報源_web:pick('情報源_web'),確認ステータス:pick('確認ステータス')};for(const n of flags)r[n+'_override']=e[n+'_override']??p[n+'_override']??'';for(const n of ['営業日','営業時間','定休日','最短滞在時間_分','推奨滞在時間_分','最大滞在時間_分'])r[n+'_override']=e[n+'_override']??p[n+'_override']??'';return r})}
function renderQuickStart(){
  const el=$('quickStart');if(!el)return;
  const rows=[...P].filter(p=>PlaceData.hasCoord(p)||PlaceData.recommendation(p)>=4).sort((a,b)=>{const oa=PlaceData.ownerRecommendation(a),ob=PlaceData.ownerRecommendation(b);return PlaceData.recommendation(b)-PlaceData.recommendation(a)||ob.push-oa.push||(oa.rank??99999)-(ob.rank??99999)}).slice(0,24);
  el.innerHTML=rows.map(p=>{const o=PlaceData.ownerRecommendation(p);return '<div class="item" data-quick-key="'+esc(key(p))+'"><b>'+esc(p['名称'])+'</b><div class="sm">'+esc(p['種別']||'')+' / '+esc(p['カテゴリ']||'')+'</div><div class="badges"><span class="badge '+(PlaceData.recommendation(p)>=4?'good':'')+'">行く価値 '+PlaceData.recommendation(p)+'/5</span>'+(o.push?'<span class="badge good">オーナー推し '+o.push+'/5'+(o.rank?' #'+o.rank:'')+'</span>':'<span class="badge warn">オーナー未評価</span>')+'</div><div class="row" style="margin-top:6px"><button class="alt quick-detail" data-place-key="'+esc(key(p))+'">詳細を編集</button></div></div>'}).join('');
  document.querySelectorAll('#quickStart .quick-detail').forEach(b=>b.onclick=()=>selectPlace(b.dataset.placeKey));
}
function rankingCandidate(p,filter,q){
  const txt=[p['名称'],p['種別'],p['カテゴリ'],p['サブカテゴリ']].join(' ').toLowerCase();
  if(q&&!txt.includes(q))return false;
  if(filter==='landmark'&&!isTourism(p))return false;
  if(filter==='restaurant'&&p['種別']!=='飲食店')return false;
  if(filter==='rated'){const o=PlaceData.ownerRecommendation(p);if(!o.push&&!o.rank)return false;}
  return true;
}
function rankingQualitySummary(){
  const rated=P.map(p=>({p,o:PlaceData.ownerRecommendation(p)})).filter(x=>x.o.push>0||x.o.rank);
  const ranks=new Map();
  for(const x of rated){if(x.o.rank){if(!ranks.has(x.o.rank))ranks.set(x.o.rank,[]);ranks.get(x.o.rank).push(x.p)}}
  const dup=[...ranks.entries()].filter(([,arr])=>arr.length>1);
  const top=rated.filter(x=>x.o.rank&&x.o.rank<=10).sort((a,b)=>a.o.rank-b.o.rank);
  const topTypes={};for(const x of top){const k=x.p['種別']||'未分類';topTypes[k]=(topTypes[k]||0)+1}
  const tourism=P.filter(isTourism),restaurants=P.filter(p=>p['種別']==='飲食店');
  const unratedTourism=tourism.filter(p=>{const o=PlaceData.ownerRecommendation(p);return !o.push&&!o.rank}).length;
  const unratedRestaurants=restaurants.filter(p=>{const o=PlaceData.ownerRecommendation(p);return !o.push&&!o.rank}).length;
  const rows=[];
  rows.push('<div class="sm"><b>ランキング品質チェック</b></div>');
  rows.push('<div class="badges"><span class="badge good">評価済み '+rated.length+'件</span><span class="badge">TOP10設定 '+top.length+'件</span><span class="badge '+(dup.length?'warn':'good')+'">順位重複 '+dup.length+'件</span></div>');
  if(dup.length)rows.push('<div class="warn" style="margin-top:6px">重複順位: '+dup.map(([r,arr])=>r+'位 '+arr.map(x=>esc(x['名称'])).join(' / ')).join('、')+'</div>');
  rows.push('<div class="sm" style="margin-top:6px">未評価: 観光 '+unratedTourism+'件 / 飲食 '+unratedRestaurants+'件</div>');
  if(top.length)rows.push('<div class="sm" style="margin-top:6px">TOP10構成: '+Object.entries(topTypes).map(([k,v])=>esc(k)+' '+v+'件').join(' / ')+'</div>');
  return rows.join('');
}
function rankingRowsData(){
  const filter=$('rankFilter')?.value||'all',q=($('rankQ')?.value||'').trim().toLowerCase(),sort=$('rankSort')?.value||'rank';
  let rows=P.filter(p=>rankingCandidate(p,filter,q));
  rows.sort((a,b)=>{const x=PlaceData.ownerRecommendation(a),y=PlaceData.ownerRecommendation(b);if(sort==='push')return y.push-x.push||(x.rank??99999)-(y.rank??99999)||PlaceData.recommendation(b)-PlaceData.recommendation(a);if(sort==='visit')return PlaceData.recommendation(b)-PlaceData.recommendation(a)||(x.rank??99999)-(y.rank??99999);return (x.rank??99999)-(y.rank??99999)||y.push-x.push||PlaceData.recommendation(b)-PlaceData.recommendation(a)});
  return rows;
}
function renderRankingManager(){
  const rows=rankingRowsData();
  $('rankingRows').innerHTML=rows.map(p=>{
    const k=key(p),o=PlaceData.ownerRecommendation(p);
    const opts=[0,1,2,3,4,5].map(n=>'<option value="'+n+'" '+(o.push===n?'selected':'')+'>'+n+(n===0?' 未評価':n===5?' 最優先':n===4?' 強く推す':n===3?' おすすめ':n===2?' 弱め':' 推さない')+'</option>').join('');
    return '<tr data-rank-key="'+esc(k)+'">'+
      '<td style="padding:6px;border-bottom:1px solid #eee"><input class="rank-rank" value="'+(o.rank??'')+'" inputmode="numeric" style="width:72px"></td>'+
      '<td style="padding:6px;border-bottom:1px solid #eee"><b>'+esc(p['名称'])+'</b><div class="sm">'+esc(p['種別']||'')+' / '+esc(p['カテゴリ']||'')+'</div></td>'+
      '<td style="padding:6px;border-bottom:1px solid #eee">★'+PlaceData.recommendation(p)+'</td>'+
      '<td style="padding:6px;border-bottom:1px solid #eee"><select class="rank-push" style="min-width:120px">'+opts+'</select></td>'+
      '<td style="padding:6px;border-bottom:1px solid #eee"><input class="rank-note" value="'+esc(o.note||'')+'" placeholder="推す理由・注意点"></td>'+
      '<td style="padding:6px;border-bottom:1px solid #eee"><div class="row"><button class="alt rank-up" data-place-key="'+esc(k)+'">↑</button><button class="alt rank-down" data-place-key="'+esc(k)+'">↓</button><button class="alt rank-detail" data-place-key="'+esc(k)+'">詳細</button></div></td>'+
      '</tr>';
  }).join('');
  document.querySelectorAll('#rankingRows .rank-detail').forEach(b=>b.onclick=()=>{selectPlace(b.dataset.placeKey);closeRankingManager()});
  document.querySelectorAll('#rankingRows .rank-up').forEach(b=>b.onclick=()=>moveOwnerRank(b.dataset.placeKey,-1));
  document.querySelectorAll('#rankingRows .rank-down').forEach(b=>b.onclick=()=>moveOwnerRank(b.dataset.placeKey,1));
  $('rankingState').textContent=rows.length+'件表示';if($('rankingQuality'))$('rankingQuality').innerHTML=rankingQualitySummary();
}
function moveOwnerRank(placeKey,delta){
  const trs=[...document.querySelectorAll('#rankingRows tr[data-rank-key]')];
  const i=trs.findIndex(tr=>tr.dataset.rankKey===placeKey);
  const j=i+delta;
  if(i<0||j<0||j>=trs.length)return;
  const a=trs[i].querySelector('.rank-rank'),b=trs[j].querySelector('.rank-rank');
  const av=a.value.trim(),bv=b.value.trim();
  if(!av&&!bv){a.value=String(i+1);b.value=String(j+1)}
  else{a.value=bv||String(j+1);b.value=av||String(i+1)}
  trs[j].parentNode.insertBefore(trs[i],delta<0?trs[j]:trs[j].nextSibling);
  $('rankingState').textContent='順位を入れ替えました。保存すると反映されます。';
}
function openRankingManager(){$('rankingManager').style.display='block';renderRankingManager();setTimeout(()=>$('rankingManager')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
function closeRankingManager(){$('rankingManager').style.display='none';window.scrollTo({top:0,behavior:'smooth'})}
function saveRankingManager(){
  const edits=loadEdits();
  document.querySelectorAll('#rankingRows tr[data-rank-key]').forEach(tr=>{const k=tr.dataset.rankKey,rank=tr.querySelector('.rank-rank').value.trim(),push=tr.querySelector('.rank-push').value,note=tr.querySelector('.rank-note').value.trim();edits[k]={...(edits[k]||{}),'オーナーおすすめ順':rank,'オーナー推し度':push,'オーナー評価メモ':note,'管理更新日':new Date().toISOString().slice(0,10)}});
  saveEdits(edits);applyLocal();renderList();renderQuickStart();renderRankingManager();$('rankingState').innerHTML='<span class="unsaved">ブラウザ保存済み・GitHub未反映</span>';if($('rankingQuality'))$('rankingQuality').innerHTML=rankingQualitySummary();if(selected)selectPlace(selected);
}
function normalizeOwnerRanks(){
  const rows=rankingRowsData().filter(p=>{const o=PlaceData.ownerRecommendation(p);return o.push>0||o.rank});
  rows.forEach((p,i)=>{const tr=[...document.querySelectorAll('#rankingRows tr[data-rank-key]')].find(x=>x.dataset.rankKey===key(p));if(tr)tr.querySelector('.rank-rank').value=String(i+1)});
  $('rankingState').textContent=rows.length+'件を1〜'+rows.length+'の連番にしました。保存すると反映されます。';
}
function exportManagement(){if(selected)saveCurrent();const csv=PlaceData.toCSV(managementRows(),PlaceData.managementHeaders()),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='place_management_github.csv';a.click();URL.revokeObjectURL(a.href)}
function purposeMatch(p,t){const c=[p['種別'],p['カテゴリ'],p['サブカテゴリ'],p['料理ジャンル'],p['提供メニュータグ']].join(' '),yn=n=>PlaceData.truthy(effective(p,n));if(t==='landmark')return yn('観光向き')||(/神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|自然|文化/.test(c)&&!/コンビニ|行政|医療|生活サービス/.test(c));if(t==='lunch')return yn('昼食向き')||p['種別']==='飲食店';if(t==='snack')return yn('おやつ向き')||/カフェ|喫茶|パン|ベーカリー|菓子|ケーキ/.test(c);if(t==='onsen')return /温泉|足湯/.test(c);if(t==='cafe')return /カフェ|喫茶/.test(c);if(t==='park')return /公園|自然|散歩|湖畔/.test(c);if(t==='rest')return yn('休憩向き')||/休憩|公園|カフェ|温泉/.test(c);return false}
function dayOK(p,w){const closed=effective(p,'定休日'),days=effective(p,'営業日');if(String(closed).includes(w))return false;if(!days||days==='毎日')return true;if(days==='平日')return !['土','日'].includes(w);return String(days).includes(w)}function timeOK(p,w,time){if(!dayOK(p,w))return false;const [hh,mm]=time.split(':').map(Number),t=hh*60+mm,s=String(effective(p,'営業時間')||'');if(!s||s.includes('24時間'))return true;const ranges=[...s.matchAll(/(\d{1,2}):(\d{2})\s*(?:-|〜|～)\s*(\d{1,2}):(\d{2})/g)];if(!ranges.length)return true;return ranges.some(x=>{let a=+x[1]*60+ +x[2],b=+x[3]*60+ +x[4];if(b===0)b=1440;return t>=a&&t<=b})}
function testPlace(){const p={...P.find(x=>key(x)===selected),...gather()},purpose=$('testPurpose').value,w=$('testDay').value,time=$('testTime').value,reasons=[];let ok=true;if(PlaceData.autoLevel(p)==='hidden'){ok=false;reasons.push('自動提案が「原則出さない」')}else if(PlaceData.autoLevel(p)==='conditional')reasons.push('条件付きPlace');if(!purposeMatch(p,purpose)){ok=false;reasons.push('用途属性が一致しない')}if(!PlaceData.hasCoord(p)){ok=false;reasons.push('座標が未設定')}if(!dayOK(p,w)){ok=false;reasons.push(w+'曜日は営業対象外')}else if(!timeOK(p,w,time)){ok=false;reasons.push(time+'は営業時間外')}reasons.push('行く価値 '+PlaceData.recommendation(p)+'/5');const owner=PlaceData.ownerRecommendation?PlaceData.ownerRecommendation(p):{push:0,rank:null};reasons.push('オーナー推し度 '+owner.push+'/5'+(owner.rank?' / おすすめ順 '+owner.rank:''));const r=$('testResult');r.className='result '+(ok?'ok':'ng');r.textContent=(ok?'候補にできます：':'候補から除外：')+reasons.join(' / ')}
$('q').oninput=renderList;$('filter').onchange=renderList;if($('sort'))$('sort').onchange=renderList;if($('rankFilter'))$('rankFilter').onchange=renderRankingManager;if($('rankSort'))$('rankSort').onchange=renderRankingManager;if($('rankQ'))$('rankQ').oninput=renderRankingManager;async function init(){try{const {places}=await PlaceData.loadAll();BASE=places;applyLocal();renderList();renderQuickStart();document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='管理CSVを書き出す')b.textContent='GitHub反映用CSVを書き出す'})}catch(e){console.error(e);if($('count'))$('count').textContent='読込エラー';if($('list'))$('list').innerHTML='<div class="item"><b>Placeデータを読み込めませんでした</b><div class="sm">'+esc(e&&e.message||e)+'</div></div>';alert('Placeメンテナンスの読込に失敗しました: '+(e&&e.message||e))}}init();
for(const [src,id] of [['maintenance-google.js?v=20260829-3','mg-tools'],['maintenance-coordinate-paste.js?v=20260829-2','coord-tools'],['maintenance-url-tools.js?v=20260829-2','url-tools']]){if(!document.getElementById(id)){const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}}