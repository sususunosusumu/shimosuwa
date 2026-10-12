const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{},document:{querySelector:()=>true},localStorage:{getItem:()=>null},URL,URLSearchParams,console,fetch:async path=>({ok:true,text:async()=>fs.readFileSync(path,'utf8')})};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['place-data.js','planner-core.js','discover-travel.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
(async()=>{
 const T=ctx.DiscoverTravel,data=await T.load(),index=T.forDate(data,'2026-10-12');assert(index.stops.length>0);assert(index.trips.size>0);
 const holiday=T.forDate(data,'2026-05-04');assert(![...holiday.trips.values()].some(t=>t.service_id==='AZAMI_WKD'));
 const expired=T.forDate(data,'2027-04-01');assert.equal(expired.trips.size,0);
 const base={stops:[{stop_id:'a',stop_name:'始点',stop_lat:36,stop_lon:138},{stop_id:'b',stop_name:'終点',stop_lat:36.04,stop_lon:138}],routes:[{route_id:'r',route_long_name:'テストバス'}],trips:[{trip_id:'t',route_id:'r',service_id:'weekday'}],calendar:[{service_id:'weekday',monday:'1',tuesday:'1',wednesday:'1',thursday:'1',friday:'1',saturday:'0',sunday:'0',start_date:'20260101',end_date:'20261231'}],exceptions:[{service_id:'weekday',date:'20261012',exception_type:'2'}],stopTimes:[{trip_id:'t',stop_id:'a',stop_sequence:'1',departure_time:'09:10:00',arrival_time:'09:10:00'},{trip_id:'t',stop_id:'b',stop_sequence:'2',departure_time:'09:30:00',arrival_time:'09:30:00'}]};
 const a={lat:36,lng:138},b={lat:36.04,lng:138};
 const bus=T.access(a,b,'bus','2026-10-13','09:00',base);assert.equal(bus.kind,'bus');assert.equal(bus.board.stop_id,'a');assert.equal(bus.alight.stop_id,'b');assert.equal(bus.depart,550);
 assert.equal(T.access(a,b,'bus','2026-10-12','09:00',base),null);assert.equal(T.access(a,b,'bus','2026-10-17','09:00',base),null);assert.equal(T.access(a,b,'bus','2026-10-13','10:00',base),null);
 assert(T.access(a,b,'walk','2026-10-13','09:00',base).duration>0);assert.equal(T.access(a,a,'walk','2026-10-13','09:00',base).duration,0);
 assert(new URL(T.directions(a,b,'car')).searchParams.get('travelmode')==='driving');assert(new URL(T.directions(a,b,'bus')).searchParams.get('travelmode')==='transit');
 assert.equal(T.minutes('25:00'),null);assert.equal(T.minutes('09:00'),540);
 const stops=[{stop_name:'遠い',latitude:36.05,longitude:138},{stop_name:'近い',latitude:36.001,longitude:138}];assert.equal(T.nearest(stops,a)[0].stop_name,'近い');
 console.log('PASS: shared GTFS; direct bus; weekday, holiday and service-date exclusions; no bus after last departure; travel modes; nearest stops; navigation URLs');
})().catch(e=>{console.error(e);process.exitCode=1});
