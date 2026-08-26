(() => {
  const TYPES = {
    bus:      { label: 'バス停',       color: '#2563eb', shape: 'circle' },
    toilet:   { label: 'トイレ',       color: '#dc2626', shape: 'square' },
    shop:     { label: '店舗・飲食',   color: '#16a34a', shape: 'circle' },
    landmark: { label: 'ランドマーク', color: '#f59e0b', shape: 'diamond' }
  };

  const filterState = { bus: true, toilet: true, shop: true, landmark: true };

  function inferMapType(p, source = 'place') {
    if (source === 'bus') return 'bus';
    const explicit = String(p.map_type || p['map_type'] || '').trim().toLowerCase();
    if (TYPES[explicit]) return explicit;

    const text = [p['種別'], p['カテゴリ'], p['名称'], p['Google主要タイプ']]
      .filter(Boolean).join(' ').toLowerCase();

    // 「トイレあり」の施設すべてを赤にせず、トイレ自体がPlaceのときだけ toilet にする。
    if (/公衆トイレ|公共トイレ|トイレ|restroom|public toilet/.test(text)) return 'toilet';

    if (/飲食店|レストラン|食堂|ラーメン|そば|うどん|寿司|焼肉|居酒屋|焼き鳥|カフェ|喫茶|ベーカリー|パン|菓子|和菓子|スイーツ|コンビニ|スーパー|商店|ショップ|store|restaurant|cafe|bakery|convenience/.test(text)) {
      return 'shop';
    }

    return 'landmark';
  }

  function iconFor(type) {
    const t = TYPES[type] || TYPES.landmark;
    return L.divIcon({
      className: 'category-marker-wrap',
      html: `<span class="category-marker category-${type}" style="--pin:${t.color}"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -8]
    });
  }

  function popupHtml(name, category, type, extra = '') {
    const t = TYPES[type] || TYPES.landmark;
    return `<div class="category-popup"><span class="category-dot" style="background:${t.color}"></span><b>${esc(name)}</b><br><span>${esc(category || t.label)}</span>${extra}</div>`;
  }

  function renderCategoryMarkers() {
    if (typeof P === 'undefined' || typeof B === 'undefined') return;
    if (typeof placeLayer === 'undefined' || typeof busLayer === 'undefined') return;

    placeLayer.clearLayers();
    busLayer.clearLayers();

    const counts = { bus: 0, toilet: 0, shop: 0, landmark: 0 };

    P.filter(p => p.latitude && p.longitude).forEach(p => {
      const type = inferMapType(p, 'place');
      p.map_type = type;
      counts[type]++;
      if (!filterState[type]) return;

      const marker = L.marker([+p.latitude, +p.longitude], { icon: iconFor(type) })
        .bindPopup(popupHtml(p['名称'], p['カテゴリ'], type,
          p['種別'] ? `<br><span class="map-popup-kind">${esc(p['種別'])}</span>` : ''));
      marker.addTo(placeLayer);
    });

    B.forEach(p => {
      const type = 'bus';
      p.map_type = type;
      counts.bus++;
      if (!filterState.bus) return;
      L.marker([+p.latitude, +p.longitude], { icon: iconFor(type) })
        .bindPopup(popupHtml(p.stop_name, `${p.bus_system || 'バス'} バス停`, type))
        .addTo(busLayer);
    });

    Object.keys(counts).forEach(type => {
      const el = document.getElementById(`map-count-${type}`);
      if (el) el.textContent = counts[type];
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'map-category-enhancement-style';
    style.textContent = `
      .map-category-panel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:9px 0 10px;padding:9px 10px;border:1px solid #e2e7ea;border-radius:12px;background:#fafbfb}
      .map-filter-label{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #e1e5e8;font-size:12px;font-weight:700;cursor:pointer;user-select:none}
      .map-filter-label input{width:auto;margin:0;accent-color:#245e52}
      .map-filter-label .count{font-weight:500;color:#667085}
      .map-symbol{display:inline-block;width:11px;height:11px;background:var(--pin);border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.13)}
      .map-symbol.bus,.category-bus{border-radius:50%}
      .map-symbol.toilet,.category-toilet{border-radius:2px}
      .map-symbol.shop,.category-shop{border-radius:50%}
      .map-symbol.landmark,.category-landmark{transform:rotate(45deg);border-radius:2px}
      .category-marker-wrap{background:none!important;border:none!important}
      .category-marker{display:block;width:13px;height:13px;background:var(--pin);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.42)}
      .category-bus{width:9px;height:9px;margin:2px}
      .category-toilet{width:13px;height:13px}
      .category-shop{width:12px;height:12px}
      .category-landmark{width:12px;height:12px;margin:1px}
      .category-popup{line-height:1.45}.category-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.map-popup-kind{font-size:11px;color:#667085}
      .map-filter-help{margin-left:auto;font-size:11px;color:#667085}
      @media(max-width:740px){.map-filter-help{width:100%;margin-left:0}.map-category-panel{gap:6px}.map-filter-label{padding:5px 7px}}
    `;
    document.head.appendChild(style);
  }

  function injectControls() {
    const mapEl = document.getElementById('map');
    if (!mapEl || document.getElementById('mapCategoryPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'mapCategoryPanel';
    panel.className = 'map-category-panel';
    panel.innerHTML = Object.entries(TYPES).map(([type, x]) => `
      <label class="map-filter-label">
        <input type="checkbox" data-map-type="${type}" checked>
        <span class="map-symbol ${type}" style="--pin:${x.color}"></span>
        ${x.label} <span class="count">(<span id="map-count-${type}">0</span>)</span>
      </label>`).join('') + '<span class="map-filter-help">チェックを外すと地図から非表示</span>';

    mapEl.parentNode.insertBefore(panel, mapEl);
    panel.querySelectorAll('input[data-map-type]').forEach(cb => {
      cb.addEventListener('change', () => {
        filterState[cb.dataset.mapType] = cb.checked;
        renderCategoryMarkers();
      });
    });

    const oldNote = mapEl.parentNode.querySelector('.small[style*="margin-top:8px"]');
    if (oldNote) {
      oldNote.firstChild.textContent = '色と形でポイント種別を表示しています。徒歩時間は現在、直線距離＋補正の概算です。';
    }
  }

  function enhancePointManager() {
    // 一覧にも地図カテゴリを視覚的に示す。テーブル構造そのものは変えず、種別バッジの色だけ補助する。
    const body = document.getElementById('pointBody');
    if (!body) return;
    body.querySelectorAll('tr').forEach(tr => {
      const src = tr.dataset.source;
      const i = +tr.dataset.i;
      let type = src === 'bus' ? 'bus' : inferMapType(P[i] || {}, 'place');
      const badge = tr.querySelector('.badge');
      if (badge) {
        badge.style.borderLeft = `5px solid ${TYPES[type].color}`;
        badge.title = TYPES[type].label;
      }
    });
  }

  function installHooks() {
    if (typeof rebuild === 'function') {
      const originalRebuild = rebuild;
      rebuild = function(...args) {
        const out = originalRebuild.apply(this, args);
        renderCategoryMarkers();
        enhancePointManager();
        return out;
      };
    }
    if (typeof renderPointManager === 'function') {
      const originalRenderPointManager = renderPointManager;
      renderPointManager = function(...args) {
        const out = originalRenderPointManager.apply(this, args);
        enhancePointManager();
        return out;
      };
    }
  }

  function init() {
    injectStyles();
    injectControls();
    installHooks();
    const ver = document.querySelector('.ver');
    if (ver) ver.textContent = 'v5.0';
    document.title = '下諏訪 時間プランナー v5.0';
    // 既にデータロード済みの場合にも即時反映。
    setTimeout(() => {
      try { renderCategoryMarkers(); enhancePointManager(); } catch (e) { console.warn(e); }
    }, 0);
  }

  init();
})();
