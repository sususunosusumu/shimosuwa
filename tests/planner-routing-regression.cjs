const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els={};const defaults={st:'09:00',et:'16:00',wd:'月',policy:'recommended'};
const chain=new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain});
const ctx={console,Map,Set,Date,Math,URLSearchParams,setTimeout,location:{search:'',href:'test'},document:{readyState:'loading',querySelector(){return true},addEventListener(){},getElementById(id){return els[id]??={value:defaults[id]||'',checked:false,innerHTML:'',textContent:''}}},L:chain,localStorage:{getItem(){return null}},fetch:async path=>({ok:true,text:async()=>fs.readFileSync(path.split('?')[0],'utf8')})};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('place-data.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('planner-app.js','utf8').replace(/init\(\);\s*$/,''),ctx);
let v8=fs.readFileSync('planner-v8.js','utf8');v8=v8.replace("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();",'window.test={plan8,connection,choicesFor,openVisit};render=(items,end,warns,pts,done,autoCount)=>{window.result={items,end,warns,done,autoCount}};');vm.runInContext(v8,ctx);
(async()=>{
 const data=await ctx.PlaceData.loadAll();ctx.data=data.places;
 vm.runInContext(`P=data;pt.s=(()=>{const p=P.find(p=>p['名称'].includes('ビストロ・サ'));return {name:p['名称'],lat:PlaceData.lat(p),lng:PlaceData.lng(p)}})();pt.g=(()=>{const p=P.find(p=>p['名称']==='下諏訪駅');return {name:p['名称'],lat:PlaceData.lat(p),lng:PlaceData.lng(p)}})();W=['park','lunch','dinner','alcohol','landmark','onsen'].map((t,i)=>({id:i+1,t,d:'',pref:''}));`,ctx);
 const t=Date.now();await ctx.test.plan8();console.log('ms',Date.now()-t);
 assert(ctx.result.done>=4);assert(!ctx.result.items.some(x=>x.title==='GOAL周辺で自由時間'));assert(!ctx.result.items.some(x=>x.meta.includes('旅行時間の外')));
 assert(ctx.result.items.filter(x=>x.type==='travel'&&x.title.includes('徒歩')).every(x=>x.to-x.from<=10));assert(ctx.result.items.at(-1).meta.startsWith('GOAL'));assert(ctx.result.items.at(-1).to<=960);
 for(const day of ['火','土','日']){els.wd.value=day;await ctx.test.plan8();assert(ctx.result.items.filter(x=>x.type==='travel'&&x.title.includes('徒歩')).every(x=>x.to-x.from<=10));assert(ctx.result.items.at(-1).to<=960);}
 vm.runInContext("W=[{id:1,t:'free',d:30}];",ctx);await ctx.test.plan8();assert(ctx.result.done===1);assert(ctx.result.items.some(x=>x.title==='自由時間'&&x.to-x.from===30));
 vm.runInContext("W=[{id:1,t:'landmark',d:'',pref:'存在しない分類'}];",ctx);await ctx.test.plan8();assert(ctx.result.done===0);assert(ctx.result.warns.includes('landmark'));
 vm.runInContext("W=[];",ctx);await ctx.test.plan8();assert(ctx.result.done===0);assert(ctx.result.items.at(-1).meta.startsWith('GOAL'));
 ctx.navigator={clipboard:{async writeText(text){ctx.copied=text}}};ctx.document.getElementById('summary').innerText='希望 0件';ctx.document.getElementById('result').innerText='表示結果';await ctx.PlannerV8.feedback();assert(ctx.copied.includes('表示結果'));assert(ctx.copied.includes('inputAtLastPlan'));
 console.log('PASS: sample route, walking limits, deadlines, weekdays, explicit free time, unmatched preference, empty wishes');
})().catch(e=>{console.error(e);process.exitCode=1});
