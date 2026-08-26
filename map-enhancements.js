(() => {
  const TYPES = {
    bus:      { label: 'バス停',       color: '#2563eb', shape: 'circle' },
    toilet:   { label: 'トイレ設備',   color: '#dc2626', shape: 'square' },
    shop:     { label: '店舗・飲食',   color: '#16a34a', shape: 'circle' },
    landmark: { label: 'ランドマーク', color: '#f59e0b', shape: 'diamond' }
  };

  const filterState = { bus: true, toilet: true, shop: true, landmark: true };

  function standaloneToilet(p) {
    const text = [p['種別'], p['カテゴリ'], p['名称'], p['Google主要タイプ']]
      .filter(Boolean).join(' ').toLowerCase();
    return /公衆トイレ|公共トイレ|公衆便所|public toilet|public restroom|restroom/.test(text) ||
      (/トイレ/.test(text) && !/(トイレあり|トイレ利用|多目的トイレ)/.test(text));
  }

  function hasToilet(p) {
    if (standaloneToilet(p)) return true;
    const yes = v => ['○', 'あり', '有', 'yes', 'true'].includes(String(v || '').trim().toLowerCase());
    if (yes(p['トイレあり'])) return true;
    if (yes(p['Googleトイレ'])) return true;
    const publicUse = String(p['トイレ一般利用'] || '').trim();
    if (publicUse && !['×', 'なし'].includes(publicUse)) return true;
    if (String(p['多目的トイレ'] || '').trim()) return true;
    return false;
  }

  function toiletMeta(p) {
    const bits = [];
    if (standaloneToilet(p)) bits.push('独立したトイレ');
    const publicUse = String(p['トイレ一般利用'] || '').trim();
    if (publicUse) bits.push(publicUse);
    const accessible = String(p['多目的トイレ'] || '').trim();
    if (accessible) bits.push('多目的: ' + accessible);
    const condition = String(p['トイレ利用条件'] || '').trim();
    if (condition) bits.push(condition);
    return bits.join(' / ');
  }

  function inferBaseType(p, source = 'place') {
    if (source === 'bus') return 'bus';
    if (standaloneToilet(p)) return 'toilet';

    const explicit = String(p.map_type || p['map_type'] || '').trim().toLowerCase();
    if (explicit === 'shop' || explicit === 'landmark') return explicit;

    const text = [p['種別'], p['カテゴリ'], p['名称'], p['Google主要タイプ']]
      .filter(Boolean).join(' ').toLowerCase();

    if (/飲食店|レストラン|食堂|ラーメン|そば|うどん|寿司|焼肉|居酒屋|焼き鳥|カフェ|喫茶|ベーカリー|パン|菓子|和菓子|スイーツ|コンビニ|スーパー|商店|ショップ|store|restaurant|cafe|bakery|convenience/.test(text)) {
      return 'shop';
    }
    return 'landmark';
  }

  function iconFor(type, wc = false, wcOnly = false) {
    const t = TYPES[type] || TYPES.landmark;
    if (wcOnly) {
      return L.divIcon({
        className: 'category-marker-wrap',
        html: '<span class="wc-only-marker">WC</span>',
        iconSize: [24, 18],
        iconAnchor: [12, 9],
        popupAnchor: [0, -9]
      });
    }
    return L.divIcon({
      className: 'category-marker-wrap',
      html: `<span class="category-marker-stack"><span class="category-marker category-${type}" style="--pin:${t.color}"></span>${wc ? '<span class="wc-badge">WC</span>' : ''}</span>`,
      iconSize: [28, 25],
      iconAnchor: [14, 13],
      popupAnchor: [0, -12]
    });
  }

  function popupHtml(name, category, type, p = null, extra = '') {
    const t = TYPES[type] || TYPES.landmark;
    const wc = p && hasToilet(p);
    const meta = wc ? toiletMeta(p) : '';
    return `<div class="category-popup"><span class="category-dot" style="background:${t.color}"></span><b>${esc(name)}</b><br><span>${esc(category || t.label)}</span>${extra}${wc ? `<br><span class="popup-wc">WC トイレあり${meta ? ' ・ ' + esc(meta) : ''}</span>` : ''}</div>`;
  }

  function addPlaceMarker(p, type, wc, wcOnly = false) {
    const markerType = wcOnly ? 'toilet' : type;
    const marker = L.marker([+p.latitude, +p.longitude], { icon: iconFor(markerType, wc && !wcOnly, wcOnly) })
      .bindPopup(popupHtml(p['名称'], p['カテゴリ'], markerType, p,
        p['種別'] ? `<br><span class="map-popup-kind">${esc(p['種別'])}</span>` : ''));
    marker.addTo(placeLayer);
  }

  function renderCategoryMarkers() {
    if (typeof P === 'undefined' || typeof B === 'undefined') return;
    if (typeof placeLayer === 'undefined' || typeof busLayer === 'undefined') return;

    placeLayer.clearLayers();
    busLayer.clearLayers();

    const counts = { bus: 0, toilet: 0, shop: 0, landmark: 0 };

    P.filter(p => p.latitude && p.longitude).forEach(p => {
      const baseType = inferBaseType(p, 'place');
      const wc = hasToilet(p);
      p.map_type = baseType;
      p.map_facility_toilet = wc ? 'yes' : '';

      if (baseType === 'toilet') {
        counts.toilet++;
        if (filterState.toilet) addPlaceMarker(p, 'toilet', true, true);
        return;
      }

      counts[baseType]++;
      if (wc) counts.toilet++;

      if (filterState[baseType]) {
        addPlaceMarker(p, baseType, wc && filterState.toilet, false);
      } else if (wc && filterState.toilet) {
        // 本体カテゴリを非表示にしていても、トイレ設備だけは残す。
        addPlaceMarker(p, baseType, true, true);
      }
    });

    B.forEach(p => {
      counts.bus++;
      p.map_type = 'bus';
      if (!filterState.bus) return;
      L.marker([+p.latitude, +p.longitude], { icon: iconFor('bus') })
        .bindPopup(popupHtml(p.stop_name, `${p.bus_system || 'バス'} バス停`, 'bus'))
        .addTo(busLayer);
    });

    Object.keys(counts).forEach(type => {
      const el = document.getElementById(`map-count-${type}`);
      if (el) el.textContent = counts[type];
    });
  }

  function injectStyles() {
    const old = document.getElementById('map-category-enhancement-style');
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = 'map-category-enhancement-style';
    style.textContent = `
      .map-category-panel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:9px 0 10px;padding:9px 10px;border:1px solid #e2e7ea;border-radius:12px;background:#fafbfb}
      .map-filter-label{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #e1e5e8;font-size:12px;font-weight:700;cursor:pointer;user-select:none}
      .map-filter-label input{width:auto;margin:0;accent-color:#245e52}.map-filter-label .count{font-weight:500;color:#667085}
      .map-symbol{display:inline-block;width:11px;height:11px;background:var(--pin);border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.13)}
      .map-symbol.bus,.category-bus{border-radius:50%}.map-symbol.toilet{border-radius:2px}.map-symbol.shop,.category-shop{border-radius:50%}.map-symbol.landmark,.category-landmark{transform:rotate(45deg);border-radius:2px}
      .category-marker-wrap{background:none!important;border:none!important;overflow:visible!important}.category-marker-stack{position:relative;display:block;width:28px;height:25px}
      .category-marker{position:absolute;left:7px;top:6px;display:block;width:13px;height:13px;background:var(--pin);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.42)}
      .category-bus{width:9px;height:9px;left:9px;top:8px}.category-shop{width:12px;height:12px;left:8px;top:7px}.category-landmark{width:12px;height:12px;left:8px;top:7px}
      .wc-badge{position:absolute;right:-3px;top:-2px;min-width:19px;height:14px;padding:0 3px;border-radius:7px;background:#dc2626;color:#fff;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.28);font-size:8px;line-height:11px;font-weight:900;text-align:center;letter-spacing:-.2px;z-index:3}
      .wc-only-marker{display:block;min-width:24px;height:17px;padding:1px 4px;border-radius:4px;background:#dc2626;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.42);font-size:9px;line-height:12px;font-weight:900;text-align:center}
      .category-popup{line-height:1.45}.category-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.map-popup-kind{font-size:11px;color:#667085}.popup-wc{display:inline-block;margin-top:3px;color:#b42318;font-size:11px;font-weight:700}
      .map-filter-help{margin-left:auto;font-size:11px;color:#667085}
      @media(max-width:740px){.map-filter-help{width:100%;margin-left:0}.map-category-panel{gap:6px}.map-filter-label{padding:5px 7px}}
    `;
    document.head.appendChild(style);
  }

  function injectControls() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const existing = document.getElementById('mapCategoryPanel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'mapCategoryPanel';
    panel.className = 'map-category-panel';
    panel.innerHTML = Object.entries(TYPES).map(([type, x]) => `
      <label class="map-filter-label">
        <input type="checkbox" data-map-type="${type}" ${filterState[type] ? 'checked' : ''}>
        <span class="map-symbol ${type}" style="--pin:${x.color}"></span>
        ${x.label} <span class="count">(<span id="map-count-${type}">0</span>)</span>
      </label>`).join('') + '<span class="map-filter-help">WCは場所カテゴリに重ねて表示。カテゴリを消してもWCだけ表示できます。</span>';

    mapEl.parentNode.insertBefore(panel, mapEl);
    panel.querySelectorAll('input[data-map-type]').forEach(cb => {
      cb.addEventListener('change', () => {
        filterState[cb.dataset.mapType] = cb.checked;
        renderCategoryMarkers();
      });
    });

    const oldNote = mapEl.parentNode.querySelector('.small[style*="margin-top:8px"]');
    if (oldNote) {
      oldNote.firstChild.textContent = '場所カテゴリを色・形で表示し、トイレ設備は赤いWCバッジで重ねています。徒歩時間は現在、直線距離＋補正の概算です。';
    }
  }

  function enhancePointManager() {
    const body = document.getElementById('pointBody');
    if (!body) return;
    body.querySelectorAll('tr').forEach(tr => {
      const src = tr.dataset.source;
      const i = +tr.dataset.i;
      const p = src === 'bus' ? null : (P[i] || {});
      const type = src === 'bus' ? 'bus' : inferBaseType(p, 'place');
      const wc = p ? hasToilet(p) : false;
      const badge = tr.querySelector('.badge');
      if (badge) {
        badge.style.borderLeft = `5px solid ${TYPES[type].color}`;
        badge.title = TYPES[type].label + (wc && type !== 'toilet' ? ' + WC' : '');
        if (wc && type !== 'toilet' && !badge.querySelector('.pm-wc')) {
          const w = document.createElement('span');
          w.className = 'pm-wc';
          w.textContent = ' WC';
          w.style.color = '#b42318';
          w.style.fontWeight = '900';
          badge.appendChild(w);
        }
      }
    });
  }

  function installHooks() {
    if (typeof rebuild === 'function' && !rebuild.__mapFacilityHooked) {
      const originalRebuild = rebuild;
      const wrapped = function(...args) {
        const out = originalRebuild.apply(this, args);
        renderCategoryMarkers();
        enhancePointManager();
        return out;
      };
      wrapped.__mapFacilityHooked = true;
      rebuild = wrapped;
    }
    if (typeof renderPointManager === 'function' && !renderPointManager.__mapFacilityHooked) {
      const originalRenderPointManager = renderPointManager;
      const wrapped = function(...args) {
        const out = originalRenderPointManager.apply(this, args);
        enhancePointManager();
        return out;
      };
      wrapped.__mapFacilityHooked = true;
      renderPointManager = wrapped;
    }
  }

  function init() {
    injectStyles();
    injectControls();
    installHooks();
    const ver = document.querySelector('.ver');
    if (ver) ver.textContent = 'v5.1';
    document.title = '下諏訪 時間プランナー v5.1';
    setTimeout(() => {
      try { renderCategoryMarkers(); enhancePointManager(); } catch (e) { console.warn(e); }
    }, 0);
  }

  init();
})();
