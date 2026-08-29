(() => {
  'use strict';

  let guideMarker = null;

  function e(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function value(p, name){
    try { return PlaceData.effective(p, name) ?? ''; } catch (_) { return p?.[name] ?? ''; }
  }
  function yes(v){
    try { return PlaceData.truthy(v); } catch (_) { return ['yes','true','○','1','あり'].includes(String(v||'').trim().toLowerCase()); }
  }
  function no(v){
    try { return PlaceData.no(v); } catch (_) { return ['no','false','×','0','なし'].includes(String(v||'').trim().toLowerCase()); }
  }
  function findPlace(name){
    if (typeof P === 'undefined') return null;
    return P.find(p => String(p['名称'] || '').trim() === String(name || '').trim()) || null;
  }
  function field(label, valueText){
    if (!valueText) return '';
    return `<div class="pg-row"><div class="pg-label">${e(label)}</div><div>${e(valueText)}</div></div>`;
  }
  function chips(p){
    const defs = [
      ['観光向き','観光'],['おやつ向き','おやつ'],['昼食向き','昼食'],['夕食向き','夕食'],['休憩向き','休憩'],
      ['雨の日向き','雨の日'],['子ども向き','子ども'],['高齢者向き','高齢者'],['短時間立寄り向き','短時間']
    ];
    return defs.filter(([k]) => yes(value(p,k))).map(([,label]) => `<span class="pg-chip">${e(label)}</span>`).join('');
  }
  function facilities(p){
    const out=[];
    const defs=[['トイレ','トイレ'],['多目的トイレ','多目的トイレ'],['座れる場所','座れる場所'],['車椅子対応','車椅子対応'],['駐車場','駐車場']];
    for(const [k,label] of defs){
      const v=value(p,k) || p[k] || '';
      if(yes(v)) out.push(label);
      else if(v && !no(v) && String(v).toLowerCase()!=='unknown') out.push(`${label}: ${v}`);
    }
    const bus=value(p,'最寄りバス停') || p['最寄りバス停'];
    if(bus) out.push(`最寄りバス停: ${bus}`);
    return out;
  }
  function openGuide(p){
    const modal=document.getElementById('placeGuideModal');
    if(!modal||!p)return;
    const rec=(() => { try { return PlaceData.recommendation(p); } catch (_) { return Number(p['おすすめ度']||3); } })();
    const mapUrl=p['Googleマップ検索URL'] || '';
    const source=p['情報源_web'] || p['情報源'] || '';
    const experience=p['体験・できること'] || '';
    const memo=p['公開メモ'] || '';
    const fs=facilities(p);
    const stay=value(p,'推奨滞在時間_分') || p['推奨滞在時間_分'];
    const lat=Number(p.latitude||p.lat||0), lng=Number(p.longitude||p.lng||0);
    modal.querySelector('.pg-body').innerHTML = `
      <div class="pg-head">
        <div>
          <div class="pg-kind">${e(p['種別']||'Place')} / ${e(p['カテゴリ']||p['サブカテゴリ']||'')}</div>
          <h2>${e(p['名称'])}</h2>
          <div class="pg-stars">おすすめ ${'★'.repeat(Math.max(1,Math.min(5,rec)))}<span>${rec}/5</span></div>
        </div>
        <button class="pg-close" aria-label="閉じる">×</button>
      </div>
      ${memo?`<div class="pg-lead">${e(memo)}</div>`:''}
      ${experience?`<div class="pg-experience"><b>ここでできること</b><br>${e(experience)}</div>`:''}
      <div class="pg-chips">${chips(p)}</div>
      <div class="pg-grid">
        <div>
          ${field('住所',p['住所'])}
          ${field('営業日',value(p,'営業日'))}
          ${field('営業時間',value(p,'営業時間'))}
          ${field('定休日',value(p,'定休日'))}
          ${field('滞在目安',stay ? `${stay}分` : '')}
        </div>
        <div>
          ${field('料理・ジャンル',p['料理ジャンル'] || p['提供メニュータグ'])}
          ${field('設備・アクセス',fs.join(' / '))}
          ${field('対象',p['対象'])}
          ${field('おすすめ時間帯',p['おすすめ時間帯'])}
        </div>
      </div>
      <div class="pg-actions">
        ${lat&&lng?'<button class="pg-mapfocus">地図で位置を見る</button>':''}
        ${mapUrl?`<a class="pg-link" href="${e(mapUrl)}" target="_blank" rel="noopener">Googleマップで開く</a>`:''}
      </div>
      ${source?`<details class="pg-source"><summary>情報源</summary><div>${e(source)}</div></details>`:''}
    `;
    modal.classList.add('show');
    document.body.classList.add('pg-lock');
    modal.querySelector('.pg-close').onclick=closeGuide;
    const focus=modal.querySelector('.pg-mapfocus');
    if(focus)focus.onclick=()=>{
      closeGuide();
      if(typeof map!=='undefined'){
        map.setView([lat,lng],17,{animate:true});
        if(guideMarker){try{map.removeLayer(guideMarker)}catch(_){} }
        guideMarker=L.circleMarker([lat,lng],{radius:15,weight:4,color:'#7c3aed',fillColor:'#c4b5fd',fillOpacity:.45}).addTo(map).bindPopup(`<b>${e(p['名称'])}</b>`).openPopup();
        document.getElementById('map')?.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>{if(guideMarker){try{map.removeLayer(guideMarker)}catch(_){}guideMarker=null;}},6500);
      }
    };
  }
  function closeGuide(){
    const modal=document.getElementById('placeGuideModal');
    if(modal)modal.classList.remove('show');
    document.body.classList.remove('pg-lock');
  }
  function enhancePlanCards(){
    const result=document.getElementById('result');
    if(!result)return;
    result.querySelectorAll('.card').forEach(card=>{
      const nameEl=card.querySelector('.name');
      if(!nameEl)return;
      const p=findPlace(nameEl.textContent);
      if(!p){card.classList.remove('pg-clickable');return;}
      card.classList.add('pg-clickable');
      card.title='クリックして場所の案内を見る';
      if(!card.querySelector('.pg-hint')){
        const hint=document.createElement('span');hint.className='pg-hint';hint.textContent='場所の案内を見る';
        nameEl.parentElement.appendChild(hint);
      }
      card.onclick=ev=>{if(ev.target.closest('a,button'))return;openGuide(p)};
    });
  }
  function explainCandidateWarnings(){
    const result=document.getElementById('result');
    if(!result)return;
    result.querySelectorAll('.card.warn').forEach(card=>{
      if(card.querySelector('.pg-candidate-reason'))return;
      const meta=card.querySelector('.meta');
      if(!meta)return;
      const m=meta.textContent.match(/全候補\s*(\d+)\s*\/\s*座標あり\s*(\d+)\s*\/\s*[^適]*適合\s*(\d+)\s*\/\s*時刻適合\s*(\d+)/);
      if(!m)return;
      const all=+m[1],coords=+m[2],days=+m[3],opens=+m[4];
      let reason='条件を満たす候補がありません。';
      if(all===0) reason='用途に合う自動提案対象が0件です。条件付き・自動提案OFFの設定も影響します。';
      else if(coords===0) reason=`用途に合う候補は${all}件ありますが、緯度・経度が登録された候補がありません。`;
      else if(days===0) reason=`座標あり候補は${coords}件ありますが、この曜日に利用できる候補がありません。`;
      else if(opens===0) reason=`曜日条件を満たす候補は${days}件ありますが、希望時刻に営業している候補がありません。`;
      const d=document.createElement('div');d.className='pg-candidate-reason';d.textContent=reason;meta.parentElement.appendChild(d);
    });
  }
  function refresh(){enhancePlanCards();explainCandidateWarnings();}
  function init(){
    const style=document.createElement('style');
    style.textContent=`
      .pg-clickable{cursor:pointer;position:relative;transition:transform .13s ease,box-shadow .13s ease,border-color .13s ease}
      .pg-clickable:hover{transform:translateY(-2px);box-shadow:0 7px 22px rgba(31,41,51,.13);border-color:#8fb8ad}
      .pg-hint{display:inline-block;margin-top:7px;font-size:10px;font-weight:800;color:#245e52;background:#eaf3f0;border-radius:999px;padding:3px 7px}
      .pg-candidate-reason{margin-top:7px;padding:7px 9px;border-radius:8px;background:#fff0d9;color:#78520a;font-size:11px;font-weight:700}
      .pg-modal{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.42);display:none;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(3px)}
      .pg-modal.show{display:flex}.pg-lock{overflow:hidden}.pg-panel{width:min(760px,100%);max-height:min(84vh,820px);overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.28);padding:22px;animation:pgpop .18s ease-out}
      @keyframes pgpop{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
      .pg-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pg-head h2{font-size:25px;line-height:1.25;margin:3px 0 5px}.pg-kind{font-size:12px;color:#667085}.pg-stars{color:#9a6b00;font-weight:900}.pg-stars span{color:#667085;font-size:12px;margin-left:7px}.pg-close{border:0;background:#eef1f3;color:#34434f;width:38px;height:38px;border-radius:50%;font-size:24px;line-height:1;padding:0;flex:0 0 auto}.pg-lead,.pg-experience{margin-top:13px;padding:11px 13px;border-radius:12px;background:#f5f8f7;line-height:1.6}.pg-experience{background:#f7f7fb}.pg-chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.pg-chip{font-size:11px;background:#e8f2ee;color:#245e52;border-radius:999px;padding:4px 8px;font-weight:800}.pg-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;border-top:1px solid #edf0f2;margin-top:10px;padding-top:10px}.pg-row{display:grid;grid-template-columns:105px 1fr;gap:8px;padding:7px 0;border-bottom:1px solid #f1f3f4;font-size:13px;line-height:1.5}.pg-label{color:#667085;font-weight:700}.pg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.pg-actions button,.pg-link{display:inline-block;border:0;border-radius:10px;padding:10px 13px;background:#245e52;color:white;text-decoration:none;font-weight:800;font-size:13px}.pg-link{background:#edf0f2;color:#34434f}.pg-source{margin-top:16px;font-size:11px;color:#667085;word-break:break-all}.pg-source summary{cursor:pointer;font-weight:700}.pg-source div{margin-top:6px}.pg-body{min-height:120px}
      @media(max-width:650px){.pg-panel{padding:17px;border-radius:17px}.pg-grid{grid-template-columns:1fr}.pg-head h2{font-size:21px}.pg-row{grid-template-columns:90px 1fr}}
    `;
    document.head.appendChild(style);
    const modal=document.createElement('div');modal.id='placeGuideModal';modal.className='pg-modal';modal.innerHTML='<div class="pg-panel"><div class="pg-body"></div></div>';
    modal.addEventListener('click',ev=>{if(ev.target===modal)closeGuide()});document.body.appendChild(modal);
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeGuide()});
    const result=document.getElementById('result');
    if(result)new MutationObserver(refresh).observe(result,{childList:true,subtree:true});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
