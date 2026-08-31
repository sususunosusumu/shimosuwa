(() => {
'use strict';
const MAX_ABSORB=30;
let busy=false;
function toMin(s){const m=String(s||'').match(/(\d{1,2}):(\d{2})/);return m?+m[1]*60+ +m[2]:null}
function fmt(n){return String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function range(card){const t=card?.querySelector('.time')?.textContent||'';const m=t.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);if(!m)return null;return{from:toMin(m[1]),to:toMin(m[2])}}
function setRange(card,a,b){const e=card?.querySelector('.time');if(e)e.textContent=fmt(a)+'–\n'+fmt(b)}
function flexible(card){
  if(!card||card.classList.contains('travel')||card.classList.contains('warn'))return false;
  const meta=card.querySelector('.meta')?.textContent||'';
  const name=card.querySelector('.name')?.textContent||'';
  const isAuto=card.classList.contains('auto-added');
  // 自動追加カードの「昼食までのおすすめ追加」などは、昼食そのものではない。
  if(!isAuto && /昼食|朝食|夕食|おやつ/.test(meta))return false;
  return isAuto || /観光|温泉|足湯|公園|散歩|休憩|カフェ|おすすめ追加|自由|広場|神社|寺|史跡|博物館|美術館|景勝/.test(meta+' '+name);
}
function simpleTravel(card){const n=card?.querySelector('.name')?.textContent||'';return card?.classList.contains('travel')&&/徒歩|自転車|自動車/.test(n)&&!/バス停|バス待ち/.test(n)}
function updateStay(card,extra){
  const meta=card.querySelector('.meta');if(!meta)return;
  let s=meta.textContent;
  const m=s.match(/滞在(\d+)分/);
  if(m)s=s.replace(/滞在(\d+)分/,`滞在${+m[1]+extra}分`);
  s=s.replace(/\s*\/\s*次の予定に合わせて滞在を\d+分延長/g,'');
  s+=` / 次の予定に合わせて滞在を${extra}分延長`;
  meta.textContent=s;
}
function optimize(){
  if(busy)return;busy=true;
  try{
    const root=document.getElementById('result');if(!root)return;
    let cards=[...root.querySelectorAll('.card')];
    for(let i=0;i<cards.length;i++){
      const wait=cards[i];
      const title=wait.querySelector('.name')?.textContent?.trim()||'';
      if(title!=='少し待つ'||wait.dataset.absorbed==='1')continue;
      const wr=range(wait);if(!wr)continue;
      const gap=wr.to-wr.from;if(gap<=0||gap>MAX_ABSORB)continue;
      const travel=wait.previousElementSibling;
      const prev=travel?.previousElementSibling;
      if(!simpleTravel(travel)||!flexible(prev))continue;
      const tr=range(travel),pr=range(prev);if(!tr||!pr)continue;
      if(tr.to!==wr.from||pr.to!==tr.from)continue;
      setRange(prev,pr.from,pr.to+gap);
      setRange(travel,tr.from+gap,tr.to+gap);
      updateStay(prev,gap);
      wait.dataset.absorbed='1';wait.remove();
      cards=[...root.querySelectorAll('.card')];i=Math.max(-1,i-3);
    }
  }finally{busy=false}
}
function boot(){
  const root=document.getElementById('result');if(!root)return;
  const run=()=>{requestAnimationFrame(optimize);setTimeout(optimize,80)};
  new MutationObserver(run).observe(root,{childList:true,subtree:true,characterData:true});
  run();
  const v=document.querySelector('.ver');if(v)v.textContent='planner rebuild 1.11';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
