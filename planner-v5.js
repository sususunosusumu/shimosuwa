(() => {
'use strict';

const STATE={generated:[],rerunTimer:null,running:false,lastRandom:false};
const RESERVE=10;

function tp(){return window.TransportPlanner||{mode:'walk',bikeMode:'own',gtfs:{ready:false,loading:false,stops:[],routes:new Map(),trips:new Map(),byStop:new Map(),byTrip:new Map(),calendar:new Map()}}}
function h(s){return esc(s)}
function q(p){return{name:p['名称'],lat:PlaceData.lat(p),lng:PlaceData.lng(p)}}
function numbers(v){return(String(v??'').match(/\d+(?:\.\d+)?/g)||[]).map(Number)}
function durationFor(w,p){
  if(w.d!==''&&+w.d>0)return{d:+w.d,src:'指定'};
  const a=numbers(PlaceData.effective(p,'推奨滞在時間_分'));
  let d=a.length>1?(a[0]+a[1])/2:(a[0]||D[w.t]?.[1]||30);
  if(w._autoFill)d=Math.min(d,45);
  return{d:Math.max(10,Math.round(d/5)*5),src:'自動'};
}
function moveEstimate(mode,a,b){
  const km=dist(a,b);
  if(mode==='bike')return Math.max(2,Math.round(km/12*60*1.15));
  if(mode==='car')return Math.max(4,Math.round(km/28*60*1.22)+3);
  if(mode==='bus')return Math.max(8,Math.round(km/16*60)+12);
  return walk(a,b);
}
function routeScore(p,from,goal){
  const z=q(p),direct=dist(from,goal),leg=dist(from,z),after=dist(z,goal);
  const detour=Math.max(0,leg+after-direct);
  const progress=direct-after;
  let s=PlaceData.recommendation(p)*20 + progress*38 - detour*95 - leg*5;
  if(after>direct+.30)s-=45;
  if($('rain').checked&&yn(p,'雨の日向き'))s+=14;
  if($('senior').checked&&yn(p,'高齢者向き'))s+=14;
  if($('policy').value==='recommended')s+=PlaceData.recommendation(p)*10;
  if($('policy').value==='near')s-=leg*22;
  if(PlaceData.autoLevel(p)==='promote')s+=12;
  if(PlaceData.autoLevel(p)==='conditional')s-=8;
  return s;
}
function fitsByEstimate(w,p,from,goal,now,end,pref=null){
  const z=q(p),mv=moveEstimate(tp().mode,from,z),di=durationFor(w,p).d;
  let start=now+mv;
  if(pref!==null&&start<pref)start=pref;
  const finish=start+di+moveEstimate(tp().mode,z,goal)+RESERVE;
  return finish<=end;
}
function chooseRequired(w,from,goal,now,end,used,random){
  const pref=min(w.time);
  if(w.pid){
    const p=P.find(x=>PlaceData.keyOf(x)===w.pid);
    return p&&PlaceData.hasCoord(p)&&autoAllowed(p,true)&&timeOK(p,pref??now)?p:null;
  }
  const base=candidateBase(w.t).filter(p=>PlaceData.hasCoord(p)&&!used.has(PlaceData.keyOf(p))&&timeOK(p,pref??now));
  if(!base.length)return null;
  let feasible=base.filter(p=>fitsByEstimate(w,p,from,goal,now,end,pref));
  if(!feasible.length)feasible=base;
  const ranked=feasible.map(p=>({p,s:routeScore(p,from,goal)})).sort((a,b)=>b.s-a.s).slice(0,5);
  return random&&ranked.length>1?ranked[Math.floor(Math.random()*Math.min(3,ranked.length))].p:ranked[0]?.p||null;
}
function explicitCount(){return W.filter(w=>!w._autoFill).length}

function tm(v){const m=String(v||'').match(/^(\d+):(\d{2})/);return m?+m[1]*60+ +m[2]:999999}
function serviceOK(id,day){
  const r=tp().gtfs.calendar.get(id);if(!r)return true;
  const k={月:'monday',火:'tuesday',水:'wednesday',木:'thursday',金:'friday',土:'saturday',日:'sunday'}[day]||'monday';
  return String(r[k])==='1';
}
async function ensureGTFS(){
  const T=tp(); if(T.gtfs.ready||T.gtfs.loading)return T.gtfs.ready;
  T.gtfs.loading=true;
  const st=$('transportStatus');if(st){st.style.display='inline';st.textContent='バス時刻表を読込中…'}
  try{
    async function rd(n){const r=await fetch('data/gtfs/'+n+'?v=20260830-2',{cache:'force-cache'});if(!r.ok)throw Error(n);return PlaceData.parseCSV(await r.text())}
    const[stops,routes,trips,times,cal]=await Promise.all([rd('stops.txt'),rd('routes.txt'),rd('trips.txt'),rd('stop_times.txt'),rd('calendar.txt')]);
    T.gtfs.stops=stops.filter(x=>+x.stop_lat&&+x.stop_lon);
    T.gtfs.routes=new Map(routes.map(x=>[x.route_id,x]));
    T.gtfs.trips=new Map(trips.map(x=>[x.trip_id,x]));
    T.gtfs.calendar=new Map(cal.map(x=>[x.service_id,x]));
    T.gtfs.byStop=new Map();T.gtfs.byTrip=new Map();
    for(const x of times){
      if(!T.gtfs.byStop.has(x.stop_id))T.gtfs.byStop.set(x.stop_id,[]);T.gtfs.byStop.get(x.stop_id).push(x);
      if(!T.gtfs.byTrip.has(x.trip_id))T.gtfs.byTrip.set(x.trip_id,[]);T.gtfs.byTrip.get(x.trip_id).push(x);
    }
    for(const a of T.gtfs.byStop.values())a.sort((x,y)=>tm(x.departure_time)-tm(y.departure_time));
    for(const a of T.gtfs.byTrip.values())a.sort((x,y)=>+x.stop_sequence-+y.stop_sequence);
    T.gtfs.ready=true;if(st)st.textContent=`GTFS OK：停留所 ${T.gtfs.stops.length} / 便 ${trips.length}`;return true;
  }catch(e){if(st)st.textContent='GTFS読込失敗：徒歩で補完';console.warn(e);return false}
  finally{T.gtfs.loading=false}
}
function sp(s){return{name:s.stop_name||'バス停',lat:+s.stop_lat,lng:+s.stop_lon}}
function nearestStops(p,n=5,max=.8){return tp().gtfs.stops.map(s=>({s,d:dist(p,sp(s))})).filter(x=>x.d<=max).sort((a,b)=>a.d-b.d).slice(0,n)}
function routeName(tr){const r=tp().gtfs.routes.get(tr.route_id)||{};return[r.route_short_name,r.route_long_name].filter(Boolean).join(' ')||'バス'}
async function busLeg(from,to,start){
  if(!(await ensureGTFS()))return null;
  const bs=nearestStops(from),as=nearestStops(to);if(!bs.length||!as.length)return null;
  const destIds=new Set(as.map(x=>x.s.stop_id)),destMap=new Map(as.map(x=>[x.s.stop_id,x]));let best=null,day=$('wd').value;
  for(const b of bs){
    const bp=sp(b.s),walkIn=walk(from,bp),reach=start+walkIn;
    for(const x of tp().gtfs.byStop.get(b.s.stop_id)||[]){
      const dep=tm(x.departure_time);if(dep<reach)continue;if(dep>reach+90)break;
      const tr=tp().gtfs.trips.get(x.trip_id);if(!tr||!serviceOK(tr.service_id,day))continue;
      for(const y of tp().gtfs.byTrip.get(x.trip_id)||[]){
        if(+y.stop_sequence<=+x.stop_sequence||!destIds.has(y.stop_id))continue;
        const arr=tm(y.arrival_time||y.departure_time),di=destMap.get(y.stop_id),ap=sp(di.s),walkOut=walk(ap,to),finish=arr+walkOut;
        if(!best||finish<best.finish)best={board:b.s,alight:di.s,depart:dep,arrive:arr,walkIn,walkOut,finish,route:routeName(tr)};
        break;
      }
    }
  }
  return best;
}
function simpleMove(items,a,b,t,mode,suffix=''){
  const m=moveEstimate(mode,a,b),z={walk:['🚶','徒歩'],bike:['🚲','自転車'],car:['🚗','自動車']}[mode]||['🚶','徒歩'];
  items.push({type:'travel',from:t,to:t+m,title:`${z[0]} ${z[1]} 約${m}分`,meta:`${a.name} → ${b.name}${suffix}`});return t+m;
}
async function doMove(items,a,b,t){
  const mode=tp().mode;if(mode!=='bus')return simpleMove(items,a,b,t,mode);
  const l=await busLeg(a,b,t);
  if(!l){const m=walk(a,b);items.push({type:'travel',warn:true,from:t,to:t+m,title:`🚶 徒歩 約${m}分`,meta:`利用しやすい直通バスがないため徒歩 / ${a.name} → ${b.name}`});return t+m}
  const bp=sp(l.board),ap=sp(l.alight);
  if(l.walkIn){items.push({type:'travel',from:t,to:t+l.walkIn,title:`🚶 バス停まで徒歩 約${l.walkIn}分`,meta:`${a.name} → ${bp.name}`});t+=l.walkIn}
  if(t<l.depart){items.push({type:'wait',from:t,to:l.depart,title:'🚌 バス待ち',meta:`${bp.name}で ${fmt(l.depart)}発を待つ`});t=l.depart}
  items.push({type:'bus',from:l.depart,to:l.arrive,title:`🚌 ${l.route}`,meta:`${bp.name} ${fmt(l.depart)}発 → ${ap.name} ${fmt(l.arrive)}着`});t=l.arrive;
  if(l.walkOut){items.push({type:'travel',from:t,to:t+l.walkOut,title:`🚶 降車後 徒歩 約${l.walkOut}分`,meta:`${ap.name} → ${b.name}`});t+=l.walkOut}
  return t;
}
function rentalPoint(){
  const c=P.filter(PlaceData.hasCoord).filter(p=>/レンタサイクル|今昔館おいでや|友之町駐車場/.test(p['名称']||''));
  if(c.length)return q(c.map(p=>({p,d:dist(pt.s,q(p))})).sort((a,b)=>a.d-b.d)[0].p);
  return{name:'しもすわ今昔館おいでや（レンタサイクル）',lat:36.0758,lng:138.08918};
}
function optionalPool(now,used){
  const patterns=['landmark','park','cafe','rest'];
  const out=[];
  for(const t of patterns){for(const p of candidateBase(t)){const k=PlaceData.keyOf(p);if(PlaceData.hasCoord(p)&&!used.has(k)&&timeOK(p,now))out.push({p,t})}}
  const seen=new Set();return out.filter(x=>{const k=PlaceData.keyOf(x.p);if(seen.has(k))return false;seen.add(k);return true});
}
function chooseOptional(cur,goal,now,end,used,maxWindow){
  const direct=dist(cur,goal),mode=tp().mode;
  const candidates=optionalPool(now,used).map(x=>{
    const z=q(x.p),w={t:x.t,d:'',time:'',pid:'',_autoFill:true},di=durationFor(w,x.p).d,m1=moveEstimate(mode,cur,z),m2=moveEstimate(mode,z,goal);
    const det=Math.max(0,dist(cur,z)+dist(z,goal)-direct);
    const total=m1+di+m2+RESERVE;
    let s=routeScore(x.p,cur,goal)-det*70;
    if(di+m1>maxWindow)s-=1000;
    if(now+total>end)s-=2000;
    return{x:{...x,w,di,m1,m2},s};
  }).filter(x=>x.s>-900).sort((a,b)=>b.s-a.s);
  return candidates[0]?.x||null;
}
async function fillUntil(items,curRef,nowRef,target,end,used,pts,label='予定の前'){ 
  let loops=0;
  while(loops++<4){
    const cur=curRef.value,now=nowRef.value,remaining=target-now;
    if(remaining<35)break;
    const o=chooseOptional(cur,pt.g,now,end,used,Math.max(20,remaining-10));
    if(!o)break;
    const before=nowRef.value;
    nowRef.value=await doMove(items,cur,q(o.p),nowRef.value);curRef.value=q(o.p);pts.push({...curRef.value});
    if(nowRef.value+o.di>target-5)break;
    items.push({type:'act',from:nowRef.value,to:nowRef.value+o.di,title:o.p['名称'],meta:`✨ おすすめ追加 / ${o.p['カテゴリ']||o.p['種別']||''} / 滞在${o.di}分（自動）`,point:o.p,auto:true});
    nowRef.value+=o.di;used.add(PlaceData.keyOf(o.p));STATE.generated.push(PlaceData.keyOf(o.p));
    if(nowRef.value<=before+5)break;
  }
  const gap=target-nowRef.value;
  if(gap>=25){const d=Math.min(gap-10,45);if(d>=15){items.push({type:'free',from:nowRef.value,to:nowRef.value+d,title:'周辺を散策・休憩',meta:`${label}の空き時間を活用`});nowRef.value+=d}}
}
function nextRequired(rem,cur,goal,now,end,used,random){
  const fixed=rem.filter(w=>min(w.time)!==null).sort((a,b)=>min(a.time)-min(b.time));
  if(fixed.length&&min(fixed[0].time)<=now+90)return fixed[0];
  const flex=rem.filter(w=>min(w.time)===null&&w.t!=='free');
  if(flex.length){
    const ranked=flex.map((w,i)=>{const p=chooseRequired(w,cur,goal,now,end,used,false);return{w,p,s:p?routeScore(p,cur,goal)-i*1.5:-1e9}}).filter(x=>x.p).sort((a,b)=>b.s-a.s).slice(0,4);
    if(ranked.length)return random&&ranked.length>1?ranked[Math.floor(Math.random()*Math.min(3,ranked.length))].w:ranked[0].w;
  }
  return fixed[0]||rem[0];
}
function render5(items,end,warns,pts,scheduled,autoCount){
  const total=items.filter(x=>x.type==='travel'||x.type==='bus').reduce((a,x)=>a+(x.to-x.from),0),finish=items.length?items[items.length-1].to:end;
  $('ps').textContent=finish>end?'時間超過':warns.length?'要確認':'成立';
  $('summary').innerHTML=`<span class="pill">${h($('wd').value)}曜日</span><span class="pill">${fmt(min($('st').value))} → ${fmt(end)}</span><span class="pill">${({walk:'🚶 徒歩',bike:'🚲 自転車',car:'🚗 自動車',bus:'🚌 バス'})[tp().mode]}</span><span class="pill">移動 約${total}分</span><span class="pill">希望 ${explicitCount()}件 / 実行 ${scheduled}件</span>${autoCount?`<span class="pill">✨ 自動追加 ${autoCount}件</span>`:''}`;
  $('result').innerHTML=items.map(x=>`<div class="card ${(x.type==='travel'||x.type==='bus')?'travel':''} ${x.type==='bus'?'bus-travel':''} ${(x.warn||x.type==='warn')?'warn':''} ${x.auto?'auto-added':''}"><div class="time">${x.from===x.to?fmt(x.from):fmt(x.from)+'–'+fmt(x.to)}</div><div><div class="name">${h(x.title)}</div><div class="meta">${h(x.meta||'')}</div>${x.point?`<span class="star">★${PlaceData.recommendation(x.point)}</span> ${nearBus({lat:PlaceData.lat(x.point),lng:PlaceData.lng(x.point)})}`:''}</div></div>`).join('');
  if(route)map.removeLayer(route);if(pts.length>1){route=L.polyline(pts.map(x=>[x.lat,x.lng]),{weight:4,opacity:.65}).addTo(map);map.fitBounds(route.getBounds().pad(.15))}
}

async function plan5(random=false){
  if(STATE.running)return;if(!pt.s||!pt.g)return alert('STARTとGOALを設定してください');
  STATE.running=true;STATE.lastRandom=random;STATE.generated=[];
  try{
    if(tp().mode==='bus')await ensureGTFS();
    let t=min($('st').value),end=min($('et').value),cur={...pt.s},items=[{type:'place',from:t,to:t,title:cur.name,meta:'START'}],warns=[],used=new Set(),rem=W.filter(w=>!w._autoFill).slice(),pts=[{...cur}],rent=null,scheduled=0,autoCount=0;
    if(end<=t){alert('終了時刻は開始時刻より後にしてください');return}
    if(tp().mode==='bike'&&tp().bikeMode==='rental'){
      rent=rentalPoint();t=simpleMove(items,cur,rent,t,'walk',' / レンタサイクル受取へ');cur={...rent};pts.push({...cur});items.push({type:'act',from:t,to:t+10,title:'🚲 レンタサイクルを借りる',meta:`${rent.name} / 受取手続き 10分（試作）`});t+=10;
    }
    while(rem.length){
      const w=nextRequired(rem,cur,pt.g,t,end,used,random);rem.splice(rem.indexOf(w),1);
      if(w.t==='free'){
        const d=+w.d||D.free[1];if(t+d+moveEstimate(tp().mode,cur,pt.g)<=end){items.push({type:'free',from:t,to:t+d,title:'自由時間',meta:`${d}分`});t+=d;scheduled++}else{warns.push('自由時間');items.push({type:'warn',from:t,to:t,title:'自由時間：時間内に入りません',meta:'終了時刻を優先して省略しました'})}continue;
      }
      const pref=min(w.time),p=chooseRequired(w,cur,pt.g,t,end,used,random);
      if(!p){const d=diagnostics(w.t,pref??t);items.push({type:'warn',from:t,to:t,title:D[w.t][0]+'：候補を組み込めません',meta:`全候補 ${d.all} / 座標あり ${d.coords} / ${$('wd').value}曜適合 ${d.days} / 時刻適合 ${d.opens}`});warns.push(D[w.t][0]);continue}
      const z=q(p),di=durationFor(w,p),estMove=moveEstimate(tp().mode,cur,z);
      const projectedStart=Math.max(t+estMove,pref??0),projectedFinish=projectedStart+di.d+moveEstimate(tp().mode,z,pt.g)+RESERVE;
      if(projectedFinish>end&&!w.pid){items.push({type:'warn',from:t,to:t,title:`${D[w.t][0]}：終了時刻までに収まりません`,meta:`候補 ${p['名称']} は移動・滞在・GOALまでを含めると時間不足のため省略`});warns.push(D[w.t][0]);continue}
      if(pref!==null&&pref>t+estMove+30){
        const curRef={value:cur},nowRef={value:t};await fillUntil(items,curRef,nowRef,pref-estMove,end,used,pts,'希望時刻まで');cur=curRef.value;t=nowRef.value;
      }
      t=await doMove(items,cur,z,t);cur=z;pts.push({...cur});
      if(pref!==null&&t<pref){const gap=pref-t;if(gap>=25){const d=Math.max(10,gap-10);items.push({type:'free',from:t,to:t+d,title:'近くを散策・休憩',meta:`希望時刻 ${fmt(pref)} まで`});t+=d}if(t<pref){items.push({type:'wait',from:t,to:pref,title:'到着後の待ち時間',meta:`希望時刻 ${fmt(pref)} まで`});t=pref}}
      const late=pref!==null&&t>pref+10?` / 希望 ${fmt(pref)} より約${t-pref}分遅れ`:'';
      items.push({type:'act',from:t,to:t+di.d,title:p['名称'],meta:`${D[w.t][0]} / ${p['カテゴリ']||p['種別']||''} / 滞在${di.d}分（${di.src}） / おすすめ ${PlaceData.recommendation(p)}/5${late}`,point:p});t+=di.d;used.add(PlaceData.keyOf(p));scheduled++;
    }
    let loops=0;
    while(loops++<5){
      const finalEst=moveEstimate(tp().mode,cur,pt.g),slack=end-t-finalEst;
      if(slack<=25)break;
      const o=chooseOptional(cur,pt.g,t,end,used,Math.min(60,slack-10));if(!o)break;
      const z=q(o.p);t=await doMove(items,cur,z,t);cur=z;pts.push({...cur});
      if(t+o.di+moveEstimate(tp().mode,cur,pt.g)+RESERVE>end)break;
      items.push({type:'act',from:t,to:t+o.di,title:o.p['名称'],meta:`✨ おすすめ追加 / ${o.p['カテゴリ']||o.p['種別']||''} / 滞在${o.di}分（自動）`,point:o.p,auto:true});t+=o.di;used.add(PlaceData.keyOf(o.p));autoCount++;
    }
    if(rent){
      const needBack=moveEstimate('bike',cur,rent)+5+moveEstimate('walk',rent,pt.g),slack=end-t-needBack;
      if(slack>25){const d=Math.min(45,slack-10);items.push({type:'free',from:t,to:t+d,title:'周辺を散策・休憩',meta:'返却・GOALまでの時間を残して調整'});t+=d}
      t=simpleMove(items,cur,rent,t,'bike',' / レンタサイクル返却へ');cur={...rent};pts.push({...cur});items.push({type:'act',from:t,to:t+5,title:'🚲 レンタサイクルを返却',meta:'同じ貸出場所へ返却 / 5分'});t+=5;t=simpleMove(items,cur,pt.g,t,'walk');cur={...pt.g};pts.push({...cur});
    }else{
      let finalEst=moveEstimate(tp().mode,cur,pt.g),slack=end-t-finalEst;
      if(slack>30){const d=Math.max(15,Math.min(60,slack-15));items.push({type:'free',from:t,to:t+d,title:'周辺を散策・休憩',meta:'GOALへ向かう前の空き時間を活用'});t+=d}
      t=await doMove(items,cur,pt.g,t);cur={...pt.g};pts.push({...cur});
    }
    if(t<end){const gap=end-t;if(gap<=25){items.push({type:'wait',from:t,to:end,title:'GOAL前の余裕',meta:`${gap}分の安全マージン`});t=end}else{items.push({type:'free',from:t,to:end,title:'GOAL周辺で散策・休憩',meta:`${gap}分。長い待機にならないようGOAL周辺で過ごす`});t=end}}
    items.push({type:t>end?'warn':'place',from:end,to:end,title:pt.g.name,meta:t>end?`GOAL 約${t-end}分超過`:'GOAL'});
    render5(items,end,warns,pts,scheduled,autoCount);
  }finally{STATE.running=false}
}

function hasPlan(){return !!$('result')?.querySelector('.card')}
function scheduleReplan(){if(!hasPlan()||STATE.running)return;clearTimeout(STATE.rerunTimer);STATE.rerunTimer=setTimeout(()=>plan5(STATE.lastRandom),160)}
function wrapEdits(){
  const bAdd=addWish,bChange=changeWish,bDel=delWish,bMove=moveWish,bSample=sample;
  addWish=function(...a){const r=bAdd(...a);scheduleReplan();return r};
  changeWish=function(...a){const r=bChange(...a);scheduleReplan();return r};
  delWish=function(...a){const r=bDel(...a);scheduleReplan();return r};
  moveWish=function(...a){const r=bMove(...a);scheduleReplan();return r};
  sample=function(...a){const r=bSample(...a);scheduleReplan();return r};
}
function style(){const s=document.createElement('style');s.textContent=`.auto-added{border-color:#b7dccc!important;background:#f5fbf8!important}.auto-added .name:after{content:' 自動追加';display:inline-block;margin-left:7px;padding:2px 6px;border-radius:999px;background:#dff1e9;color:#245e52;font-size:9px;vertical-align:middle}.card.wait{background:#fafafa}`;document.head.appendChild(s)}
function boot(){style();wrapEdits();plan=plan5;window.plan=plan5;const v=document.querySelector('.ver');if(v)v.textContent='planner rebuild 1.5';}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
