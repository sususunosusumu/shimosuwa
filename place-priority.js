(() => {
'use strict';
const LEVELS={
  1:'原則、自動提案しない',
  2:'補助候補。近い・条件一致時のみ',
  3:'通常候補',
  4:'かなりおすすめ。優先候補',
  5:'ぜひ行ってほしい。最優先候補'
};
const MIN_AUTO=3;
function score(p){return PlaceData.recommendation(p)}
function enhancePlanner(){
  if(typeof candidateBase==='function'&&!window.__priorityCandidateWrapped){
    const original=candidateBase;
    candidateBase=function(t){
      const all=original(t);
      return all.filter(p=>score(p)>=MIN_AUTO);
    };
    window.__priorityCandidateWrapped=true;
  }
  const policy=document.getElementById('policy');
  if(policy){
    const recommended=[...policy.options].find(o=>o.value==='recommended');
    if(recommended)recommended.textContent='行く価値・おすすめ重視';
    if(!policy.dataset.priorityInit){policy.value='recommended';policy.dataset.priorityInit='1'}
  }
  const box=document.querySelector('.p .row .toggle')?.closest('.p');
  if(box&&!document.getElementById('priorityRuleNote')){
    const d=document.createElement('div');d.id='priorityRuleNote';d.className='sm';d.style.marginTop='8px';
    d.textContent='自動提案は「行く価値ポイント」3以上を対象にし、4・5を優先します。1・2の地点も、行き先を直接指定した場合は利用できます。';box.appendChild(d);
  }
  const v=document.querySelector('.ver');if(v&&/planner rebuild/.test(v.textContent))v.textContent='planner rebuild 1.9';
}
function enhanceMaintenance(){
  const select=document.getElementById('おすすめ度');if(!select)return;
  const label=select.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent='行く価値ポイント 1〜5';
  [...select.options].forEach(o=>{const n=+o.value||+o.textContent;if(LEVELS[n])o.textContent=`${n} — ${LEVELS[n]}`});
  const parent=select.parentElement;
  if(parent&&!document.getElementById('priorityHelp')){
    const d=document.createElement('div');d.id='priorityHelp';d.className='sm';d.style.marginTop='5px';
    d.textContent='プランの目的地としての価値。5・4ほど優先され、1・2は原則として自動プランには出しません。';parent.appendChild(d);
  }
  const h=[...document.querySelectorAll('.section h3')].find(x=>x.textContent.includes('おすすめ・自動提案'));if(h)h.textContent='行く価値・自動提案';
  const top=document.querySelector('.top .sm');if(top)top.textContent='営業時間・用途属性・行く価値ポイント・自動提案ルールを管理します。変更はブラウザに保存し、GitHub反映用CSVとして書き出せます。';
  function relabel(){document.querySelectorAll('.badge').forEach(b=>{b.textContent=b.textContent.replace(/^おすすめ\s*(\d)\/5$/,'行く価値 ★$1')});const r=document.getElementById('testResult');if(r)r.textContent=r.textContent.replace(/おすすめ度\s*(\d)\/5/g,'行く価値 ★$1')}
  relabel();new MutationObserver(relabel).observe(document.body,{childList:true,subtree:true,characterData:true});
}
function boot(){if(/maintenance\.html$/i.test(location.pathname))enhanceMaintenance();else enhancePlanner()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
