(() => {
'use strict';

/**
 * Integrated planner core - Phase B skeleton.
 *
 * IMPORTANT:
 * - This file is loaded by index.html but remains inactive unless the Core UI adapter is enabled.
 * - V1.11 remains the default/reference planner; ?planner=core enables the preview.
 * - Functions here are side-effect free where practical so they can be
 *   compared with the legacy planner before cut-over.
 */
const DEFAULT_CONFIG = Object.freeze({
  walkMax: 10,
  busWaitMax: 10,
  minAutoVisitValue: 3,
  maxGapAbsorb: 30,
  goalReserve: 10
});

const TYPE = Object.freeze({
  snack: 'snack',
  lunch: 'lunch',
  landmark: 'landmark',
  onsen: 'onsen',
  cafe: 'cafe',
  park: 'park',
  rest: 'rest',
  free: 'free'
});

const FLEXIBLE_TYPES = new Set([
  TYPE.landmark,
  TYPE.onsen,
  TYPE.park,
  TYPE.cafe,
  TYPE.rest
]);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1] * 60) + (+m[2]) : null;
}

function formatMinutes(value) {
  const n = Math.max(0, Math.round(value));
  return String(Math.floor(n / 60) % 24).padStart(2, '0') +
    ':' + String(n % 60).padStart(2, '0');
}

