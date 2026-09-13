(()=>{
'use strict';
const $=id=>document.getElementById(id);
const STORE='shimosuwa_place_management_edits_v1';
const FOOD_TAGS=['日本酒','ワイン','クラフトビール','ビール','焼酎','カクテル','うなぎ','肉','とんかつ','ステーキ','寿司','そば','洋食','中華','定食','軽食','カフェ','スイーツ','テイクアウト','地元料理'];

function injectStyle(){
  if($('shimosuwa-ui-enhancement-style'))return;
  const st=document.createElement('style');
  st.id='shimosuwa-ui-enhancement-style';
  st.textContent=`
  .wish-add-group:not(:hover):not(.tap-open) .wish-add-menu{display:none!important}
  .wish-add-group.menu-suppressed .wish-add-menu{display:none!important}
  .cat-modal{position:fixed;inset:0;z-index:10000;background:rgba(24,34,40,.48);display:none;padding:22px;overflow:auto}
  .cat-modal.open{display:block}.cat-panel{max-width:1480px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #dce2e5;box-shadow:0 18px 55px rgba(0,0,0,.2);padding:15px}
  .cat-head,.cat-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cat-head{justify-content:space-between}.cat-tools{margin:10px 0}
  .cat-table-wrap{overflow:auto;max-height:72vh;border:1px solid #e1e6e9;border-radius:11px}.cat-table{border-collapse:collapse;width:100%;min-width:1220px;font-size:12px}.cat-table th,.cat-table td{padding:7px 8px;border-bottom:1px solid #edf0f2;vertical-align:top;text-align:left}.cat-table th{position:sticky;top:0;background:#f7f9f8;z-index:2}.cat-table tr:hover td{background:#f8fbfa}.cat-table input[type=checkbox]{width:auto}
  .cat-pill{display:inline-block;padding:2px 6px;border-radius:999px;background:#edf2f1;margin:1px 2px;font-size:10px;white-space:nowrap}.cat-high{color:#235d43;font-weight:800}.cat-mid{color:#8a6816;font-weight:800}.cat-low{color:#9a3a35;font-weight:800}.cat-source a{display:block;color:#245e52;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cat-current{color:#667085}.cat-note{font-size:11px;color:#667085;line-height:1.45}.cat-actions{display:flex;gap:5px;flex-wrap:wrap}.cat-actions button{padding:5px 7px;font-size:11px}.cat-count{font-size:12px;color:#667085}
  @media(max-width:760px){.cat-modal{padding:8px}.cat-panel{padding:10px}.cat-table-wrap{max-height:76vh}}
  `;
  document.head.appendChild(st);
}

function setupPlannerMenus(){
  if(!document.querySelector('.wish-add-group'))return;
  const groups=[...document.querySelectorAll('.wish-add-group')];
  const closeOthers=keep=>groups.forEach(g=>{if(g!==keep){g.classList.remove('tap-open');g.classList.add('menu-suppressed');setTimeout(()=>g.classList.remove('menu-suppressed'),0)}});
  groups.forEach(g=>{
    g.addEventListener('mouseenter',()=>closeOthers(g));
    const main=g.querySelector('.wish-add-main');
    if(main)main.addEventListener('click',e=>{e.stopPropagation();closeOthers(g);setTimeout(()=>{if(g.classList.contains('tap-open'))g.classList.remove('menu-suppressed')},0)});
    g.querySelectorAll('.wish-add-menu button').forEach(b=>b.addEventListener('click',()=>{setTimeout(()=>{g.classList.remove('tap-open');if(document.activeElement instanceof HTMLElement)document.activeElement.blur()},0)}));
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.wish-add-group'))groups.forEach(g=>g.classList.remove('tap-open'))});
}

function loadEdits(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}}
function saveEdits(o){localStorage.setItem(STORE,JSON.stringify(o))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function yes(v){return window.PlaceData?.truthy?PlaceData.truthy(v):/^(yes|true|1|○)$/i.test(String(v||''))}
function textOf(p){return [p['名称'],p['種別'],p['カテゴリ1'],p['カテゴリ'],p['サブカテゴリ'],p['料理ジャンル'],p['提供メニュータグ'],p['体験・できること'],p['公開メモ']].filter(Boolean).join(' ')}
function sourcesOf(p){
  const arr=[];
  const add=(u,label)=>{String(u||'').split(/[;\n]/).map(x=>x.trim()).filter(x=>/^https?:\/\//.test(x)).forEach(x=>{if(!arr.some(a=>a.url===x))arr.push({url:x,label})})};
  add(p['公式WebページURL'],'公式');add(p['GoogleマップURL_確定'],'Google Maps');add(p['情報源_web'],'情報源');
  if(!arr.some(x=>x.label==='Google Maps')){
    const q=[p['名称'],p['住所']].filter(Boolean).join(' ');
    if(q)arr.push({url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q),label:'Google検索'});
  }
  return arr;
}
function hourNums(p){
  const out=[];
  for(let i=1;i<=3;i++){
    const a=String(p['営業時間'+i+'_開始']||''),b=String(p['営業時間'+i+'_終了']||'');
    if(/^\d\d:\d\d$/.test(a)&&/^\d\d:\d\d$/.test(b))out.push([+a.slice(0,2)*60 + +a.slice(3),+b.slice(0,2)*60 + +b.slice(3)]);
  }
  if(!out.length){
    const s=String(p['営業時間_override']||p['営業時間']||'');
    for(const m of s.matchAll(/(\d{1,2}):(\d{2})\s*(?:-|〜|～)\s*(\d{1,2}):(\d{2})/g))out.push([+m[1]*60 + +m[2],+m[3]*60 + +m[4]]);
  }
  return out;
}
function inferCategory(p){
  const t=textOf(p);
  let category='その他飲食',confidence=45,reason='明確な料理分類を既存データから特定できません';
  const set=(c,n,r)=>{if(n>confidence){category=c;confidence=n;reason=r}};
  if(/ラーメン|つけめん|つけ麺/.test(t))set('ラーメン',96,'店名・カテゴリにラーメン系の明示あり');
  if(/そば|蕎麦|うどん/.test(t))set('そば・うどん',94,'店名・カテゴリにそば/うどんの明示あり');
  if(/うなぎ|鰻/.test(t))set('うなぎ',98,'店名・カテゴリにうなぎの明示あり');
  if(/寿司|鮨|すし|海鮮|魚介/.test(t))set('寿司・海鮮',92,'寿司・海鮮・魚介の明示あり');
  if(/とんかつ|トンカツ|豚カツ/.test(t))set('とんかつ',98,'とんかつの明示あり');
  if(/焼肉|ステーキ|肉料理|焼き鳥|やきとり/.test(t))set('肉料理',91,'肉料理の明示あり');
  if(/中華|中国料理|餃子|チャーハン|麻婆/.test(t))set('中華',93,'中華料理の明示あり');
  if(/フランス料理|イタリア|洋食|ビストロ|グラタン|オムライス|パスタ|ピザ|ファミリーレストラン/.test(t))set('洋食',88,'洋食系の料理・業態の明示あり');
  if(/居酒屋|バー|酒場|地酒/.test(t))set('居酒屋・バー',91,'居酒屋・酒場系の明示あり');
  if(/カフェ|cafe|喫茶|コーヒー|coffee/i.test(t))set('カフェ・軽食',90,'カフェ・喫茶の明示あり');
  if(/ベーカリー|パン|菓子|スイーツ|ケーキ|アイス|甘味/.test(t))set('ベーカリー・菓子',88,'パン・菓子・スイーツ系の明示あり');
  if(/定食|食堂|和食|天ぷら|天丼|うどん/.test(t))set('和食・定食',82,'和食・定食・食堂系の明示あり');
  return {category,confidence,reason};
}
function inferTags(p){
  const t=textOf(p);const tags=new Set();
  const rule={
    '日本酒':/日本酒|地酒|清酒/,'ワイン':/ワイン|wine/i,'クラフトビール':/クラフトビール|地ビール/,'ビール':/ビール|beer/i,'焼酎':/焼酎/,'カクテル':/カクテル|cocktail/i,
    'うなぎ':/うなぎ|鰻/,'肉':/焼肉|肉料理|ステーキ|ハンバーグ|とんかつ|焼き鳥|やきとり|牛|豚/,'とんかつ':/とんかつ|トンカツ|豚カツ/,'ステーキ':/ステーキ/,
    '寿司':/寿司|鮨|すし/,'そば':/そば|蕎麦/,'洋食':/洋食|フランス料理|イタリア|ビストロ|オムライス|グラタン|パスタ|ピザ/,'中華':/中華|中国料理|餃子|チャーハン|麻婆/,
    '定食':/定食|食堂/,'軽食':/軽食|ベーカリー|パン|サンド|ホットドッグ|ファストフード/,'カフェ':/カフェ|cafe|喫茶|コーヒー/i,'スイーツ':/スイーツ|ケーキ|菓子|甘味|アイス|ジェラート/,
    'テイクアウト':/テイクアウト|持ち帰り/,'地元料理':/郷土料理|地元料理|信州|諏訪名物|ご当地/
  };
  for(const [k,re] of Object.entries(rule))if(re.test(t)||yes(p['飲食タグ_'+k]))tags.add(k);
  return [...tags];
}
function inferPurposes(p,cat,tags){
  const hours=hourNums(p),purposes=new Set();
  const food=/飲食|ラーメン|そば|うどん|うなぎ|寿司|海鮮|肉|とんかつ|洋食|中華|和食|定食|居酒屋|カフェ|軽食|ベーカリー|菓子/.test(cat+' '+textOf(p));
  if(yes(p['朝食向き_override'])||hours.some(x=>x[0]<=10*60))purposes.add('朝食');
  if(yes(p['昼食向き_override'])||(food&&(!hours.length||hours.some(x=>x[0]<14*60&&x[1]>=11*60))))purposes.add('昼食');
  if(yes(p['夕食向き_override'])||(food&&hours.some(x=>x[1]>=17*60)))purposes.add('夕食');
  if(yes(p['軽食向き_override'])||/カフェ|軽食|ベーカリー|菓子/.test(cat)||tags.some(x=>['軽食','カフェ','スイーツ'].includes(x)))purposes.add('軽食');
  if(yes(p['アルコール向き_override'])||cat==='居酒屋・バー'||tags.some(x=>['日本酒','ワイン','クラフトビール','ビール','焼酎','カクテル'].includes(x)))purposes.add('アルコール');
  return [...purposes];
}
function inferPlace(p){
  const c=inferCategory(p),tags=inferTags(p),purposes=inferPurposes(p,c.category,tags),sources=sourcesOf(p);
  let confidence=c.confidence;
  if(sources.some(x=>x.label==='公式'))confidence=Math.min(99,confidence+2);
  const status=confidence>=85?'高':confidence>=65?'中':'要確認';
  return {...c,confidence,status,tags,purposes,sources};
}
function isFoodPlace(p){
  const s=textOf(p);return /飲食店|ラーメン|そば|うどん|うなぎ|寿司|海鮮|焼肉|ステーキ|とんかつ|中華|洋食|食堂|定食|居酒屋|カフェ|ベーカリー|菓子|軽食|レストラン/.test(s);
}
function patchFromInference(p,inf){
  const patch={
    'カテゴリ1':inf.category,
    'カテゴリ確信度':String(inf.confidence),
    'カテゴリ根拠':inf.reason,
    'カテゴリ確認URL':inf.sources.map(x=>x.url).join(';'),
    '確認ステータス':inf.confidence>=85?'自動分類済（既存データ根拠）':'カテゴリ要確認',
    '管理更新日':new Date().toISOString().slice(0,10)
  };
  ['朝食','昼食','夕食','軽食','アルコール'].forEach(x=>patch[x+'向き_override']=inf.purposes.includes(x)?'yes':'no');
  FOOD_TAGS.forEach(x=>{if(inf.tags.includes(x))patch['飲食タグ_'+x]='yes'});
  return patch;
}

let CAT={places:[],rows:[],filter:'all',query:''};
function ensureCategoryModal(){
  if($('categoryBatchModal'))return;
  const d=document.createElement('div');d.id='categoryBatchModal';d.className='cat-modal';
  d.innerHTML=`<div class="cat-panel"><div class="cat-head"><div><b style="font-size:19px">カテゴリ一括整備</b><div class="cat-note">既存CSV・店名・カテゴリ・営業時間・登録済みURLから推定します。高確信度は一括反映、曖昧なものだけ要確認に残します。</div></div><button class="alt" id="catClose">閉じる</button></div>
  <div class="cat-tools"><input id="catSearch" placeholder="店名・カテゴリで検索" style="max-width:260px"><select id="catFilter" style="width:auto"><option value="all">飲食Placeすべて</option><option value="unclassified">カテゴリ1未設定</option><option value="review">要確認のみ</option><option value="high">高確信度のみ</option></select><button id="catSelectAll" class="alt">表示中を全選択</button><button id="catApplySelected">選択を反映</button><button id="catApplyHigh">高確信度を一括反映</button><span id="catSummary" class="cat-count"></span></div>
  <div class="cat-table-wrap"><table class="cat-table"><thead><tr><th>選択</th><th>Place</th><th>現在カテゴリ</th><th>推定カテゴリ1</th><th>用途</th><th>飲食タグ</th><th>確信度</th><th>根拠・確認URL</th></tr></thead><tbody id="catBody"></tbody></table></div></div>`;
  document.body.appendChild(d);
  $('catClose').onclick=()=>d.classList.remove('open');
  d.addEventListener('click',e=>{if(e.target===d)d.classList.remove('open')});
  $('catSearch').oninput=e=>{CAT.query=e.target.value.toLowerCase();renderCategoryRows()};
  $('catFilter').onchange=e=>{CAT.filter=e.target.value;renderCategoryRows()};
  $('catSelectAll').onclick=()=>document.querySelectorAll('#catBody .cat-check').forEach(x=>x.checked=true);
  $('catApplySelected').onclick=()=>applyCategoryRows(false);
  $('catApplyHigh').onclick=()=>applyCategoryRows(true);
}
function categoryVisible(r){
  if(CAT.query&&!textOf(r.p).toLowerCase().includes(CAT.query))return false;
  if(CAT.filter==='unclassified'&&String(r.p['カテゴリ1']||'').trim())return false;
  if(CAT.filter==='review'&&r.inf.confidence>=65)return false;
  if(CAT.filter==='high'&&r.inf.confidence<85)return false;
  return true;
}
function renderCategoryRows(){
  const rows=CAT.rows.filter(categoryVisible);const body=$('catBody');if(!body)return;
  body.innerHTML=rows.map(r=>{
    const inf=r.inf,p=r.p,k=PlaceData.keyOf(p),cls=inf.confidence>=85?'cat-high':inf.confidence>=65?'cat-mid':'cat-low';
    const src=inf.sources.slice(0,3).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}を開く</a>`).join('');
    return `<tr><td><input class="cat-check" type="checkbox" data-key="${esc(k)}"></td><td><b>${esc(p['名称'])}</b><div class="cat-note">${esc(p.place_id||'')}</div></td><td class="cat-current">${esc(p['カテゴリ1']||p['カテゴリ']||p['サブカテゴリ']||'')}</td><td><b>${esc(inf.category)}</b></td><td>${inf.purposes.map(x=>`<span class="cat-pill">${esc(x)}</span>`).join('')}</td><td>${inf.tags.map(x=>`<span class="cat-pill">${esc(x)}</span>`).join('')}</td><td class="${cls}">${inf.confidence}%<div class="cat-note">${esc(inf.status)}</div></td><td><div class="cat-note">${esc(inf.reason)}</div><div class="cat-source">${src}</div></td></tr>`;
  }).join('');
  $('catSummary').textContent=rows.length+'件表示 / 全'+CAT.rows.length+'件';
}
async function openCategoryManager(){
  ensureCategoryModal();$('categoryBatchModal').classList.add('open');$('catSummary').textContent='データ読込中…';
  try{
    const loaded=await PlaceData.loadAll();CAT.places=loaded.places;CAT.rows=loaded.places.filter(isFoodPlace).map(p=>({p,inf:inferPlace(p)}));renderCategoryRows();
  }catch(e){$('catSummary').textContent='読込エラー: '+e.message}
}
function applyCategoryRows(highOnly){
  const edits=loadEdits();let n=0;
  const checks=new Set([...document.querySelectorAll('#catBody .cat-check:checked')].map(x=>x.dataset.key));
  for(const r of CAT.rows){
    if(highOnly){if(r.inf.confidence<85)continue}else if(!checks.has(PlaceData.keyOf(r.p)))continue;
    const k=PlaceData.keyOf(r.p);edits[k]={...(edits[k]||{}),...patchFromInference(r.p,r.inf)};n++;
  }
  saveEdits(edits);alert(n+'件をブラウザ保存しました。\n内容を確認後、「Planner公開反映用CSVを書き出す」で公開CSVへ反映できます。');location.reload();
}
function addCategoryButton(){
  if(!/maintenance\.html/.test(location.pathname)||$('openCategoryBatch'))return;
  const rows=[...document.querySelectorAll('aside .row')];const toolbar=rows.find(x=>x.textContent.includes('一括比較・編集'))||rows[0];if(!toolbar)return;
  const b=document.createElement('button');b.id='openCategoryBatch';b.type='button';b.textContent='カテゴリ一括整備';b.onclick=openCategoryManager;
  const ref=[...toolbar.querySelectorAll('button')].find(x=>x.textContent.includes('一括比較・編集'));
  if(ref)ref.insertAdjacentElement('afterend',b);else toolbar.appendChild(b);
}
function boot(){injectStyle();setupPlannerMenus();addCategoryButton()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();
