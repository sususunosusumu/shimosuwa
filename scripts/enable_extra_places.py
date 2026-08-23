from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

if 'v4.3' in s:
    print('already patched to v4.3')
    raise SystemExit(0)
if 'v4.2' not in s:
    raise SystemExit('expected v4.2 index.html')

s = s.replace('v4.2', 'v4.3')
s = s.replace('未取得座標を仮取得</button>', '未取得座標を住所から仮取得</button>')

new_func = r'''async function geocodeMissing(){
  const missing=P.filter(p=>!p.latitude||!p.longitude);
  const eligible=missing.filter(p=>(p['住所']||'').trim());
  const noAddress=missing.length-eligible.length;
  const status=$('geoStatus');
  if(!missing.length){
    status.innerHTML='<span class="okmsg">未取得座標はありません。すでに全Placeに座標があります。</span>';
    return;
  }
  if(!eligible.length){
    status.innerHTML='<span class="errmsg">未取得座標は '+missing.length+'件ありますが、住所が未登録のため住所検索では取得できません。Google Places APIで個別に候補検索してください。</span>';
    return;
  }
  let ok=0,ng=0;
  status.textContent=`住所から仮取得中… 対象 ${eligible.length}件 / 住所なし ${noAddress}件`;
  for(const p of eligible){
    try{
      let q=(p['住所']||'').replace(/^〒\d{3}-\d{4}\s*/,'');
      let r=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(q));
      if(!r.ok)throw Error('HTTP '+r.status);
      let j=await r.json();
      if(j?.[0]?.geometry){
        let [lng,lat]=j[0].geometry.coordinates;
        p.latitude=lat;p.longitude=lng;p['座標ステータス']='住所検索（仮）';
        localStorage.setItem(cacheKey(p),JSON.stringify({lat,lng}));
        ok++;
      }else ng++;
    }catch(e){
      console.warn('geocode failed',p['名称'],e);
      ng++;
    }
    status.textContent=`住所から仮取得中… 成功 ${ok} / 失敗 ${ng} / 対象 ${eligible.length} / 住所なし ${noAddress}`;
    await new Promise(r=>setTimeout(r,110));
  }
  rebuild();
  status.innerHTML=`<span class="${ng?'errmsg':'okmsg'}">完了：成功 ${ok}件 / 失敗 ${ng}件 / 住所なし ${noAddress}件。住所検索は仮位置なので、重要なPlaceはGoogle Places APIで確認してください。</span>`;
}'''

pattern = r'async function geocodeMissing\(\)\{.*?\}function parseGoogleCoords'
if not re.search(pattern, s, flags=re.S):
    raise SystemExit('geocodeMissing function not found')
s = re.sub(pattern, new_func + 'function parseGoogleCoords', s, count=1, flags=re.S)

p.write_text(s, encoding='utf-8')
print('patched index.html to v4.3')
