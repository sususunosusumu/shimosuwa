(() => {
  'use strict';

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function findPlace(name){
    if (typeof P === 'undefined' || !Array.isArray(P)) return null;
    const n=String(name||'').trim();
    return P.find(p => String(p['名称']||'').trim()===n) || null;
  }

  function mapsUrl(p){
    const stored=p?.['GoogleマップURL_確定'] || p?.['Googleマップ検索URL'] || p?.['Google Maps URL'] || '';
    if(stored) return stored;
    const q=[p?.['名称'],p?.['住所'],'長野県 下諏訪町'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  function webSearchUrl(p){
    const q=[p?.['名称'],p?.['住所']||'下諏訪町','公式'].filter(Boolean).join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  function openSmall(url,name){
    const w=Math.min(620,Math.max(430,Math.round(screen.availWidth*0.42)));
    const h=Math.min(820,Math.max(600,Math.round(screen.availHeight*0.86)));
    const left=Math.max(0,Math.round((screen.availWidth-w)/2));
    const top=Math.max(0,Math.round((screen.availHeight-h)/2));
    const popup=window.open(url,name||'shimosuwaGooglePlace',`popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if(!popup) window.open(url,'_blank','noopener');
    else try{popup.focus();}catch(_){ }
  }

  function enhance(){
    const modal=document.getElementById('placeGuideModal');
    if(!modal || !modal.classList.contains('show')) return;
    const body=modal.querySelector('.pg-body');
    const title=body?.querySelector('h2')?.textContent?.trim();
    if(!body || !title || body.querySelector('.gpm-card')) return;
    const p=findPlace(title);
    if(!p) return;

    const murl=mapsUrl(p);
    const official=p['公式WebページURL'] || p['公式URL'] || p['Webサイト'] || '';
    const card=document.createElement('div');
    card.className='gpm-card';
    card.innerHTML=`
      <div class="gpm-icon">📍</div>
      <div class="gpm-main">
        <div class="gpm-title">Google Mapsで場所・写真を見る</div>
        <div class="gpm-text">写真、口コミ、最新の営業時間などはGoogle Maps側で確認できます。登録URLがない地点は、名称と住所から自動的に検索します。</div>
        <div class="gpm-actions">
          <button class="gpm-open">Google Maps・写真を開く</button>
          ${official ? '' : '<button class="gpm-web">公式Webを探す</button>'}
        </div>
      </div>`;

    const head=body.querySelector('.pg-head');
    if(head) head.insertAdjacentElement('afterend',card); else body.prepend(card);
    card.querySelector('.gpm-open').onclick=()=>openSmall(murl,'shimosuwaGooglePlace');
    const webBtn=card.querySelector('.gpm-web');
    if(webBtn) webBtn.onclick=()=>openSmall(webSearchUrl(p),'shimosuwaOfficialSearch');
  }

  function init(){
    const style=document.createElement('style');
    style.textContent=`
      .gpm-card{display:grid;grid-template-columns:46px 1fr;gap:12px;margin:14px 0;padding:13px;border:1px solid #d9e5e1;border-radius:14px;background:linear-gradient(135deg,#f5faf8,#f7f9fb)}
      .gpm-icon{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:#e6f1ed;font-size:24px}
      .gpm-title{font-size:14px;font-weight:900;color:#184b40}.gpm-text{font-size:11px;line-height:1.55;color:#667085;margin-top:3px}
      .gpm-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.gpm-actions button{border:0;border-radius:9px;padding:9px 11px;font-size:12px;font-weight:900;cursor:pointer;background:#245e52;color:#fff}
      .gpm-actions .gpm-web{background:#edf0f2;color:#34434f}
      @media(max-width:520px){.gpm-card{grid-template-columns:1fr}.gpm-icon{width:40px;height:40px}.gpm-actions button{width:100%}}
    `;
    document.head.appendChild(style);

    const observer=new MutationObserver(()=>requestAnimationFrame(enhance));
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',()=>setTimeout(enhance,0),true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
