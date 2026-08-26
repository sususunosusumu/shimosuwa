(() => {
  const GTFS_BASE = 'data/gtfs/';
  const transit = {
    ready: false,
    loading: false,
    error: '',
    stops: [], routes: [], trips: [], stopTimes: [], calendar: [], feedInfo: [],
    stopById: {}, routeById: {}, tripById: {}, tripTimes: {}, departuresByStop: {}, calendarById: {}
  };

  const WD_FIELD = { '月':'monday','火':'tuesday','水':'wednesday','木':'thursday','金':'friday','土':'saturday','日':'sunday' };

  function csvParseTransit(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const rows=[]; let row=[], cur='', q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if(c==='"'){
        if(q && n==='"'){ cur+='"'; i++; } else q=!q;
      } else if(c===',' && !q){ row.push(cur); cur=''; }
      else if((c==='\n'||c==='\r') && !q){
        if(c==='\r'&&n==='\n') i++;
        row.push(cur); cur='';
        if(row.some(x=>x!=='')) rows.push(row);
        row=[];
      } else cur+=c;
    }
    if(cur!==''||row.length){ row.push(cur); if(row.some(x=>x!=='')) rows.push(row); }
    if(!rows.length) return [];
    const head=rows.shift().map(x=>x.replace(/^\uFEFF/,''));
    return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
  }

  function sec(v) {
    const a=String(v||'').split(':').map(Number);
    if(a.length<2 || !Number.isFinite(a[0])) return 99999999;
    return a[0]*3600+(a[1]||0)*60+(a[2]||0);
  }
  function min(v){ return sec(v)/60; }
  function fmtBusMinute(v){ return ft(Math.round(v)); }

  async function fetchTxt(name, optional=false) {
    try {
      const r=await fetch(GTFS_BASE+name,{cache:'no-store'});
      if(!r.ok){ if(optional) return ''; throw Error(name+' '+r.status); }
      return await r.text();
    } catch(e){ if(optional) return ''; throw e; }
  }

  function validStop(s) {
    if(!s || !s.stop_lat || !s.stop_lon || !Number.isFinite(+s.stop_lat) || !Number.isFinite(+s.stop_lon)) return false;
    if(s.location_source && !String(s.location_source).startsWith('real_json')) return false;
    return true;
  }

  function tripRunsOnSelectedWeekday(trip) {
    if(!trip) return false;
    const service=trip.service_id;
    const cal=transit.calendarById[service];
    if(!cal) return true;
    const wd=document.getElementById('weekday')?.value || '月';
    const f=WD_FIELD[wd];
    return String(cal[f] ?? '1') === '1';
  }

  async function loadTransit() {
    if(transit.ready || transit.loading) return;
    transit.loading=true;
    setTransitStatus('あざみ号・スワンバス時刻表を読み込み中…');
    try {
      const [stopsTxt,routesTxt,tripsTxt,timesTxt,calTxt,feedTxt] = await Promise.all([
        fetchTxt('stops.txt'), fetchTxt('routes.txt'), fetchTxt('trips.txt'), fetchTxt('stop_times.txt'),
        fetchTxt('calendar.txt',true), fetchTxt('feed_info.txt',true)
      ]);
      transit.stops=csvParseTransit(stopsTxt).filter(validStop);
      transit.routes=csvParseTransit(routesTxt);
      transit.trips=csvParseTransit(tripsTxt);
      transit.stopTimes=csvParseTransit(timesTxt);
      transit.calendar=calTxt?csvParseTransit(calTxt):[];
      transit.feedInfo=feedTxt?csvParseTransit(feedTxt):[];
      transit.stopById=Object.fromEntries(transit.stops.map(x=>[x.stop_id,x]));
      transit.routeById=Object.fromEntries(transit.routes.map(x=>[x.route_id,x]));
      transit.tripById=Object.fromEntries(transit.trips.map(x=>[x.trip_id,x]));
      transit.calendarById=Object.fromEntries(transit.calendar.map(x=>[x.service_id,x]));
      transit.tripTimes={}; transit.departuresByStop={};
      for(const x of transit.stopTimes){
        if(!transit.stopById[x.stop_id] || !transit.tripById[x.trip_id]) continue;
        (transit.tripTimes[x.trip_id]??=[]).push(x);
        (transit.departuresByStop[x.stop_id]??=[]).push(x);
      }
      Object.values(transit.tripTimes).forEach(a=>a.sort((x,y)=>(+x.stop_sequence)-(+y.stop_sequence)));
      Object.values(transit.departuresByStop).forEach(a=>a.sort((x,y)=>sec(x.departure_time||x.arrival_time)-sec(y.departure_time||y.arrival_time)));
      transit.ready=true; transit.loading=false;
      const fi=transit.feedInfo[0]||{};
      const validity=(fi.feed_start_date||fi.feed_end_date)?` / 有効期間 ${fi.feed_start_date||'?'}–${fi.feed_end_date||'?'}`:'';
      setTransitStatus(`GTFS読込済：停留所 ${transit.stops.length} / 便 ${transit.trips.length}${validity}`,'ok');
    } catch(e){
      transit.loading=false; transit.error=e.message||String(e);
      setTransitStatus('バス時刻表を読み込めませんでした：'+transit.error,'error');
      console.error('GTFS load',e);
    }
  }

  function injectUI(){
    const mode=document.getElementById('moveMode');
    if(mode){
      if(![...mode.options].some(o=>o.value==='transit')){
        mode.add(new Option('徒歩＋バス（おすすめ）','transit'));
        mode.add(new Option('バス優先（歩きを減らす）','transit_lesswalk'));
      }
      if(mode.value==='walk') mode.value='transit';
      const holder=mode.parentElement;
      if(holder && !document.getElementById('transitStatus')){
        const s=document.createElement('div');
        s.id='transitStatus'; s.className='transit-status'; s.textContent='バス時刻表を読み込み中…';
        holder.appendChild(s);
      }
    }
    const style=document.createElement('style');
    style.textContent=`
      .transit-status{font-size:11px;color:#667085;margin-top:5px;line-height:1.45}
      .transit-status.ok{color:#276749}.transit-status.error{color:#a23535}
      .block.busAzami{background:#dbeafe;color:#1e4f9a;border-color:#93c5fd}
      .block.busSwan{background:#dcfce7;color:#166534;border-color:#86efac}
      .block.busWait{background:#f3f4f6;color:#59636e;border-style:dashed}
      .transit-legend{display:inline-flex;align-items:center;gap:5px}
      .transit-legend i{display:inline-block;width:12px;height:12px;border-radius:3px}
      .transit-note{background:#eef6ff;border:1px solid #d7e8fb;color:#315b80;border-radius:10px;padding:8px 10px;font-size:12px;margin:8px 0}
    `;
    document.head.appendChild(style);
  }

  function setTransitStatus(text,state=''){
    const e=document.getElementById('transitStatus'); if(!e)return;
    e.textContent=text; e.className='transit-status'+(state?' '+state:'');
  }

  function ptStop(s){ return {lat:+s.stop_lat,lng:+s.stop_lon,name:s.stop_name,stop_id:s.stop_id}; }
  function walkExact(a,b){ return Math.max(0,Math.round(dist(a,b)/4*60*1.15)); }

  function nearStops(point,maxWalkMin){
    return transit.stops.map(s=>{
      const p=ptStop(s), w=walkExact(point,p);
      return {stop:s,pt:p,walk:w};
    }).filter(x=>x.walk<=maxWalkMin).sort((a,b)=>a.walk-b.walk).slice(0,14);
  }

  function systemOfTrip(trip, boardStop){
    const rid=String(trip?.route_id||''), sid=String(boardStop?.stop_id||'');
    return rid.startsWith('AZAMI_')||sid.startsWith('AZAMI_')?'azami':'swan';
  }
  function routeName(trip){
    const r=transit.routeById[trip?.route_id]||{};
    return r.route_short_name||r.route_long_name||trip?.trip_headsign||'バス';
  }

  function findBusOptions(from,to,departMin,mode){
    if(!transit.ready) return [];
    const less=mode==='transit_lesswalk';
    const maxWalk=less?11:16;
    const boards=nearStops(from,maxWalk);
    const alights=nearStops(to,maxWalk);
    const alightMap=new Map(alights.map(x=>[x.stop.stop_id,x]));
    const options=[];
    const horizon=less?120:95;
    for(const b of boards){
      const earliest=(departMin+b.walk+2)*60;
      const deps=transit.departuresByStop[b.stop.stop_id]||[];
      for(const st of deps){
        const dsec=sec(st.departure_time||st.arrival_time);
        if(dsec<earliest) continue;
        if(dsec>(departMin+horizon)*60) break;
        const trip=transit.tripById[st.trip_id];
        if(!tripRunsOnSelectedWeekday(trip)) continue;
        const arr=transit.tripTimes[st.trip_id]||[];
        const boardSeq=+st.stop_sequence;
        for(const x of arr){
          if(+x.stop_sequence<=boardSeq) continue;
          const a=alightMap.get(x.stop_id); if(!a) continue;
          const asec=sec(x.arrival_time||x.departure_time);
          if(asec<=dsec) continue;
          const total=asec/60 + a.walk - departMin;
          const walking=b.walk+a.walk;
          const ride=(asec-dsec)/60;
          if(ride<2) continue;
          options.push({
            kind:'bus', total, walking, ride,
            board:b, alight:a, trip, trip_id:st.trip_id,
            depMin:dsec/60, arrMin:asec/60,
            system:systemOfTrip(trip,b.stop), routeName:routeName(trip)
          });
          break;
        }
      }
    }
    return options;
  }

  function bestMobility(from,to,departMin,mode){
    const direct=walkExact(from,to);
    if(mode==='walk' || !transit.ready) return {kind:'walk',total:direct,walking:direct};
    const buses=findBusOptions(from,to,departMin,mode);
    if(!buses.length) return {kind:'walk',total:direct,walking:direct};
    const less=mode==='transit_lesswalk';
    let best=null,bestScore=Infinity;
    for(const b of buses){
      const savedWalk=Math.max(0,direct-b.walking);
      let score;
      if(less) score=b.walking*2.25+b.total*.30;
      else score=b.total-savedWalk*.38;
      if(score<bestScore){ bestScore=score; best=b; }
    }
    if(!best) return {kind:'walk',total:direct,walking:direct};
    if(less){
      if(best.walking>=direct-2 && best.total>direct+8) return {kind:'walk',total:direct,walking:direct};
      if(best.total>direct+35 && direct<30) return {kind:'walk',total:direct,walking:direct};
      return best;
    }
    if(best.total<=direct+10 || (direct>=22 && best.walking<=direct*.55 && best.total<=direct+18)) return best;
    return {kind:'walk',total:direct,walking:direct};
  }

  function routeCoordsForBus(m){
    const arr=transit.tripTimes[m.trip_id]||[];
    const a=+((arr.find(x=>x.stop_id===m.board.stop.stop_id)?.stop_sequence)||0);
    const b=+((arr.find(x=>x.stop_id===m.alight.stop.stop_id && +x.stop_sequence>a)?.stop_sequence)||999999);
    return arr.filter(x=>+x.stop_sequence>=a&&+x.stop_sequence<=b)
      .map(x=>transit.stopById[x.stop_id]).filter(validStop).map(s=>[+s.stop_lat,+s.stop_lon]);
  }

  function addBlock(arr,type,start,end,name,meta,pt){
    if(end<=start) end=start+1;
    arr.push({type,start,end,name,meta,pt});
  }
  function addFlex(arr,a,b,label='自由時間・散策'){
    if(b-a>=5) addBlock(arr,'flex',a,b,label,(b-a)+'分の余裕時間',null);
  }

  function appendMobility(arr,route,cur,dest,ct,mapRoute){
    if(route.kind==='walk'){
      const m=route.total;
      addBlock(arr,'travel',ct,ct+m,'徒歩 約'+m+'分',cur.name+' → '+dest.name,dest);
      mapRoute.push([dest.lat,dest.lng]);
      return ct+m;
    }
    const b=route.board, a=route.alight;
    const leave=Math.max(ct,route.depMin-b.walk-5);
    if(leave>ct) addFlex(arr,ct,leave,'出発までの余裕');
    let t=leave;
    if(b.walk>0){
      addBlock(arr,'travel',t,t+b.walk,'徒歩 約'+b.walk+'分',cur.name+' → '+b.stop.stop_name+' バス停',b.pt);
      t+=b.walk; mapRoute.push([b.pt.lat,b.pt.lng]);
    }
    if(t<route.depMin){
      addBlock(arr,'busWait',t,route.depMin,'バス待ち 約'+Math.round(route.depMin-t)+'分',b.stop.stop_name+' / '+fmtBusMinute(route.depMin)+'発',b.pt);
      t=route.depMin;
    }
    const cls=route.system==='azami'?'busAzami':'busSwan';
    const label=(route.system==='azami'?'あざみ号':'スワンバス')+' '+route.routeName;
    addBlock(arr,cls,route.depMin,route.arrMin,'🚌 '+label,
      b.stop.stop_name+' '+fmtBusMinute(route.depMin)+'発 → '+a.stop.stop_name+' '+fmtBusMinute(route.arrMin)+'着',a.pt);
    const busCoords=routeCoordsForBus(route);
    busCoords.forEach(c=>mapRoute.push(c));
    t=route.arrMin;
    if(a.walk>0){
      addBlock(arr,'travel',t,t+a.walk,'徒歩 約'+a.walk+'分',a.stop.stop_name+' バス停 → '+dest.name,dest);
      t+=a.walk;
    }
    mapRoute.push([dest.lat,dest.lng]);
    return t;
  }

  function shortlistFood(kind,target,from,toHint,used){
    const base=foodCandidates(kind,target).filter(p=>!used.has(p.place_id));
    return base.map(p=>{
      const pt=pointOf(p);
      const detour=walkExact(from,pt)+(toHint?walkExact(pt,toHint):0);
      return {p,pt,detour,rating:+(p['Google評価']||0)};
    }).sort((a,b)=>(a.detour-a.rating*2)-(b.detour-b.rating*2)).slice(0,14);
  }

  function chooseFood(kind,target,from,departMin,toHint,used,mode,random){
    let cand=shortlistFood(kind,target,from,toHint,used).map(x=>{
      const mobility=bestMobility(from,x.pt,departMin,mode);
      const arrival=departMin+mobility.total;
      const late=Math.max(0,arrival-target), early=Math.max(0,target-arrival);
      const score=late*7+mobility.total*.35+early*.025+x.detour*.08-x.rating*2.2;
      return {...x,mobility,arrival,score};
    }).filter(x=>x.arrival<=target+25).sort((a,b)=>a.score-b.score);
    if(!cand.length) return null;
    const top=cand.slice(0,Math.min(5,cand.length));
    return random?top[Math.floor(Math.random()*top.length)]:top[0];
  }

  function chooseLandmark(from,departMin,toFood,targetTime,used,mode,random){
    const raw=P.filter(p=>p.latitude&&p.longitude&&p['種別']==='ランドマーク'&&!used.has(p.place_id)&&openAt(p,departMin));
    let cand=[];
    for(const p of raw){
      const pt=pointOf(p), m1=bestMobility(from,pt,departMin,mode), arrive=departMin+m1.total;
      const st=stay(p,'landmark'), after=arrive+st, m2=bestMobility(pt,toFood.pt,after,mode), final=after+m2.total;
      if(final<=targetTime+5){
        const score=m1.total+m2.total+st*.15;
        cand.push({p,pt,m1,m2,arrive,st,final,score});
      }
    }
    cand.sort((a,b)=>a.score-b.score);
    if(!cand.length)return null;
    const top=cand.slice(0,Math.min(6,cand.length));
    return random?top[Math.floor(Math.random()*top.length)]:top[0];
  }

  function enhanceLegend(){
    const legend=document.querySelector('#result .legend');
    if(!legend || legend.dataset.transitDone) return;
    legend.dataset.transitDone='1';
    legend.insertAdjacentHTML('afterbegin',
      '<span class="transit-legend"><i style="background:#dbeafe;border:1px solid #93c5fd"></i>あざみ号</span>'+ 
      '<span class="transit-legend"><i style="background:#dcfce7;border:1px solid #86efac"></i>スワンバス</span>'+ 
      '<span class="transit-legend"><i style="background:#f3f4f6;border:1px dashed #aaa"></i>バス待ち</span>');
  }

  function transitPlan(random){
    if(!points.s||!points.e){ alert('STARTとGOALを設定してください'); return; }
    if(!transit.ready){ alert('バス時刻表を読み込み中です。少し待ってからもう一度押してください。'); return; }
    const mode=document.getElementById('moveMode').value;
    const start=tm(document.getElementById('st').value), end=tm(document.getElementById('et').value);
    const t1=tm(document.getElementById('sn1').value), tl=tm(document.getElementById('lu').value), t2=tm(document.getElementById('sn2').value);
    if(!(start<t1&&t1<tl&&tl<t2&&t2<end)){ alert('時刻の順序を確認してください'); return; }

    const used=new Set(), arr=[], mapRoute=[[points.s.lat,points.s.lng]];
    let cur={...points.s}, ct=start, late=false, landmarkChosen=null;

    const first=chooseFood('snack',t1,cur,ct,points.e,used,mode,random);
    if(first){
      ct=appendMobility(arr,first.mobility,cur,first.pt,ct,mapRoute); cur={...first.pt}; used.add(first.p.place_id);
      if(ct<t1){addFlex(arr,ct,t1);ct=t1;}
      const st=stay(first.p,'snack'); addBlock(arr,'snack',ct,ct+st,first.p['名称'],'10時のおやつ / '+(first.p['カテゴリ']||''),first.pt); ct+=st;
    } else { addFlex(arr,ct,t1,'10時のおやつ：候補なし'); ct=Math.max(ct,t1); }

    const lunch=chooseFood('lunch',tl,cur,ct,points.e,used,mode,random);
    if(lunch){
      ct=appendMobility(arr,lunch.mobility,cur,lunch.pt,ct,mapRoute); cur={...lunch.pt}; used.add(lunch.p.place_id);
      if(ct<tl){addFlex(arr,ct,tl);ct=tl;}
      const st=stay(lunch.p,'lunch'); addBlock(arr,'lunch',ct,ct+st,lunch.p['名称'],'昼食 / '+(lunch.p['カテゴリ']||''),lunch.pt); ct+=st;
    } else { addFlex(arr,ct,tl,'昼食：候補なし'); ct=Math.max(ct,tl); }

    const snack2=chooseFood('snack',t2,cur,ct,points.e,used,mode,random);
    if(snack2){
      const lm=chooseLandmark(cur,ct,snack2,t2,used,mode,random);
      if(lm){
        ct=appendMobility(arr,lm.m1,cur,lm.pt,ct,mapRoute); cur={...lm.pt};
        addBlock(arr,'landmark',ct,ct+lm.st,lm.p['名称'],'立ち寄り / '+(lm.p['体験・できること']||lm.p['カテゴリ']||''),lm.pt); ct+=lm.st; used.add(lm.p.place_id); landmarkChosen=lm;
        const mToSnack=bestMobility(cur,snack2.pt,ct,mode);
        ct=appendMobility(arr,mToSnack,cur,snack2.pt,ct,mapRoute); cur={...snack2.pt};
      } else {
        const m=bestMobility(cur,snack2.pt,ct,mode);
        ct=appendMobility(arr,m,cur,snack2.pt,ct,mapRoute); cur={...snack2.pt};
      }
      used.add(snack2.p.place_id);
      if(ct<t2){addFlex(arr,ct,t2);ct=t2;}
      const st=stay(snack2.p,'snack'); addBlock(arr,'snack',ct,ct+st,snack2.p['名称'],'15時のおやつ / '+(snack2.p['カテゴリ']||''),snack2.pt); ct+=st;
    } else { addFlex(arr,ct,t2,'15時のおやつ：候補なし'); ct=Math.max(ct,t2); }

    let finalMob=bestMobility(cur,points.e,ct,mode);
    // 終了時刻に間に合わない場合、徒歩なら間に合うケースは徒歩へフォールバック。
    if(finalMob.kind==='bus' && ct+finalMob.total>end){
      const direct=walkExact(cur,points.e);
      if(ct+direct<=end) finalMob={kind:'walk',total:direct,walking:direct};
    }
    ct=appendMobility(arr,finalMob,cur,points.e,ct,mapRoute);
    if(ct<=end) addFlex(arr,ct,end,'到着後の余裕');
    else { late=true; addBlock(arr,'late',ct,ct+12,points.e.name,'GOAL / '+ft(ct)+'到着予定（'+Math.round(ct-end)+'分超過）',points.e); }

    renderPlan(arr,start,end,late,mapRoute,{lm:landmarkChosen});
    const result=document.getElementById('result');
    const note=document.createElement('div'); note.className='transit-note';
    note.textContent='移動は静的GTFS時刻表を使い、徒歩＋あざみ号／スワンバスから候補を比較しています。徒歩時間とバス停アクセスは現在、直線距離＋補正の概算です。';
    const title=result.querySelector('.result-title'); if(title) title.insertAdjacentElement('afterend',note);
    enhanceLegend();
  }

  function install(){
    injectUI();
    const originalPlan=plan;
    plan=function(random){
      const mode=document.getElementById('moveMode')?.value||'walk';
      if(mode==='transit'||mode==='transit_lesswalk') return transitPlan(random);
      return originalPlan(random);
    };
    const ver=document.querySelector('.ver'); if(ver) ver.textContent='v6.0';
    document.title='下諏訪 時間プランナー v6.0';
    loadTransit();
  }

  install();
})();
