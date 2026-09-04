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

function urgency(window, now) {
  if (!window || window.target === null) return 0;
  if (now > window.max) return 1000 + (now - window.max) * 10;
  if (now >= window.min) return 420 - Math.abs(window.target - now);
  const d = window.min - now;
  return d <= 45 ? 250 - d : -d * 0.35;
}

const PlannerCore = Object.freeze({
  version: 'core-0.1-shadow',
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
    isAutoCandidate,
    scorePlace
  }),
  GapOptimizer: Object.freeze({
    isFlexibleItem,
    absorbShortGaps
  })
});

window.PlannerCore = PlannerCore;
})();
