const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els={};const defaults={st:'09:00',et:'16:00',wd:'月',policy:'recommended'};
const chain=new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain});
const ctx={console,Map,Set,Date,Math,URLSearchParams,setTimeout,location:{search:'',href:'test'},document:{readyState:'loading',querySelector(){return true},addEventListener(){},getElementById(id){return els[id]??={value:defaults[id]||'',checked:false,innerHTML:'',textContent:''}}},L:chain,localStorage:{getItem(){return null}},fetch:async path=>({ok:true,text:async()=>fs.readFileSync(path.split('?')[0],'utf8')})};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('place-data.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('planner-app.js','utf8').replace(/init\(\);\s*$/,''),ctx);
let v8=fs.readFileSync('planner-v8.js','utf8');v8=v8.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();",'window.test={plan8,connection,choicesFor,openVisit};render=(items,end,warns,pts,done,autoCount)=>{window.result={items,end,warns,done,autoCount}};');vm.runInContext(v8,ctx);
(async()=>{
 const data=await ctx.PlaceData.loadAll();ctx.data=data.places;
 ctx.input={start:{name:'ビストロ・サ・マッシュ',lat:36.063859,lng:138.0849968},goal:{name:'下諏訪駅',lat:36.0720136,lng:138.0849189},wishes:[['breakfast','洋食'],['lunch','そば'],['dinner','ラーメン'],['alcohol','クラフトビール'],['landmark','神社寺院'],['onsen','']].map(([t,pref],i)=>({id:i+1,t,pref,d:'',pid:'',_band:'auto',_manualTime:''}))};
 vm.runInContext('P=data;pt.s=input.start;pt.g=input.goal;W=input.wishes;',ctx);
 const t=Date.now();await ctx.test.plan8();console.log('ms',Date.now()-t);
 const items=ctx.result.items,acts=items.filter(x=>x.wid),lunch=acts.find(x=>x.wid===2),drink=acts.find(x=>x.wid===4);
 assert.strictEqual(ctx.result.done,6);assert.strictEqual(ctx.result.warns.length,0);
 assert.strictEqual(lunch.title,'とんねるや');assert(Math.abs(lunch.from-720)<=30);assert(drink.from>=lunch.to);
 assert.strictEqual(acts.at(-1).wid,3);assert(items.at(-1).to<=960);
 assert(items.filter(x=>x.type==='travel').every(x=>x.to-x.from<=10));
 for(const x of items.filter(x=>x.point)){for(let m=x.from;m<x.to;m++){ctx.checkPlace=x.point;ctx.checkMinute=m;assert(vm.runInContext('timeOK(checkPlace,checkMinute)',ctx));}}
 console.log('PASS: six wishes, soba lunch near noon before drinks, dinner last, opening hours and walking limit');
})().catch(e=>{console.error(e);process.exitCode=1});
