(function(root){
'use strict';
const core=()=>root.PlannerCore;
function minutes(value){const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);if(!m||+m[1]>23||+m[2]>59)return null;return +m[1]*60+ +m[2]}
function time(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(Math.round(value%60)).padStart(2,'0')}
function forDate(data,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('日付を選んでください');
 const stamp=date.replaceAll('-',''),day=new Date(date+'T12:00:00Z').getUTCDay(),weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][day];
 if(!weekday)throw Error('日付を選んでください');
 const active=new Set(data.calendar.filter(c=>stamp>=c.start_date&&stamp<=c.end_date&&String(c[weekday])==='1').map(c=>c.service_id));
 for(const row of data.exceptions||[]){if(row.date!==stamp)continue;if(String(row.exception_type)==='1')active.add(row.service_id);else if(String(row.exception_type)==='2')active.delete(row.service_id)}
 const trips=data.trips.filter(t=>active.has(t.service_id));
 return core().Transport.createGtfsIndex({...data,trips,calendar:[...active].map(service_id=>({service_id,monday:'1',tuesday:'1',wednesday:'1',thursday:'1',friday:'1',saturday:'1',sunday:'1'}))});
}
function nearest(stops,point,limit=3){return stops.filter(s=>Number.isFinite(+s.latitude)&&Number.isFinite(+s.longitude)&&+s.latitude&&+s.longitude).map(s=>({...s,distance:core().Geo.distanceKm(point,{lat:+s.latitude,lng:+s.longitude})})).sort((a,b)=>a.distance-b.distance).slice(0,limit)}
function directions(from,to,mode){const url=new URL('https://www.google.com/maps/dir/');url.search=new URLSearchParams({api:'1',origin:from.lat+','+from.lng,destination:to.lat+','+to.lng,travelmode:({walk:'walking',bike:'bicycling',car:'driving',bus:'transit'})[mode]||'walking'}).toString();return url.href}
function access(from,to,mode,date,departure,data){
 const start=minutes(departure);if(start===null)throw Error('出発時刻を選んでください');
 if(core().Geo.distanceKm(from,to)<.02)return {kind:'simple',mode:'walk',duration:0,finish:start};
 if(mode!=='bus'){const duration=core().Geo.estimateSimpleMove(mode,from,to);return {kind:'simple',mode,duration,finish:start+duration}}
 if(!data)throw Error('バス時刻表を読み込めませんでした');
 const index=forDate(data,date);
 const bus=core().Transport.findBusLeg(index,from,to,start,'月',{...core().DEFAULT_CONFIG,walkMax:15,busWaitMax:60});
 return bus?{...bus,duration:bus.finish-start}:null;
}
async function load(fetchImpl=root.fetch){
 async function read(name,optional=false){try{const response=await fetchImpl('data/gtfs/'+name,{cache:'force-cache'});if(!response.ok)throw Error(name);return root.PlaceData.parseCSV(await response.text())}catch(e){if(optional)return null;throw e}}
 const [stops,routes,trips,stopTimes,calendar,exceptions]=await Promise.all([read('stops.txt'),read('routes.txt'),read('trips.txt'),read('stop_times.txt'),read('calendar.txt'),read('calendar_dates.txt',true)]);
 return {stops,routes,trips,stopTimes,calendar,exceptions:exceptions||[],hasExceptions:exceptions!==null};
}
const travel={minutes,time,forDate,nearest,directions,access,load};root.DiscoverTravel=travel;
if(typeof module!=='undefined'&&module.exports)module.exports=travel;
})(typeof window!=='undefined'?window:globalThis);
