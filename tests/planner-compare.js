(() => {
'use strict';

const $c = id => document.getElementById(id);

function mins(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

function rangeFromText(text) {
  const matches = String(text || '').match(/\d{1,2}:\d{2}/g) || [];
  if (!matches.length) return {from:null,to:null};
  const from = mins(matches[0]);
  const to = mins(matches[1] || matches[0]);
  return {from,to};
}

function classifyLegacy(card) {
  const name = card.querySelector('.name')?.textContent?.trim() || '';
  const meta = card.querySelector('.meta')?.textContent?.trim() || '';
  const cls = card.className || '';
  if (/START|GOAL/.test(meta) && !card.querySelector('.star')) return 'place';
  if (/バス待ち/.test(name)) return 'bus-wait';
  if (/少し待つ|余裕|自由時間|散策・休憩/.test(name)) return 'wait';
  if (card.classList.contains('travel')) return /🚌/.test(name) ? 'bus' : 'travel';
  if (card.classList.contains('warn')) return 'warn';
  return 'act';
}

function scrapeLegacy() {
  return [...document.querySelectorAll('#result .card')].map(card => {
    const time = rangeFromText(card.querySelector('.time')?.textContent || '');
    const name = card.querySelector('.name')?.textContent?.trim() || '';
    const meta = card.querySelector('.meta')?.textContent?.trim() || '';
    const starText = card.querySelector('.star')?.textContent || '';
    const star = +(starText.match(/\d/)?.[0] || 0);
    return {
      type:classifyLegacy(card),
      from:time.from,
      to:time.to,
      title:name,
      meta,
      visitValue:star || null,
      auto:card.classList.contains('auto-added')
    };
  });
}

function coreLabel(x) {
  if (x.type === 'travel') {
    if (x.title === 'walk') return '🚶 徒歩';
    if (x.title === 'bike') return '🚲 自転車';
    if (x.title === 'car') return '🚗 自動車';
    if (x.title === 'walk-to-bus') return '🚶 バス停まで徒歩';
    if (x.title === 'walk-from-bus') return '🚶 降車後徒歩';
  }
  if (x.type === 'bus') return '🚌 ' + x.title;
  if (x.type === 'wait') return x.fixedTransport ? '🚌 バス待ち' : '少し待つ';
  if (x.type === 'free') return '自由時間';
  return x.title || x.type;
}

function cardHTML(x, source) {
  const a = x.from == null ? '' : PlannerCore.Time.formatMinutes(x.from);
  const b = x.to == null ? '' : PlannerCore.Time.formatMinutes(x.to);
  const time = a === b ? a : a + '–' + b;
  const value = source === 'core' && x.point ? PlaceData.recommendation(x.point) : x.visitValue;
  return '<div class="card '+((x.type==='travel'||x.type==='bus')?'travel ':'')+((x.type==='warn')?'warn ':'')+'">'+
    '<div class="time">'+time+'</div>'+
    '<div><div class="name">'+escapeHTML(source==='core'?coreLabel(x):x.title)+'</div>'+
    '<div class="meta">'+escapeHTML(x.meta || '')+
    (x.gapAbsorbed ? ' / 前の滞在へ待ち'+x.gapAbsorbed+'分吸収' : '')+'</div>'+
    (value ? '<span class="star">★'+value+'</span>' : '')+
    '</div></div>';
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function activityRows(items) {
  return items.filter(x => x.type === 'act');
}

function waitMinutes(items, fixed) {
  return items
    .filter(x => x.type === 'wait' && (fixed == null || !!x.fixedTransport === fixed))
    .reduce((a,x) => a + Math.max(0,(x.to ?? x.from) - x.from), 0);
}

function legacyWaitMinutes(items, bus) {
  return items
    .filter(x => bus ? x.type === 'bus-wait' : x.type === 'wait')
    .reduce((a,x) => a + Math.max(0,(x.to ?? x.from) - x.from), 0);
}

function travelMinutes(items) {
  return items
    .filter(x => ['travel','bus'].includes(x.type))
    .reduce((a,x) => a + Math.max(0,(x.to ?? x.from) - x.from), 0);
}

function avgVisitValue(items, isCore) {
  const vals = activityRows(items).map(x => {
    if (isCore && x.point) return PlaceData.recommendation(x.point);
    return x.visitValue || null;
  }).filter(Boolean);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}

function lunchTime(items) {
  const x = activityRows(items).find(x => /昼食|lunch/.test((x.meta||'')+' '+(x.title||'')));
  return x?.from ?? null;
}

function snackTimes(items) {
  return activityRows(items)
    .filter(x => /おやつ|snack/.test((x.meta||'')+' '+(x.title||'')))
    .map(x => x.from)
    .filter(x => x != null);
}

function sequence(items) {
  return activityRows(items).map(x => x.title);
}


function pointByLegacyTitle(title) {
  const raw = P.find(p => String(p['名称'] || '').trim() === String(title || '').trim());
  return raw && PlaceData.hasCoord(raw)
    ? {name:raw['名称'],lat:PlaceData.lat(raw),lng:PlaceData.lng(raw)}
    : null;
}

function routeQuality(items, isCore) {
  const points=[{...pt.s}];
  for(const x of activityRows(items)){
    let p=null;
    if(isCore && x.point && PlaceData.hasCoord(x.point)){
      p={name:x.point['名称'],lat:PlaceData.lat(x.point),lng:PlaceData.lng(x.point)};
    }else{
      p=pointByLegacyTitle(x.title);
    }
    if(p)points.push(p);
  }
  points.push({...pt.g});
  if(points.length<2)return null;

  let path=0,away=0;
  for(let i=1;i<points.length;i++){
    path+=PlannerCore.Geo.distanceKm(points[i-1],points[i]);
    const before=PlannerCore.Geo.distanceKm(points[i-1],pt.g);
    const after=PlannerCore.Geo.distanceKm(points[i],pt.g);
    if(after>before+0.12)away++;
  }
  const direct=PlannerCore.Geo.distanceKm(pt.s,pt.g);
  return{
    path,
    direct,
    detourRatio:direct>0?path/direct:null,
    away
  };
}

function overlapScore(a, b) {
  if (!a.length && !b.length) return 1;
  const setA = new Set(a), setB = new Set(b);
  const common = [...setA].filter(x => setB.has(x)).length;
  return common / Math.max(setA.size, setB.size, 1);
}

function findings(legacy, core, result) {
  const out = [];
  const lLunch = lunchTime(legacy), cLunch = lunchTime(core);
  const lSnack = snackTimes(legacy), cSnack = snackTimes(core);
  const lWait = legacyWaitMinutes(legacy,false), cWait = waitMinutes(core,false);
  const lBusWait = legacyWaitMinutes(legacy,true), cBusWait = waitMinutes(core,true);
  const lTravel = travelMinutes(legacy), cTravel = travelMinutes(core);
  const lAvg = avgVisitValue(legacy,false), cAvg = avgVisitValue(core,true);
  const seqScore = overlapScore(sequence(legacy), sequence(core));
  const lRoute = routeQuality(legacy,false), cRoute = routeQuality(core,true);

  const add = (level, text) => out.push({level,text});

  if (cLunch !== null && cLunch >= 11*60+30 && cLunch <= 13*60+30) add('good','新Coreの昼食は11:30〜13:30内です。');
  else if (cLunch !== null) add('bad','新Coreの昼食時刻が生活時間帯ルールから外れています。');

  if (cSnack.length) {
    const ok = cSnack.every((t,i) => cSnack.length===1 ? t>=14*60+30 && t<=15*60+45 : (i===0 ? t>=9*60+45 && t<=10*60+45 : t>=14*60+30 && t<=15*60+45));
    add(ok?'good':'warn', ok?'新Coreのおやつ時間帯は想定範囲です。':'新Coreのおやつ時間帯を再調整する余地があります。');
  }

  if (cWait < lWait) add('good','通常の待ち時間は新Coreの方が少ないです（旧 '+lWait+'分 / Core '+cWait+'分）。');
  else if (cWait > lWait) add('warn','通常の待ち時間は新Coreの方が多いです（旧 '+lWait+'分 / Core '+cWait+'分）。');

  if (cBusWait <= 10) add('good','新Coreのバス待ちは最大10分ルール内です。');
  if (lBusWait !== cBusWait) add('warn','バス待ち合計が旧版と異なります（旧 '+lBusWait+'分 / Core '+cBusWait+'分）。便選択差を確認します。');

  if (cTravel < lTravel) add('good','移動時間は新Coreの方が短いです（旧 '+lTravel+'分 / Core '+cTravel+'分）。');
  else if (cTravel > lTravel + 10) add('warn','新Coreの移動時間が旧版より10分以上長いです（旧 '+lTravel+'分 / Core '+cTravel+'分）。');

  if (lAvg !== null && cAvg !== null) {
    if (cAvg >= lAvg) add('good','平均行く価値ポイントは維持または改善しています（旧 '+lAvg.toFixed(2)+' / Core '+cAvg.toFixed(2)+'）。');
    else add('warn','平均行く価値ポイントが旧版より低下しています（旧 '+lAvg.toFixed(2)+' / Core '+cAvg.toFixed(2)+'）。');
  }

  if (seqScore >= .75) add('good','選ばれたPlaceは旧版と概ね一致しています。');
  else add('warn','旧版と新Coreで選ばれるPlaceに差があります。一致率 '+Math.round(seqScore*100)+'%。');

  if (lRoute && cRoute) {
    if (cRoute.away < lRoute.away) add('good','GOALから遠ざかる区間が減っています（旧 '+lRoute.away+'回 / Core '+cRoute.away+'回）。');
    else if (cRoute.away > lRoute.away) add('warn','GOALから遠ざかる区間が増えています（旧 '+lRoute.away+'回 / Core '+cRoute.away+'回）。');
    if (cRoute.detourRatio !== null && lRoute.detourRatio !== null) {
      if (cRoute.detourRatio <= lRoute.detourRatio) add('good','直線距離に対する総迂回率は維持または改善しています（旧 '+lRoute.detourRatio.toFixed(2)+' / Core '+cRoute.detourRatio.toFixed(2)+'）。');
      else if (cRoute.detourRatio > lRoute.detourRatio + 0.20) add('warn','新Coreの総迂回率が旧版より大きいです（旧 '+lRoute.detourRatio.toFixed(2)+' / Core '+cRoute.detourRatio.toFixed(2)+'）。');
    }
  }

  if (result.skipped?.length) add('bad','新Coreに未消化があります：'+result.skipped.map(x=>x.id+':'+x.reason).join(', '));
  if (!out.length) add('warn','大きな差分指標はありません。旅程内容を目視確認してください。');
  return out;
}

async function getGtfsIfNeeded(mode) {
  if (mode !== 'bus') return null;
  try {
    return await PlannerCore.Transport.loadGtfs('../data/gtfs/');
  } catch (e) {
    console.warn(e);
    return null;
  }
}

function currentMode() {
  return window.TransportPlanner?.mode || 'walk';
}

function currentConfig() {
  const walk = +(document.getElementById('v8walk')?.value || 10);
  return {...PlannerCore.DEFAULT_CONFIG, walkMax:walk, busWaitMax:10};
}


function setRegisteredPoint(kind, preferredNames) {
  const found = preferredNames.map(name => A.find(x => x.name === name)).find(Boolean);
  if (!found) return false;
  setPoint(kind, found);
  return true;
}

function setTransport(mode) {
  const button = document.querySelector('[data-transport="'+mode+'"]');
  if (button) button.click();
}

function setWishes(types) {
  W=[];
  seq=0;
  for (const type of types) addWish(type);
}

async function applyPreset(name) {
  const st=$c('st'), et=$c('et');
  if (!st || !et) return;

  if (name === 'walk-full') {
    setTransport('walk');
    st.value='09:00'; et.value='16:00';
    setRegisteredPoint('s',['下諏訪駅','諏訪大社 下社秋宮']);
    setRegisteredPoint('g',['下諏訪駅']);
    setWishes(['landmark','lunch','onsen','snack']);
  } else if (name === 'bike-short') {
    setTransport('bike');
    st.value='10:00'; et.value='14:00';
    setRegisteredPoint('s',['下諏訪駅']);
    setRegisteredPoint('g',['下諏訪駅']);
    setWishes(['landmark','lunch']);
  } else if (name === 'bus-day') {
    setTransport('bus');
    st.value='09:00'; et.value='16:00';
    setRegisteredPoint('s',['下諏訪駅']);
    setRegisteredPoint('g',['諏訪大社 下社春宮','下諏訪駅']);
    setWishes(['landmark','lunch','onsen']);
  } else if (name === 'two-snacks') {
    setTransport('walk');
    st.value='09:00'; et.value='16:00';
    setRegisteredPoint('s',['下諏訪駅']);
    setRegisteredPoint('g',['下諏訪駅']);
    setWishes(['snack','landmark','lunch','onsen','snack']);
  }

  await new Promise(r=>setTimeout(r,80));
  await runComparison();
}

async function runComparison() {
  const btn = $c('compareRun');
  btn.disabled = true;
  btn.textContent = '比較中…';
  try {
    if (!pt?.s || !pt?.g) {
      alert('STARTとGOALを設定してください');
      return;
    }

    await window.plan(false);
    await new Promise(r => setTimeout(r, 180));

    const legacy = scrapeLegacy();
    const mode = currentMode();
    const gtfsIndex = await getGtfsIfNeeded(mode);

    const coreResult = await PlannerCore.Schedule.buildPlan({
      start:{...pt.s},
      goal:{...pt.g},
      startTime:$c('st').value,
      endTime:$c('et').value,
      day:$c('wd').value,
      mode,
      policy:$c('policy').value,
      allowConditional:$c('allowConditional').checked,
      places:P,
      wishes:W,
      placeData:PlaceData,
      gtfsIndex,
      config:currentConfig()
    });

    const core = coreResult.itinerary;

    $c('legacyCompare').innerHTML = legacy.map(x => cardHTML(x,'legacy')).join('');
    $c('coreCompare').innerHTML = core.map(x => cardHTML(x,'core')).join('');

    const fs = findings(legacy, core, coreResult);
    $c('compareFindings').innerHTML =
      '<b>差分チェック</b>' +
      fs.map(x => '<div class="compare-'+x.level+'">'+escapeHTML(x.text)+'</div>').join('');

    const legacyActs = activityRows(legacy).length;
    const coreActs = activityRows(core).length;
    const lRoute=routeQuality(legacy,false),cRoute=routeQuality(core,true);
    $c('compareSummary').innerHTML =
      '<span class="pill">旧 Place '+legacyActs+'件</span>'+
      '<span class="pill">Core Place '+coreActs+'件</span>'+
      '<span class="pill">旧 移動 '+travelMinutes(legacy)+'分</span>'+
      '<span class="pill">Core 移動 '+travelMinutes(core)+'分</span>'+
      (lRoute?'<span class="pill">旧 逆方向 '+lRoute.away+'回</span>':'')+
      (cRoute?'<span class="pill">Core 逆方向 '+cRoute.away+'回</span>':'')+
      '<span class="pill">Core '+coreResult.status+'</span>';
  } catch (e) {
    console.error(e);
    $c('compareFindings').innerHTML = '<div class="compare-bad">比較エラー：'+escapeHTML(e.message || e)+'</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '比較する';
  }
}

const run = $c('compareRun');
if (run) run.addEventListener('click', runComparison);
document.querySelectorAll('#comparePresets [data-preset]').forEach(button=>{
  button.addEventListener('click',()=>applyPreset(button.dataset.preset));
});
})();
