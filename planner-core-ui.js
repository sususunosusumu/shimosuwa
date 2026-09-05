(() => {
'use strict';

const params=new URLSearchParams(location.search);
if(params.get('planner')!=='core')return;

const state={excluded:new Set(),lastRandom:false,gtfs:null};

function H(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hm(n){return PlannerCore.Time.formatMinutes(n)}
function mode(){return window.TransportPlanner?.mode||'walk'}
function walkMax(){return +(document.getElementById('v8walk')?.value||10)}
function ownerBadge(point){
  if(!point||!window.PlaceData?.ownerRecommendation)return '';
  const o=PlaceData.ownerRecommendation(point);
  if(!o.push&&!o.rank)return '';
  return '<span class="star">オーナー '+o.push+'/5'+(o.rank?' #'+o.rank:'')+'</span>';
}
async function gtfs(){
  if(mode()!=='bus')return null;
  if(state.gtfs)return state.gtfs;
  state.gtfs=await PlannerCore.Transport.loadGtfs('data/gtfs/');
  return state.gtfs;
}
function renderMoveTitle(x){
  if(x.type==='bus')return '🚌 '+x.title;
  if(x.type==='wait'&&x.fixedTransport)return '🚌 バス待ち';
  if(x.type==='wait')return '少し待つ';
  if(x.type==='travel'){
    const m=x.mode||x.title;
    return m==='bike'?'🚲 自転車':m==='car'?'🚗 自動車':'🚶 徒歩';
  }
  if(x.type==='free')return '自由時間';
  return x.title||x.type;
}
function wishButtons(x){
  if(!x.wishId)return '';
  return '<div class="plan-edit">'+
    '<button class="alt" onclick="PlannerCoreUI.shiftWish('+x.wishId+',\''+hm(x.from)+'\',-30)">← 早め</button>'+
    '<button class="alt" onclick="PlannerCoreUI.shiftWish('+x.wishId+',\''+hm(x.from)+'\',30)">遅め →</button>'+
    '<button class="alt" onclick="PlannerV8.band('+x.wishId+')">時間帯変更</button>'+
    '<button class="alt" onclick="PlannerV8.place('+x.wishId+')">行き先変更</button>'+
  '</div>';
}
function autoButtons(x){
  if(!x.auto||!x.placeId)return '';
  return '<div class="plan-edit">'+
    '<button class="alt" onclick="PlannerCoreUI.replaceAuto(\''+H(x.placeId)+'\')">別の場所に変更</button>'+
    '<button class="alt" onclick="PlannerCoreUI.removeAuto(\''+H(x.placeId)+'\')">この提案を外す</button>'+
  '</div>';
}
function render(result){
  const items=result.itinerary||[];
  const travel=items.filter(x=>['travel','bus'].includes(x.type)).reduce((a,x)=>a+Math.max(0,x.to-x.from),0);
  document.getElementById('ps').textContent=result.status==='ok'?'成立':'要確認';
  document.getElementById('summary').innerHTML=
    '<span class="pill">Integrated Core preview</span>'+
    '<span class="pill">'+H(document.getElementById('wd').value)+'曜日</span>'+
    '<span class="pill">'+hm(result.start)+' → '+hm(result.end)+'</span>'+
    '<span class="pill">徒歩上限 '+walkMax()+'分</span>'+
    '<span class="pill">移動 '+travel+'分</span>'+
    '<span class="pill">希望 '+W.length+'件 / 完了 '+result.completed.length+'件</span>'+
    (result.autoAdded?.length?'<span class="pill">✨ 自動追加 '+result.autoAdded.length+'件</span>':'')+
    (result.skipped?.length?'<span class="pill">要確認 '+result.skipped.length+'件</span>':'');

  document.getElementById('result').innerHTML=items.map(x=>{
    const cls=(x.type==='travel'||x.type==='bus')?'travel':'';
    return '<div class="card '+cls+' '+(x.type==='warn'?'warn ':'')+(x.auto?'auto-added':'')+'">'+
      '<div class="time">'+(x.from===x.to?hm(x.from):hm(x.from)+'–'+hm(x.to))+'</div>'+
      '<div><div class="name">'+H(renderMoveTitle(x))+'</div>'+
      '<div class="meta">'+H(x.meta||'')+(x.gapAbsorbed?' / 待ち'+x.gapAbsorbed+'分吸収':'')+'</div>'+
      (x.point?'<span class="star">★'+PlaceData.recommendation(x.point)+'</span> '+ownerBadge(x.point):'')+
      wishButtons(x)+autoButtons(x)+'</div></div>';
  }).join('');
}
async function planCore(random=false){
  if(!pt?.s||!pt?.g)return alert('STARTとGOALを設定してください');
  state.lastRandom=random;
  const g=await gtfs();
  const result=await PlannerCore.Schedule.buildPlan({
    start:{...pt.s},
    goal:{...pt.g},
    startTime:document.getElementById('st').value,
    endTime:document.getElementById('et').value,
    day:document.getElementById('wd').value,
    mode:mode(),
    policy:document.getElementById('policy').value,
    allowConditional:document.getElementById('allowConditional').checked,
    places:P,
    wishes:W,
    placeData:PlaceData,
    gtfsIndex:g,
    excludedPlaceIds:[...state.excluded],
    config:{...PlannerCore.DEFAULT_CONFIG,walkMax:walkMax(),busWaitMax:10}
  });
  render(result);
}
function byId(id){return W.find(w=>w.id===+id)}
window.PlannerCoreUI={
  plan:planCore,
  async shiftWish(id,time,delta){
    const w=byId(id);if(!w)return;
    w._manualTime=hm(PlannerCore.Time.toMinutes(time)+delta);w._band='auto';
    await planCore(state.lastRandom);
  },
  async replaceAuto(placeId){
    state.excluded.add(placeId);
    await planCore(true);
  },
  async removeAuto(placeId){
    state.excluded.add(placeId);
    await planCore(false);
  },
  clearExclusions(){state.excluded.clear()}
};

function boot(){
  window.plan=planCore;
  try{plan=planCore}catch(e){}
  const v=document.querySelector('.ver');if(v)v.textContent='planner core preview 0.7';
  const banner=document.createElement('div');
  banner.className='p';
  banner.innerHTML='<div class="head"><div><b>Integrated Core Preview</b><div class="sm">このURLだけ新Coreを使用中。通常URLはV1.11です。</div></div><a class="linkbtn" href="index.html">V1.11へ戻る</a></div>';
  document.querySelector('.wrap')?.prepend(banner);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();