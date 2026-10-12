(function(root){
'use strict';
const moods=[
 {id:'eat',icon:'🍽',label:'食べたい',caption:'おなかと気分に合う一軒',children:[['soba','そば・うどん'],['ramen','ラーメン'],['unagi','うなぎ'],['japanese','和食・定食'],['western','洋食'],['meat','肉料理'],['seafood','寿司・海鮮'],['chinese','中華']]},
 {id:'cafe',icon:'☕',label:'ひと息つきたい',caption:'コーヒーと、小さな寄り道',children:[['coffee','カフェ'],['sweets','甘いもの'],['bread','パン'],['takeout','テイクアウト']]},
 {id:'relax',icon:'♨',label:'のんびりしたい',caption:'温泉や足湯で、ひと休み',children:[['onsen','温泉'],['footbath','足湯'],['rest','座って休む']]},
 {id:'walk',icon:'↗',label:'まちを歩きたい',caption:'湖畔も、路地も、自分のペースで',children:[['lake','湖畔'],['park','公園・広場'],['history','史跡・まち並み']]},
 {id:'culture',icon:'⛩',label:'見て・知りたい',caption:'下諏訪らしい景色と文化',children:[['shrine','神社・お寺'],['museum','博物館・美術館'],['history','歴史にふれる'],['experience','体験する']]},
 {id:'drink',icon:'🍺',label:'一杯飲みたい',caption:'地元のお酒で、ちょっと乾杯',children:[['craft','クラフトビール'],['sake','日本酒'],['wine','ワイン'],['bar','居酒屋・バー']]},
 {id:'shop',icon:'◇',label:'買い物したい',caption:'おみやげや、旅の買い足し',children:[['souvenir','おみやげ'],['daily','日用品・買い足し']]}
];
function text(p){return ['名称','種別','カテゴリ1','カテゴリ','サブカテゴリ','料理ジャンル','提供メニュータグ','体験・できること','公開メモ'].map(k=>p[k]||'').join(' ')}
function api(pd){return pd||root.PlaceData}
function flag(p,k,pd){return api(pd).truthy(api(pd).effective(p,k))}
function tag(p,k,pd){return api(pd).hasFoodTag(p,k)}
function food(p,pd){return api(pd).isFoodType(p)||/カフェ|喫茶|ベーカリー|菓子/.test([p['種別'],p['カテゴリ1'],p['カテゴリ']].join(' '))}
function match(p,key,pd){
 const t=text(p),f=food(p,pd);
 switch(key){
 case 'soba':return f&&(tag(p,'そば',pd)||/そば|蕎麦|うどん/.test(t));
 case 'ramen':return f&&/ラーメン|つけめん|つけ麺/.test(t);
 case 'unagi':return f&&(tag(p,'うなぎ',pd)||/うなぎ|鰻/.test(t));
 case 'japanese':return f&&(tag(p,'定食',pd)||/和食|定食|食堂/.test(t));
 case 'western':return f&&(tag(p,'洋食',pd)||/洋食|ビストロ|パスタ|ピザ/.test(t));
 case 'meat':return f&&api(pd).hasAnyFoodTag(p,['肉','とんかつ','ステーキ']);
 case 'seafood':return f&&(tag(p,'寿司',pd)||/海鮮|寿司|鮨/.test(t));
 case 'chinese':return f&&(tag(p,'中華',pd)||/中華|中国料理/.test(t));
 case 'coffee':return f&&(tag(p,'カフェ',pd)||/カフェ|喫茶/.test(t));
 case 'sweets':return f&&tag(p,'スイーツ',pd);
 case 'bread':return f&&/パン|ベーカリー/.test(t);
 case 'takeout':return f&&tag(p,'テイクアウト',pd);
 case 'onsen':return !f&&/温泉|銭湯|共同浴場/.test(t)&&!/足湯/.test(t);
 case 'footbath':return !f&&/足湯/.test(t);
 case 'rest':return !f&&(flag(p,'休憩向き',pd)||flag(p,'座れる場所',pd));
 case 'lake':return !f&&/湖畔|諏訪湖|水辺|みずべ/.test(t);
 case 'park':return !f&&/公園|広場|散策|散歩/.test(t);
 case 'history':return !f&&/史跡|宿場|古墳|遺跡|まち歩き|歴史|旧宅|旧家/.test(t);
 case 'shrine':return !f&&/神社|寺院|寺社|大社|地蔵|八幡/.test(t);
 case 'museum':return !f&&/博物館|美術館|資料館|記念館|ミュージアム/.test(t);
 case 'experience':return !f&&/体験|工作|制作|ものづくり/.test(t);
 case 'craft':return f&&tag(p,'クラフトビール',pd);
 case 'sake':return f&&tag(p,'日本酒',pd);
 case 'wine':return f&&tag(p,'ワイン',pd);
 case 'bar':return f&&/居酒屋|バー|酒場/.test([p['種別'],p['カテゴリ1'],p['カテゴリ']].join(' '));
 case 'souvenir':return /土産|みやげ|物産|特産/.test(t)||flag(p,'買い物向き',pd)&&!/コンビニ|スーパー|日用品/.test(t);
 case 'daily':return /コンビニ|スーパー|日用品|ドラッグストア/.test(t);
 default:return false;
 }
}
function visible(p,pd){return !api(pd).truthy(p['削除予定'])&&api(pd).autoLevel(p)!=='hidden'&&!!String(p['名称']||'').trim()}
function inMood(p,id,pd){const m=moods.find(m=>m.id===id);if(!m)return false;return m.children.some(([key])=>match(p,key,pd))||(id==='eat'&&food(p,pd));}
function kmBetween(a,b){const rad=v=>v*Math.PI/180;const lat=rad(b.lat-a.lat),lng=rad(b.lng-a.lng),x=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lng/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(x)))}
function distance(p,origin,pd){return origin&&api(pd).hasCoord(p)?kmBetween(origin,{lat:api(pd).lat(p),lng:api(pd).lng(p)}):null}
function duration(p,pd){const raw=String(api(pd).effective(p,'推奨滞在時間_分')||'').trim();const nums=raw.match(/\d+(?:\.\d+)?/g);if(!nums)return null;const maximum=Math.max(...nums.map(Number));return /時間|hours?|hrs?/i.test(raw)?Math.round(maximum*60):maximum}
function search(places,state,pd){
 const q=String(state.query||'').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
 const results=places.filter(p=>visible(p,pd)&&(!state.mood||inMood(p,state.mood,pd))&&(!(state.keywords||[]).length||state.keywords.some(k=>match(p,k,pd)))&&q.every(k=>text(p).normalize('NFKC').toLowerCase().includes(k))&&(!state.rain||flag(p,'雨の日向き',pd)||/^(indoor|屋内)$/.test(String(api(pd).effective(p,'屋内外'))))&&(!state.short||duration(p,pd)!==null&&duration(p,pd)<=30));
 return results.sort((a,b)=>{
   if(state.sort==='near'){const da=distance(a,state.origin,pd),db=distance(b,state.origin,pd);if(da!==db)return (da??Infinity)-(db??Infinity)}
   const oa=api(pd).ownerRecommendation(a),ob=api(pd).ownerRecommendation(b);
   return ob.push-oa.push||(oa.rank??Infinity)-(ob.rank??Infinity)||api(pd).recommendation(b)-api(pd).recommendation(a)||String(a['名称']).localeCompare(String(b['名称']),'ja');
 });
}
function safeURL(value){try{const u=new URL(String(value));return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return ''}}
const model={moods,text,match,visible,inMood,distance,duration,search,safeURL};
root.DiscoverModel=model;
if(typeof module!=='undefined'&&module.exports)module.exports=model;
})(typeof window!=='undefined'?window:globalThis);
