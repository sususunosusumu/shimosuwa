const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map(),listeners=new Map(),storage=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{id,hidden:false,value:'',checked:false,innerHTML:'',textContent:'',disabled:false,open:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},appendChild(child){nodes.set(child.id,child)},showModal(){this.open=true},close(){this.open=false;this.handlers.close?.()},focus(){},select(){}});return nodes.get(id)}
const places=[{place_id:'s','名称':'下諏訪駅',latitude:36.072,longitude:138.085,'種別':'交通'},{place_id:'r','名称':'テストそば店','種別':'飲食店',latitude:36.073,longitude:138.085,'飲食タグ_そば':'yes','公開メモ':'食事 https://example.com/private','運営メモ':'INTERNAL_NOT_FOR_VISITORS','営業時間':'11:00-15:00','推奨滞在時間_分':'30'}];
const PD={loadAll:async()=>({places,management:places}),keyOf:p=>p.place_id,hasCoord:p=>!!p.latitude,lat:p=>+p.latitude,lng:p=>+p.longitude,truthy:v=>v==='yes',effective:(p,k)=>p[k]||'',autoLevel:()=> 'normal',isFoodType:p=>p['種別']==='飲食店',hasFoodTag:(p,k)=>p['飲食タグ_'+k]==='yes',hasAnyFoodTag:(p,ks)=>ks.some(k=>p['飲食タグ_'+k]==='yes'),foodTags:p=>p['種別']==='飲食店'?['そば']:[],ownerRecommendation:()=>({push:0,rank:null}),recommendation:()=>3};
let loadFailed=false,locationFail=false,clipboard='',mapSnapshot;
const context={window:{PlaceData:PD,DiscoverMap:{draw:s=>mapSnapshot=s}},URL,URLSearchParams,location:{href:'http://localhost/discover.html?mood=eat&keywords=soba'},history:{replaceState(){}},document:{getElementById:node,createElement:()=>node('new'),addEventListener:(type,fn)=>listeners.set(type,fn)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{clipboard:{writeText:async s=>clipboard=s},geolocation:{getCurrentPosition: (ok,fail)=>locationFail?fail({code:1}):ok({coords:{latitude:36.072,longitude:138.085}})}},setTimeout:()=>0,clearTimeout(){},console};
context.window.DiscoverModel=require('../discover-model.js');
// Model gets PlaceData explicitly through its root in browser execution.
vm.createContext(context);vm.runInContext(fs.readFileSync('discover-model.js','utf8'),context);vm.runInContext(fs.readFileSync('discover-app.js','utf8'),context);
const tick=()=>new Promise(r=>setImmediate(r));
function click(data){listeners.get('click')({target:{closest:()=>({dataset:data})}})}
(async()=>{
 await tick();assert(node('results').innerHTML.includes('テストそば店'));assert(!node('results').innerHTML.includes('INTERNAL_NOT_FOR_VISITORS'));
 click({save:'r'});assert.equal(node('saved-count').textContent,1);assert(!node('selection-bar').hidden);assert(node('selected-places').innerHTML.includes('テストそば店'));assert(node('results').innerHTML.includes('data-focus')); assert(storage.get('shimosuwa_discover_wanted_v1').includes('r'));
 assert(node('selected-places').innerHTML.includes('data-remove='));assert(node('results').innerHTML.includes('行きたいから外す'));assert.equal(mapSnapshot.active.place_id,'r');
 click({detail:'r'});assert(node('place-dialog').open);assert(node('place-detail').innerHTML.includes('11:00-15:00'));assert(!node('place-detail').innerHTML.includes('INTERNAL_NOT_FOR_VISITORS'));
 await node('copy-list').onclick();assert(clipboard.includes('テストそば店'));
 node('location-button').onclick();assert.equal(node('sort-select').value,'near');assert.equal(mapSnapshot.gps,true);assert(!node('station-button').hidden);
 node('station-button').onclick();assert(node('station-button').hidden);assert.equal(mapSnapshot.gps,false);
 locationFail=true;node('location-button').onclick();assert(node('location-status').textContent.includes('許可がありません'));assert(!node('location-button').disabled);
 node('search-input').handlers.input({target:{value:'存在しない'}});assert(!node('empty-state').hidden);
 node('clear-filters').onclick();assert(node('empty-state').hidden);
 click({remove:'r'});assert.equal(node('saved-count').textContent,0);assert(node('selection-bar').hidden);assert.equal(mapSnapshot.active,null);assert.equal(mapSnapshot.saved.length,0);assert.equal(storage.get('shimosuwa_discover_wanted_v1'),'[]');assert(!node('selected-places').innerHTML.includes('data-remove'));assert(node('toast').textContent.includes('外しました'));
 PD.loadAll=async()=>{throw Error('offline')};await node('retry-button').onclick();assert(!node('load-error').hidden);
 PD.loadAll=async()=>({places,management:places});await node('retry-button').onclick();assert(node('load-error').hidden);
 console.log('PASS: place details, saved list and copy, GPS sorting and denial, no-result recovery, failed-load retry, public fields only');
})().catch(e=>{console.error(e);process.exitCode=1});