function distanceKm(a, b) {
  const R = 6371;
  const rad = x => x * Math.PI / 180;
  const dp = rad(b.lat - a.lat);
  const dl = rad(b.lng - a.lng);
  const q = Math.sin(dp / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) *
    Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function estimateSimpleMove(mode, a, b) {
  const km = distanceKm(a, b);
  if (mode === 'bike') return Math.max(2, Math.round(km / 12 * 60 * 1.15));
  if (mode === 'car') return Math.max(4, Math.round(km / 28 * 60 * 1.22) + 3);
  return Math.max(2, Math.round(km / 4 * 60 * 1.18));
}

function timeWindowFor(wish, snackIndex, snackTotal, start, end) {
  if (wish.manualTime) {
    const t = toMinutes(wish.manualTime);
    return {min: t, max: t + 20, target: t, label: '指定'};
  }

  const band = wish.band || 'auto';
  if (band !== 'auto') {
    if (band === 'morning') {
      return {min: Math.max(start, 9 * 60), max: Math.min(end, 11 * 60 + 30), target: 10 * 60, label: '午前'};
    }
    if (band === 'noon') {
      return {min: Math.max(start, 11 * 60 + 30), max: Math.min(end, 13 * 60 + 30), target: 12 * 60 + 15, label: '昼ごろ'};
    }
    if (band === 'earlypm') {
      return {min: Math.max(start, 13 * 60), max: Math.min(end, 15 * 60), target: 14 * 60, label: '午後前半'};
    }
    if (band === 'latepm') {
      return {min: Math.max(start, 14 * 60 + 30), max: Math.min(end, 16 * 60 + 30), target: 15 * 60, label: '15時前後'};
    }
  }

  if (wish.type === TYPE.lunch) {
    return {
      min: Math.max(start, 11 * 60 + 30),
      max: Math.min(end, 13 * 60 + 30),
      target: 12 * 60 + 15,
      label: '昼食 11:30〜13:30'
    };
  }

  if (wish.type === TYPE.snack) {
    if (snackTotal <= 1) {
      return {
        min: Math.max(start, 14 * 60 + 30),
        max: Math.min(end, 15 * 60 + 45),
        target: 15 * 60,
        label: '午後のおやつ'
      };
    }
    if (snackIndex === 0) {
      return {
        min: Math.max(start, 9 * 60 + 45),
        max: Math.min(end, 10 * 60 + 45),
        target: 10 * 60 + 15,
        label: '午前のおやつ'
      };
    }
    return {
      min: Math.max(start, 14 * 60 + 30),
      max: Math.min(end, 15 * 60 + 45),
      target: 15 * 60,
      label: '午後のおやつ'
    };
  }

  return {min: start, max: end, target: null, label: '時間帯おまかせ'};
}

function makeTimeWindows(wishes, start, end) {
  const snacks = wishes.filter(w => w.type === TYPE.snack);
  const snackIndex = new Map(snacks.map((w, i) => [w.id, i]));
  return new Map(wishes.map(w => [
    w.id,
    timeWindowFor(w, snackIndex.get(w.id) || 0, snacks.length, start, end)
  ]));
}

function isAutoCandidate(place, options = {}) {
  const {
    explicit = false,
    allowConditional = false,
    minVisitValue = DEFAULT_CONFIG.minAutoVisitValue
  } = options;

  const deleted = String(place.raw?.['削除予定'] ?? place['削除予定'] ?? '').toLowerCase() === 'yes';
  if (deleted) return false;
  if (explicit) return true;
  const level = String(place.autoLevel || place['自動提案'] || 'normal');
  const visitValue = clamp(Number(place.visitValue ?? place['おすすめ度'] ?? 3) || 3, 1, 5);

  if (level === 'hidden') return false;
  if (level === 'conditional' && !allowConditional) return false;
  return visitValue >= minVisitValue;
}

function routeMetrics(from, candidate, goal) {
  const direct = distanceKm(from, goal);
  const leg = distanceKm(from, candidate);
  const after = distanceKm(candidate, goal);
  const detour = Math.max(0, leg + after - direct);
  const progress = direct - after;
  const efficiency = direct > 0 ? direct / Math.max(direct, leg + after) : 1;
  const backtrack = Math.max(0, after - direct);
  return {direct, leg, after, detour, progress, efficiency, backtrack};
}

function ownerPriorityBonus(place) {
  const owner = place.ownerRecommendation || {};
  const push = clamp(Number(owner.push ?? place['オーナー推し度'] ?? 0) || 0, 0, 5);
  const rawRank = Number(owner.rank ?? place['オーナーおすすめ順']);
  const rank = Number.isFinite(rawRank) && rawRank > 0 ? rawRank : null;

  // 0 means "not evaluated", so it is neutral.
  let bonus = [0,-18,0,12,26,40][push] || 0;

  // Rank is a tie-break / refinement, not a replacement for route feasibility.
  if (rank !== null) bonus += Math.max(0, 16 - Math.min(rank, 20) * 0.8);
  return bonus;
}

function scorePlace(place, from, goal, context = {}) {
  const visitValue = clamp(Number(place.visitValue ?? place['おすすめ度'] ?? 3) || 3, 1, 5);
  const z = {lat: Number(place.lat ?? place.latitude), lng: Number(place.lng ?? place.longitude)};
  const m = routeMetrics(from, z, goal);

  // Value matters, but it must not justify a large reversal or detour.
  let score =
    visitValue * 20 +
    ownerPriorityBonus(place) +
    m.progress * 34 -
    m.detour * 88 -
    m.leg * 3 +
    m.efficiency * 12;

  // Explicitly penalize moving away from GOAL.
  if (m.progress < 0) score -= Math.abs(m.progress) * 55;
  if (m.backtrack > 0.20) score -= 30 + (m.backtrack - 0.20) * 70;
  if (m.backtrack > 0.60) score -= 65;

  if (context.rainSuitable) score += 12;
  if (context.seniorSuitable) score += 12;
  if (context.policy === 'recommended') score += visitValue * 10;
  if (context.policy === 'near') score -= m.leg * 18;
  if (context.autoLevel === 'promote') score += 12;
  if (context.autoLevel === 'conditional') score -= 8;

  return score;
}

function isFlexibleItem(item) {
  if (!item || item.type !== 'act') return false;
  if (item.auto) return true;
  if (item.flexible === true) return true;
  return FLEXIBLE_TYPES.has(item.wishType);
}

/**
 * Absorb short non-bus waiting gaps into the immediately preceding flexible
 * activity. This is the itinerary-level replacement for planner-wait-optimizer.
 *
 * Item shape used by the new core:
 * {type, from, to, wishType, flexible, auto, fixedTransport}
 */
function absorbShortGaps(items, config = DEFAULT_CONFIG) {
  const out = items.map(x => ({...x}));

  for (let i = 0; i < out.length; i++) {
    const wait = out[i];
    if (!wait || wait.type !== 'wait' || wait.fixedTransport) continue;

    const gap = wait.to - wait.from;
    if (gap <= 0 || gap > config.maxGapAbsorb) continue;

    const travel = out[i - 1];
    const previous = out[i - 2];

    if (!travel || travel.type !== 'travel' || travel.fixedTransport) continue;
    if (!previous || !isFlexibleItem(previous)) continue;
    if (previous.to !== travel.from || travel.to !== wait.from) continue;

    previous.to += gap;
    previous.duration = previous.to - previous.from;
    previous.gapAbsorbed = (previous.gapAbsorbed || 0) + gap;

    travel.from += gap;
    travel.to += gap;

    out.splice(i, 1);
    i = Math.max(-1, i - 3);
  }

  return out;
}


function normalizePlace(raw, placeData = window.PlaceData) {
  const pd = placeData || {};
  const effective = (name) => typeof pd.effective === 'function' ? pd.effective(raw, name) : (raw[name] ?? '');
  const truthy = (value) => typeof pd.truthy === 'function'
    ? pd.truthy(value)
    : ['yes','true','○','1','on','積極','通常'].includes(String(value || '').trim().toLowerCase());

  return {
    raw,
    id: typeof pd.keyOf === 'function' ? pd.keyOf(raw) : String(raw.place_id || raw['名称'] || ''),
    name: String(raw['名称'] || raw.name || ''),
    lat: typeof pd.lat === 'function' ? pd.lat(raw) : Number(raw.latitude ?? raw.lat),
    lng: typeof pd.lng === 'function' ? pd.lng(raw) : Number(raw.longitude ?? raw.lng),
    visitValue: typeof pd.recommendation === 'function'
      ? pd.recommendation(raw)
      : clamp(Number(raw['おすすめ度'] ?? 3) || 3, 1, 5),
    ownerRecommendation: typeof pd.ownerRecommendation === 'function'
      ? pd.ownerRecommendation(raw)
      : {
          push:clamp(Number(raw['オーナー推し度'] ?? 0) || 0, 0, 5),
          rank:Number(raw['オーナーおすすめ順']) > 0 ? Number(raw['オーナーおすすめ順']) : null,
          note:String(raw['オーナー評価メモ'] || '')
        },
    autoLevel: typeof pd.autoLevel === 'function'
      ? pd.autoLevel(raw)
      : String(raw['自動提案'] || 'normal'),
    categoryText: [
      raw['種別'], raw['カテゴリ'], raw['サブカテゴリ'],
      raw['体験・できること'], raw['料理ジャンル'], raw['提供メニュータグ']
    ].filter(Boolean).join(' '),
    businessDays: effective('営業日'),
    businessHours: effective('営業時間'),
    closedDays: effective('定休日'),
    suitable: {
      breakfast: truthy(effective('朝食向き')),
      snack: truthy(effective('おやつ向き')),
      lunch: truthy(effective('昼食向き')),
      rest: truthy(effective('休憩向き')),
      landmark: truthy(effective('観光向き')),
      rain: truthy(effective('雨の日向き')),
      senior: truthy(effective('高齢者向き'))
    }
  };
}

function matchWishType(place, type) {
  const p = place.raw || place;
  const text = place.categoryText || [
    p['種別'], p['カテゴリ'], p['サブカテゴリ'],
    p['体験・できること'], p['料理ジャンル'], p['提供メニュータグ']
  ].filter(Boolean).join(' ');
  const suitable = place.suitable || {};

  if (type === TYPE.snack) return !!suitable.snack || /カフェ|喫茶|ベーカリー|パン|菓子|ケーキ|軽食/.test(text);
  if (type === TYPE.lunch) return !!suitable.lunch || p['種別'] === '飲食店';
  if (type === TYPE.cafe) return /カフェ|喫茶/.test(text);
  if (type === TYPE.onsen) return /温泉|足湯/.test(text);
  if (type === TYPE.park) return /公園|自然|湖畔|散歩/.test(text);
  if (type === TYPE.rest) return !!suitable.rest || /休憩|公園|カフェ|温泉/.test(text);
  if (type === TYPE.landmark) {
    if (suitable.landmark) return true;
    return /神社|寺院|史跡|博物館|美術館|景勝|公園|温泉|文化|自然|観光/.test(text) &&
      !/コンビニ|スーパー|行政|医療|公衆トイレ|駐車場|レンタサイクル|生活サービス/.test(text);
  }
  return false;
}

function dayOK(place, day) {
  const closed = String(place.closedDays ?? '');
  const days = String(place.businessDays ?? '');
  if (closed.includes(day)) return false;
  if (!days || days === '毎日') return true;
  if (days === '平日') return !['土','日'].includes(day);
  return days.includes(day);
}

function timeOK(place, at, day) {
  if (!dayOK(place, day)) return false;
  const hours = String(place.businessHours || '');
  if (!hours || hours.includes('24時間')) return true;
  const ranges = [...hours.matchAll(/(\d{1,2}):(\d{2})\s*(?:-|〜|～)\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return true;
  return ranges.some(x => {
    const start = +x[1] * 60 + +x[2];
    let end = +x[3] * 60 + +x[4];
    if (end === 0) end = 1440;
    return at >= start && at <= end;
  });
}

function candidatePool(rawPlaces, type, options = {}) {
  const {
    at = 12 * 60,
    day = '月',
    allowConditional = false,
    explicitId = null,
    placeData = window.PlaceData
  } = options;

  return rawPlaces
    .map(p => normalizePlace(p, placeData))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0)
    .filter(p => matchWishType(p, type))
    .filter(p => timeOK(p, at, day))
    .filter(p => isAutoCandidate(p, {
      explicit: explicitId !== null && p.id === explicitId,
      allowConditional
    }));
}

function gtfsTime(value) {
  const m = String(value || '').match(/^(\d+):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

function createGtfsIndex(data) {
  const stops = (data.stops || []).filter(x => +x.stop_lat && +x.stop_lon);
  const routes = new Map((data.routes || []).map(x => [x.route_id, x]));
  const trips = new Map((data.trips || []).map(x => [x.trip_id, x]));
  const calendar = new Map((data.calendar || []).map(x => [x.service_id, x]));
  const byStop = new Map();
  const byTrip = new Map();

  for (const x of data.stopTimes || []) {
    if (!byStop.has(x.stop_id)) byStop.set(x.stop_id, []);
    byStop.get(x.stop_id).push(x);
    if (!byTrip.has(x.trip_id)) byTrip.set(x.trip_id, []);
    byTrip.get(x.trip_id).push(x);
  }
  for (const rows of byStop.values()) rows.sort((a, b) => (gtfsTime(a.departure_time) ?? 1e9) - (gtfsTime(b.departure_time) ?? 1e9));
  for (const rows of byTrip.values()) rows.sort((a, b) => +a.stop_sequence - +b.stop_sequence);

  return {stops, routes, trips, calendar, byStop, byTrip};
}

function gtfsServiceOK(index, serviceId, day) {
  const row = index.calendar.get(serviceId);
  if (!row) return true;
  const key = {月:'monday',火:'tuesday',水:'wednesday',木:'thursday',金:'friday',土:'saturday',日:'sunday'}[day] || 'monday';
  return String(row[key]) === '1';
}

function stopPoint(stop) {
  return {
    name: stop.stop_name || 'バス停',
    lat: +stop.stop_lat,
    lng: +stop.stop_lon
  };
}

function walkMinutes(a, b) {
  return estimateSimpleMove('walk', a, b);
}

function nearestStops(index, point, config = DEFAULT_CONFIG, limit = 6) {
  return index.stops
    .map(stop => {
      const p = stopPoint(stop);
      return {stop, walk: walkMinutes(point, p), distance: distanceKm(point, p)};
    })
    .filter(x => x.walk <= config.walkMax)
    .sort((a, b) => a.walk - b.walk)
    .slice(0, limit);
}

function gtfsRouteName(index, trip) {
  const route = index.routes.get(trip.route_id) || {};
  return [route.route_short_name, route.route_long_name].filter(Boolean).join(' ') || 'バス';
}

function findBusLeg(index, from, to, start, day, config = DEFAULT_CONFIG) {
  const boardStops = nearestStops(index, from, config);
  const alightStops = nearestStops(index, to, config);
  if (!boardStops.length || !alightStops.length) return null;

  const destIds = new Set(alightStops.map(x => x.stop.stop_id));
  const destMap = new Map(alightStops.map(x => [x.stop.stop_id, x]));
  let best = null;

  for (const board of boardStops) {
    const reach = start + board.walk;
    for (const row of index.byStop.get(board.stop.stop_id) || []) {
      const depart = gtfsTime(row.departure_time);
      if (depart === null || depart < reach) continue;
      const wait = depart - reach;
      if (wait > config.busWaitMax) break;

      const trip = index.trips.get(row.trip_id);
      if (!trip || !gtfsServiceOK(index, trip.service_id, day)) continue;

      for (const after of index.byTrip.get(row.trip_id) || []) {
        if (+after.stop_sequence <= +row.stop_sequence || !destIds.has(after.stop_id)) continue;

        const dest = destMap.get(after.stop_id);
        const arrive = gtfsTime(after.arrival_time || after.departure_time);
        if (arrive === null) continue;

        const finish = arrive + dest.walk;
        const candidate = {
          kind: 'bus',
          board: board.stop,
          alight: dest.stop,
          walkIn: board.walk,
          walkOut: dest.walk,
          wait,
          depart,
          arrive,
          finish,
          route: gtfsRouteName(index, trip)
        };
        if (!best || candidate.finish < best.finish) best = candidate;
        break;
      }
    }
  }
  return best;
}

async function loadGtfs(basePath = 'data/gtfs/', fetchImpl = window.fetch) {
  async function read(name) {
    const response = await fetchImpl(basePath + name, {cache:'force-cache'});
    if (!response.ok) throw new Error(name + ' could not be loaded');
    const text = await response.text();
    if (!window.PlaceData || typeof window.PlaceData.parseCSV !== 'function') {
      throw new Error('PlaceData.parseCSV is required to load GTFS');
    }
    return window.PlaceData.parseCSV(text);
  }

  const [stops, routes, trips, stopTimes, calendar] = await Promise.all([
    read('stops.txt'),
    read('routes.txt'),
    read('trips.txt'),
    read('stop_times.txt'),
    read('calendar.txt')
  ]);
  return createGtfsIndex({stops, routes, trips, stopTimes, calendar});
}

async function previewMove(mode, from, to, start, options = {}) {
  const config = {...DEFAULT_CONFIG, ...(options.config || {})};

  if (mode === 'walk') {
    const duration = estimateSimpleMove('walk', from, to);
    return duration <= config.walkMax
      ? {kind:'simple', mode:'walk', duration, finish:start + duration}
      : null;
  }

  if (mode === 'bike' || mode === 'car') {
    const duration = estimateSimpleMove(mode, from, to);
    return {kind:'simple', mode, duration, finish:start + duration};
  }

  if (mode === 'bus') {
    const index = options.gtfsIndex;
    if (!index) throw new Error('gtfsIndex is required for bus preview');
    const bus = findBusLeg(index, from, to, start, options.day || '月', config);
    if (bus) return bus;

    const duration = estimateSimpleMove('walk', from, to);
    return duration <= config.walkMax
      ? {kind:'simple', mode:'walk', duration, finish:start + duration, fallback:true}
      : null;
  }

  throw new Error('Unsupported transport mode: ' + mode);
}


function numberList(value) {
  return (String(value ?? '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

function stayMinutes(wish, place, placeData = window.PlaceData) {
  if (wish.duration !== '' && +wish.duration > 0) return Math.max(10, +wish.duration);
  const raw = place.raw || place;
  const value = placeData && typeof placeData.effective === 'function'
    ? placeData.effective(raw, '推奨滞在時間_分')
    : raw['推奨滞在時間_分'];
  const nums = numberList(value);
  let d = nums.length > 1 ? (nums[0] + nums[1]) / 2 : (nums[0] || 30);
  return Math.max(15, Math.round(d / 5) * 5);
}

function transportItems(from, to, start, movement) {
  if (!movement) return [];
  if (movement.kind === 'simple') {
    return [{
      type:'travel',
      from:start,
      to:movement.finish,
      mode:movement.mode,
      title:movement.mode,
      meta:from.name + ' → ' + to.name,
      fixedTransport:false,
      fallback:!!movement.fallback
    }];
  }

  const items = [];
  let t = start;
  const board = stopPoint(movement.board);
  const alight = stopPoint(movement.alight);

  if (movement.walkIn > 0) {
    items.push({
      type:'travel', from:t, to:t + movement.walkIn, mode:'walk',
      title:'walk-to-bus', meta:from.name + ' → ' + board.name,
      fixedTransport:false
    });
    t += movement.walkIn;
  }
  if (movement.wait > 0) {
    items.push({
      type:'wait', from:t, to:movement.depart, title:'bus-wait',
      meta:board.name, fixedTransport:true
    });
    t = movement.depart;
  }
  items.push({
    type:'bus', from:movement.depart, to:movement.arrive,
    title:movement.route, meta:board.name + ' → ' + alight.name,
    fixedTransport:true
  });
  t = movement.arrive;

  if (movement.walkOut > 0) {
    items.push({
      type:'travel', from:t, to:t + movement.walkOut, mode:'walk',
      title:'walk-from-bus', meta:alight.name + ' → ' + to.name,
      fixedTransport:false
    });
  }
  return items;
}

async function evaluateWishCandidate(wish, place, window, state, input) {
  const movement = await previewMove(
    input.mode,
    state.current,
    {name:place.name, lat:place.lat, lng:place.lng},
    state.now,
    {
      config:input.config,
      gtfsIndex:input.gtfsIndex,
      day:input.day
    }
  );
  if (!movement) return null;

  const begin = Math.max(movement.finish, window.min);
  if (begin > window.max + 20) return null;
  if (!timeOK(place, begin, input.day)) return null;

  const duration = stayMinutes(wish, place, input.placeData);
  const finish = begin + duration;
  if (finish > input.end - input.config.goalReserve) return null;

  const goalMove = await previewMove(
    input.mode,
    {name:place.name, lat:place.lat, lng:place.lng},
    input.goal,
    finish,
    {
      config:input.config,
      gtfsIndex:input.gtfsIndex,
      day:input.day
    }
  );
  if (!goalMove || goalMove.finish > input.end) return null;

  const context = {
    policy:input.policy,
    rainSuitable:!!place.suitable?.rain,
    seniorSuitable:!!place.suitable?.senior,
    autoLevel:place.autoLevel
  };
  let score = scorePlace(place, state.current, input.goal, context);
  const wait = Math.max(0, begin - movement.finish);
  score -= wait * 1.4;
  if (window.target !== null) score -= Math.abs(begin - window.target) * 0.65;
  if (begin > window.max) score -= 90;

  return {place, movement, begin, duration, finish, goalMove, score, wait};
}

async function chooseWish(rem, windows, state, input) {
  let best = null;

  for (const wish of rem) {
    if (wish.type === TYPE.free) continue;
    const window = windows.get(wish.id);
    if (window.target !== null && state.now < window.min - 50) continue;

    let candidates;
    if (wish.placeId) {
      const raw = input.rawPlaces.find(p => {
        const normalized = normalizePlace(p, input.placeData);
        return normalized.id === wish.placeId;
      });
      candidates = raw ? [normalizePlace(raw, input.placeData)] : [];
    } else {
      candidates = candidatePool(input.rawPlaces, wish.type, {
        at:Math.max(state.now, window.min),
        day:input.day,
        allowConditional:input.allowConditional,
        placeData:input.placeData
      });
    }

    const usedFiltered = candidates
      .filter(p => wish.placeId || !state.used.has(p.id))
      .map(p => ({
        p,
        preliminary:scorePlace(p, state.current, input.goal, {
          policy:input.policy,
          rainSuitable:!!p.suitable?.rain,
          seniorSuitable:!!p.suitable?.senior,
          autoLevel:p.autoLevel
        })
      }))
      .sort((a,b) => b.preliminary - a.preliminary)
      .slice(0, 18);

    for (const entry of usedFiltered) {
      const evaluated = await evaluateWishCandidate(wish, entry.p, window, state, input);
      if (!evaluated) continue;
      const total = urgency(window, state.now) + evaluated.score;
      if (!best || total > best.total) best = {wish, evaluated, total};
    }
  }

  if (best) return best;

  // If all time-window candidates are too early, evaluate every remaining wish.
  for (const wish of rem) {
    if (wish.type === TYPE.free) continue;
    const window = windows.get(wish.id);
    const candidates = wish.placeId
      ? input.rawPlaces.map(p => normalizePlace(p, input.placeData)).filter(p => p.id === wish.placeId)
      : candidatePool(input.rawPlaces, wish.type, {
          at:Math.max(state.now, window.min),
          day:input.day,
          allowConditional:input.allowConditional,
          placeData:input.placeData
        });

    for (const place of candidates.slice(0, 18)) {
      if (!wish.placeId && state.used.has(place.id)) continue;
      const evaluated = await evaluateWishCandidate(wish, place, window, state, input);
      if (!evaluated) continue;
      if (!best || evaluated.score > best.total) best = {wish, evaluated, total:evaluated.score};
    }
  }

  return best;
}


async function chooseFiller(state, input, targetTime = null, maxStay = 35) {
  const types = [TYPE.landmark, TYPE.park, TYPE.cafe, TYPE.rest];
  let best = null;

  for (const type of types) {
    const pool = candidatePool(input.rawPlaces, type, {
      at:state.now,
      day:input.day,
      allowConditional:input.allowConditional,
      placeData:input.placeData
    });

    const ranked = pool
      .filter(p => !state.used.has(p.id))
      .map(p => ({
        p,
        score:scorePlace(p, state.current, input.goal, {
          policy:input.policy,
          rainSuitable:!!p.suitable?.rain,
          seniorSuitable:!!p.suitable?.senior,
          autoLevel:p.autoLevel
        })
      }))
      .sort((a,b) => b.score - a.score)
      .slice(0, 20);

    for (const entry of ranked) {
      const place = entry.p;
      const destination = {name:place.name, lat:place.lat, lng:place.lng};
      const movement = await previewMove(input.mode, state.current, destination, state.now, {
        config:input.config,
        gtfsIndex:input.gtfsIndex,
        day:input.day
      });
      if (!movement) continue;

      const rawStay = stayMinutes({type,duration:''}, place, input.placeData);
      const duration = Math.min(maxStay, rawStay);
      const finish = movement.finish + duration;

      if (targetTime !== null && finish > targetTime - 5) continue;
      if (finish > input.end - input.config.goalReserve) continue;

      const goalMove = await previewMove(input.mode, destination, input.goal, finish, {
        config:input.config,
        gtfsIndex:input.gtfsIndex,
        day:input.day
      });
      if (!goalMove || goalMove.finish > input.end) continue;

      const score = entry.score - (movement.finish - state.now) * 1.0;
      if (!best || score > best.score) {
        best = {type, place, destination, movement, duration, finish, score};
      }
    }
  }

  return best;
}

function appendFiller(state, filler, label) {
  state.items.push(...transportItems(state.current, filler.destination, state.now, filler.movement));
  state.now = filler.movement.finish;
  state.items.push({
    type:'act',
    from:state.now,
    to:state.now + filler.duration,
    title:filler.place.name,
    meta:'✨ ' + label,
    wishType:filler.type,
    point:filler.place.raw,
    placeId:filler.place.id,
    flexible:true,
    auto:true
  });
  state.now += filler.duration;
  state.current = filler.destination;
  state.used.add(filler.place.id);
  state.autoAdded.push(filler.place.id);
}

/**
 * Shadow schedule builder.
 *
 * This intentionally does not render DOM and does not replace V1.11 yet.
 * It returns a normalized itinerary for side-by-side comparison.
 */
async function buildPlan(options) {
  const config = {...DEFAULT_CONFIG, ...(options.config || {})};
  const start = toMinutes(options.startTime);
  const end = toMinutes(options.endTime);
  if (start === null || end === null || end <= start) throw new Error('Invalid start/end time');
  if (!options.start || !options.goal) throw new Error('START and GOAL are required');

  const rawPlaces = options.places || [];
  const wishes = (options.wishes || []).map((w, i) => ({
    id:w.id ?? i + 1,
    type:w.type || w.t,
    duration:w.duration ?? w.d ?? '',
    manualTime:w.manualTime || w._manualTime || w.time || '',
    band:w.band || w._band || 'auto',
    placeId:w.placeId || w.pid || ''
  }));

  const input = {
    config,
    start:options.start,
    goal:options.goal,
    startTime:start,
    end,
    day:options.day || '月',
    mode:options.mode || 'walk',
    policy:options.policy || 'recommended',
    allowConditional:!!options.allowConditional,
    rawPlaces,
    placeData:options.placeData || window.PlaceData,
    gtfsIndex:options.gtfsIndex || null
  };

  const windows = makeTimeWindows(wishes, start, end);
  const state = {
    now:start,
    current:{...options.start},
    used:new Set(options.excludedPlaceIds || []),
    items:[{type:'place',from:start,to:start,title:options.start.name || 'START',meta:'START'}],
    completed:[],
    skipped:[],
    autoAdded:[]
  };
  const rem = wishes.slice();

  while (rem.length) {
    const free = rem.find(w => w.type === TYPE.free);
    const choice = await chooseWish(rem, windows, state, input);

    if (!choice) {
      if (free) {
        rem.splice(rem.indexOf(free), 1);
        const duration = Math.max(10, +(free.duration || 30));
        const goalMove = await previewMove(input.mode, state.current, input.goal, state.now + duration, {
          config, gtfsIndex:input.gtfsIndex, day:input.day
        });
        if (goalMove && goalMove.finish <= end) {
          state.items.push({type:'free',from:state.now,to:state.now + duration,title:'free',meta:'自由時間'});
          state.now += duration;
          state.completed.push(free.id);
        } else {
          state.skipped.push({id:free.id, reason:'time'});
        }
        continue;
      }

      for (const w of rem.splice(0)) state.skipped.push({id:w.id, reason:'no-candidate'});
      break;
    }

    const {wish, evaluated} = choice;

    if (evaluated.wait >= 20) {
      const filler = await chooseFiller(state, input, evaluated.begin, 30);
      if (filler) {
        appendFiller(state, filler, '次の予定までのおすすめ追加');
        continue;
      }
    }

    rem.splice(rem.indexOf(wish), 1);

    const destination = {
      name:evaluated.place.name,
      lat:evaluated.place.lat,
      lng:evaluated.place.lng
    };
    const moveItems = transportItems(state.current, destination, state.now, evaluated.movement);
    state.items.push(...moveItems);
    state.now = evaluated.movement.finish;

    if (evaluated.begin > state.now) {
      state.items.push({
        type:'wait',
        from:state.now,
        to:evaluated.begin,
        title:'少し待つ',
        meta:windows.get(wish.id).label,
        fixedTransport:false
      });
      state.now = evaluated.begin;
    }

    state.items.push({
      type:'act',
      from:state.now,
      to:state.now + evaluated.duration,
      title:evaluated.place.name,
      meta:wish.type,
      wishType:wish.type,
      wishId:wish.id,
      point:evaluated.place.raw,
      placeId:evaluated.place.id,
      flexible:FLEXIBLE_TYPES.has(wish.type),
      auto:false
    });
    state.now += evaluated.duration;
    state.current = destination;
    state.used.add(evaluated.place.id);
    state.completed.push(wish.id);
  }

  let goalMove = await previewMove(input.mode, state.current, input.goal, state.now, {
    config,
    gtfsIndex:input.gtfsIndex,
    day:input.day
  });

  let fillGuard = 0;
  while (goalMove && goalMove.finish <= end && end - goalMove.finish > 45 && fillGuard++ < 4) {
    const filler = await chooseFiller(state, input, end, 35);
    if (!filler) break;
    appendFiller(state, filler, 'GOALまでの空き時間におすすめ追加');
    goalMove = await previewMove(input.mode, state.current, input.goal, state.now, {
      config,
      gtfsIndex:input.gtfsIndex,
      day:input.day
    });
  }

  if (goalMove && goalMove.finish <= end) {
    state.items.push(...transportItems(state.current, input.goal, state.now, goalMove));
    state.now = goalMove.finish;
  } else {
    state.skipped.push({id:'GOAL', reason:'transport'});
  }

  state.items.push({
    type:state.now <= end ? 'place' : 'warn',
    from:end,
    to:end,
    title:input.goal.name || 'GOAL',
    meta:state.now <= end ? 'GOAL' : 'GOAL time over'
  });

  const optimized = absorbShortGaps(state.items, config);

  return {
    version:'shadow-plan-0.2',
    status:state.now <= end && !state.skipped.some(x => x.id === 'GOAL') ? 'ok' : 'review',
    start,
    end,
    finish:state.now,
    completed:state.completed,
    skipped:state.skipped,
    autoAdded:state.autoAdded,
    itinerary:optimized
  };
}

function urgency(window, now) {
  if (!window || window.target === null) return 0;
  if (now > window.max) return 1000 + (now - window.max) * 10;
  if (now >= window.min) return 420 - Math.abs(window.target - now);
  const d = window.min - now;
  return d <= 45 ? 250 - d : -d * 0.35;
}

const PlannerCore = Object.freeze({
  version: 'core-0.7-preview',
  DEFAULT_CONFIG,
  TYPE,
  Time: Object.freeze({
    toMinutes,
    formatMinutes,
    timeWindowFor,
    makeTimeWindows,
    urgency
  }),
  Geo: Object.freeze({
    distanceKm,
    estimateSimpleMove,
    routeMetrics
  }),
  PlacePolicy: Object.freeze({
    normalizePlace,
    matchWishType,
    dayOK,
    timeOK,
    candidatePool,
    isAutoCandidate,
    ownerPriorityBonus,
    scorePlace
  }),
  Transport: Object.freeze({
    gtfsTime,
    createGtfsIndex,
    loadGtfs,
    nearestStops,
    findBusLeg,
    previewMove
  }),
  Schedule: Object.freeze({
    stayMinutes,
    chooseFiller,
    buildPlan
  }),
  GapOptimizer: Object.freeze({
    isFlexibleItem,
    absorbShortGaps
  })
});

window.PlannerCore = PlannerCore;
})();
