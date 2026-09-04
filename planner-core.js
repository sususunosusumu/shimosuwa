(() => {
'use strict';

/**
 * Integrated planner core - Phase B skeleton.
 *
 * IMPORTANT:
 * - This file is intentionally NOT loaded by index.html yet.
 * - V1.11 remains the production/reference planner.
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

  if (explicit) return true;
  const level = String(place.autoLevel || place['自動提案'] || 'normal');
  const visitValue = clamp(Number(place.visitValue ?? place['おすすめ度'] ?? 3) || 3, 1, 5);

  if (level === 'hidden') return false;
  if (level === 'conditional' && !allowConditional) return false;
  return visitValue >= minVisitValue;
}

function scorePlace(place, from, goal, context = {}) {
  const visitValue = clamp(Number(place.visitValue ?? place['おすすめ度'] ?? 3) || 3, 1, 5);
  const z = {lat: Number(place.lat ?? place.latitude), lng: Number(place.lng ?? place.longitude)};
  const direct = distanceKm(from, goal);
  const leg = distanceKm(from, z);
  const after = distanceKm(z, goal);
  const detour = Math.max(0, leg + after - direct);
  const progress = direct - after;

  let score = visitValue * 18 + progress * 30 - detour * 75 - leg * 3;

  if (after > direct + 0.45) score -= 35;
  if (context.rainSuitable) score += 12;
  if (context.seniorSuitable) score += 12;
  if (context.policy === 'recommended') score += visitValue * 9;
  if (context.policy === 'near') score -= leg * 18;
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

function urgency(window, now) {
  if (!window || window.target === null) return 0;
  if (now > window.max) return 1000 + (now - window.max) * 10;
  if (now >= window.min) return 420 - Math.abs(window.target - now);
  const d = window.min - now;
  return d <= 45 ? 250 - d : -d * 0.35;
}

const PlannerCore = Object.freeze({
  version: 'core-0.2-shadow',
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
    estimateSimpleMove
  }),
  PlacePolicy: Object.freeze({
    normalizePlace,
    matchWishType,
    dayOK,
    timeOK,
    candidatePool,
    isAutoCandidate,
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
  GapOptimizer: Object.freeze({
    isFlexibleItem,
    absorbShortGaps
  })
});

window.PlannerCore = PlannerCore;
})();
