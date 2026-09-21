const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els={};const defaults={st:'09:00',et:'16:00',wd:'月',policy:'recommended'};
const chain=new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain});
const ctx={console,Map,Set,Date,Math,URLSearchParams,setTimeout,location:{search:'',href:'test'},document:{readyState:'loading',querySelector(){return true},addEventListener(){},getElementById(id){return els[id]??={value:defaults[id]||'',checked:false,innerHTML:'',textContent:''}}},L:chain,localStorage:{getItem(){return null}},fetch:async path=>({ok:true,text:async()=>fs.readFileSync(path.split('?')[0],'utf8')})};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('place-data.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('planner-app.js','utf8').replace(/init\(\);\s*$/,''),ctx);
let v8=fs.readFileSync('planner-v8.js','utf8');v8=v8.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();",'window.test={plan8,connection,choicesFor,openVisit};render=(items,end,warns,pts,done,autoCount)=>{window.result={items,end,warns,done,autoCount}};');vm.runInContext(v8,ctx);
(async()=>{
 const data=await ctx.PlaceData.loadAll();ctx.data=data.places;
 ctx.input={"start": {"name": "本田食堂", "lat": 36.073553943298606, "lng": 138.08504066689326}, "goal": {"name": "下諏訪駅", "lat": 36.0720136, "lng": 138.0849189}, "startTime": "09:00", "endTime": "16:00", "day": "月", "mode": "walk", "walkMax": 10, "busWaitMax": 10, "policy": "recommended", "rain": false, "senior": false, "allowConditional": false, "wishes": [{"id": 1, "t": "dinner", "d": "", "time": "", "pid": "", "pref": "ラーメン", "_band": "auto", "_manualTime": ""}, {"id": 2, "t": "lunch", "d": "", "time": "", "pid": "", "pref": "うなぎ", "_band": "auto", "_manualTime": ""}, {"id": 3, "t": "lightmeal", "d": "", "time": "", "pid": "", "pref": "スイーツ", "_band": "auto", "_manualTime": ""}, {"id": 4, "t": "alcohol", "d": "", "time": "", "pid": "", "pref": "クラフトビール", "_band": "auto", "_manualTime": ""}, {"id": 5, "t": "landmark", "d": "", "time": "", "pid": "", "pref": "史跡", "_band": "auto", "_manualTime": ""}, {"id": 6, "t": "onsen", "d": "", "time": "", "pid": "", "pref": "", "_band": "auto", "_manualTime": ""}, {"id": 7, "t": "park", "d": "", "time": "", "pid": "", "pref": "", "_band": "auto", "_manualTime": ""}], "random": false};
 vm.runInContext('P=data;pt.s=input.start;pt.g=input.goal;W=input.wishes;',ctx);
 const t=Date.now();await ctx.test.plan8();console.log('ms',Date.now()-t);
 const items=ctx.result.items,acts=items.filter(x=>x.wid);
 assert.strictEqual(ctx.result.done,7);assert.strictEqual(ctx.result.warns.length,0);
 const lunch=acts.find(x=>x.wid===2),dinner=acts.find(x=>x.wid===1),alcohol=acts.find(x=>x.wid===4);
 assert.strictEqual(lunch.from,720);assert.strictEqual(acts.at(-1).wid,1);assert(dinner.from<1020);assert(dinner.meta.includes('早めの夕食'));assert(alcohol.from<1020);
 assert.strictEqual(items.at(-1).to,960);assert(items.filter(x=>x.type==='travel'&&x.title.includes('徒歩')).every(x=>x.to-x.from<=10));
 for(const x of items.filter(x=>x.point)){for(let m=x.from;m<x.to;m++){ctx.checkPlace=x.point;ctx.checkMinute=m;assert(vm.runInContext('timeOK(checkPlace,checkMinute)',ctx));}}
 console.log('PASS: all seven wishes, lunch at noon, early dinner last, daytime craft beer, opening hours, walking limit, 16:00 arrival');
})().catch(e=>{console.error(e);process.exitCode=1});
