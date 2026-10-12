(() => {
'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let map=null,pointLayer=null,busLayer=null,routeLayer=null,toiletLayer=null,tripLayer=null,originMarker=null,radiusLayer=null,snapshot=null,fitKey='',busStops=[],timetable=null,busPromise=null,routeVersion=0,popupVersion=0,openStop=null;
const icons={normal:'#607e65',saved:'#ba7f27',active:'#245e52'};
function initialize(){
 if(map)return true;if(!window.L){$('map-status').textContent='地図を読み込めませんでした。行き方とナビのリンクは利用できます。';return false}
 map=L.map('discover-map',{scrollWheelZoom:false}).setView([36.074,138.087],14);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 radiusLayer=L.layerGroup().addTo(map);pointLayer=L.layerGroup().addTo(map);busLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);toiletLayer=L.layerGroup().addTo(map);tripLayer=L.layerGroup().addTo(map);return true;
}
function point(p){return {name:p['名称'],lat:PlaceData.lat(p),lng:PlaceData.lng(p)}}
function busPoint(s){return {lat:+(s.latitude||s.stop_lat),lng:+(s.longitude||s.stop_lon)}}
function showTrip(details,date){
 if(!details)return;
 $('bus-trip-content').innerHTML='<p class="eyebrow">BUS / STOP TIMES</p><h2>'+esc(details.route)+'</h2><p>'+esc(details.headsign)+(/便$/.test(details.headsign)?'':'方面')+' · '+esc(date)+'</p><p class="small-note">選んだ便の全停車順です。「ここで乗車」より後が、乗車後の停留所です。</p><ol class="trip-stop-list">'+details.stops.map(row=>'<li class="'+(row.boarding?'boarding-stop':'')+'"><div class="trip-stop-time">'+(row.arrival===null?'未登録':DiscoverTravel.time(row.arrival))+'</div><div><b>'+esc(row.name)+'</b>'+(row.boarding?'<span class="boarding-label">ここで乗車</span>':'')+(row.departure!==null&&row.arrival!==row.departure?'<small> '+DiscoverTravel.time(row.departure)+'発</small>':'')+'</div></li>').join('')+'</ol><p class="small-note">登録時刻表です。遅延・臨時運休は反映されません。</p>';
 const points=details.stops.filter(row=>row.lat&&row.lng);
 if(map&&points.length){tripLayer.clearLayers();routeLayer.clearLayers();const line=L.polyline(points.map(row=>[row.lat,row.lng]),{color:'#79519b',weight:4,dashArray:'6 5'}).addTo(tripLayer);for(const row of points)L.circleMarker([row.lat,row.lng],{radius:row.boarding?8:5,color:'#79519b',fillColor:row.boarding?'#edd38c':'#fff',fillOpacity:1,weight:2}).bindPopup('<b>'+esc(row.name)+'</b><br>'+(row.arrival===null?'時刻未登録':DiscoverTravel.time(row.arrival)+'着')).addTo(tripLayer);map.fitBounds(line.getBounds(),{padding:[25,25],maxZoom:16});}
 $('bus-route-label').textContent=details.route+' · '+date+'（点線は停留所間の目安）';$('bus-route-banner').hidden=false;
 map?.closePopup();if(!$('bus-trip-dialog').open)$('bus-trip-dialog').showModal();
}
async function stopPopup(stop,element,wholeDay=false,popupObject=null){
 const version=++popupVersion;openStop={stop,element,wholeDay,popupObject};const date=$('departure-date').value,time=$('departure-time').value;
 element.innerHTML='<b>🚌 '+esc(stop.stop_name)+'</b><br>'+esc(stop.bus_system||'バス停')+'<p class="small-note">'+esc(date)+'の出発時刻を調べています…</p>';
 popupObject?.update();
 try{
  const data=await getTimetable();if(version!==popupVersion)return;
  const from=wholeDay?0:DiscoverTravel.minutes(time);if(from===null)throw Error('出発時刻を選んでください');
  const rows=DiscoverTravel.departures(data,date,stop.stop_id||stop.uid,from);
  element.innerHTML='<b>🚌 '+esc(stop.stop_name)+'</b><br>'+esc(stop.bus_system||'バス停')+'<p class="small-note">'+esc(date)+(wholeDay?'の全出発時刻':' '+esc(time)+'以降')+'<br>時刻を押すと、この便の停車順と到着時刻を表示します。</p>';
  if(!rows.length){const note=document.createElement('p');note.textContent=wholeDay?'この日の登録便はありません。':'この時刻以降の登録便はありません。';element.appendChild(note)}
  const list=document.createElement('div');list.className='bus-departure-list';
  for(const row of rows.slice(0,wholeDay?rows.length:6)){
   const button=document.createElement('button');button.type='button';button.className='bus-departure';button.innerHTML='<b>'+DiscoverTravel.time(row.time)+'</b><span>'+esc(row.route)+'<small>'+esc(row.headsign)+(/便$/.test(row.headsign)?'':'方面')+'</small></span>';button.onclick=()=>showTrip(DiscoverTravel.tripDetails(data,date,row.tripId,row.sequence),date);list.appendChild(button);
  }
  element.appendChild(list);
  if(!wholeDay){const button=document.createElement('button');button.type='button';button.className='map-popup-button';button.textContent='この日の全時刻を見る';button.onclick=()=>stopPopup(stop,element,true,popupObject);element.appendChild(button)}
  const note=document.createElement('p');note.className='small-note';note.textContent='登録時刻表です。遅延・臨時運休は反映されません。';element.appendChild(note);
 }catch(e){if(version===popupVersion)element.innerHTML='<b>'+esc(stop.stop_name)+'</b><p>'+esc(e.message)+'</p><p class="small-note">出発日・時刻を確認してください。</p>'}finally{if(version===popupVersion)popupObject?.update()}
}
function drawBus(){
 if(!map)return;busLayer.clearLayers();openStop=null;popupVersion++;if(!$('show-bus-stops').checked)return;
 for(const s of busStops){const popup=document.createElement('div');const marker=L.circleMarker([+s.latitude,+s.longitude],{radius:5,color:'#2e6a9d',fillColor:'#e8f2ff',fillOpacity:1,weight:2}).bindPopup(popup,{maxWidth:300,maxHeight:310}).addTo(busLayer);marker.on('popupopen',()=>stopPopup(s,popup,false,marker.getPopup()));marker.on('popupclose',()=>{if(openStop?.element===popup){openStop=null;popupVersion++}});marker.bindTooltip(s.stop_name);const element=marker.getElement();if(element){element.setAttribute('role','button');element.setAttribute('aria-label','バス停：'+s.stop_name+'（'+(s.bus_system||'バス')+'）');element.setAttribute('tabindex','0');element.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();marker.openPopup()}})}}
}
function toiletPlaces(){return (snapshot?.allPlaces||[]).filter(p=>DiscoverModel.toilet(p));}
function drawToilets(){
 if(!map)return;toiletLayer.clearLayers();if(!$('show-toilets').checked)return;
 for(const p of toiletPlaces()){const dedicated=p['種別']==='トイレ';const popup=document.createElement('div');popup.innerHTML='<b>🚻 '+esc(p['名称'])+'</b><p>'+esc(p['住所']||'')+'</p><p class="small-note">'+(dedicated?'トイレ地点':'施設内のトイレ。利用条件は施設で確認してください。')+'</p>'+(PlaceData.truthy(PlaceData.effective(p,'多目的トイレ'))?'<p>多目的トイレ：登録あり</p>':'');const button=document.createElement('button');button.type='button';button.className='map-popup-button';button.textContent='ここへの行き方';button.onclick=()=>window.DiscoverUI.focus(PlaceData.keyOf(p),false);popup.appendChild(button);L.marker([PlaceData.lat(p),PlaceData.lng(p)],{icon:L.divIcon({className:'toilet-pin',html:'<span>WC</span>',iconSize:[28,24],iconAnchor:[14,12]}),title:'トイレ：'+p['名称']}).bindPopup(popup).addTo(toiletLayer);}
}

function drawRadius(){
 radiusLayer.clearLayers();const current=snapshot.gps&&snapshot.origin;
 $('location-radius-help').hidden=!current;
 if(!current)return;
 for(const radius of [500,200,100]){
  L.circle([current.lat,current.lng],{radius,color:'#2e6a9d',weight:1,opacity:.45,fillColor:'#2e6a9d',fillOpacity:.035,interactive:false}).addTo(radiusLayer);
  L.marker([current.lat+radius/111320,current.lng],{interactive:false,icon:L.divIcon({className:'radius-label',html:'<span>'+radius+'m</span>',iconSize:[42,18],iconAnchor:[21,9]})}).addTo(radiusLayer);
 }
}
function draw(snapshotData){
 snapshot=snapshotData;const {places,saved,origin,active}=snapshot;
 if(initialize()){
 pointLayer.clearLayers();const combined=new Map(places.concat(saved).map(p=>[PlaceData.keyOf(p),p]));if(active)combined.set(PlaceData.keyOf(active),active);
 const savedIds=new Set(saved.map(PlaceData.keyOf)),bounds=[];
 for(const p of combined.values()){
  if(!PlaceData.hasCoord(p))continue;const id=PlaceData.keyOf(p),isActive=active&&id===PlaceData.keyOf(active),isSaved=savedIds.has(id),color=icons[isSaved?'saved':isActive?'active':'normal'];bounds.push([PlaceData.lat(p),PlaceData.lng(p)]);
  const popup=document.createElement('div');popup.innerHTML='<b>'+esc(p['名称'])+'</b><br><span>'+esc(p['カテゴリ1']||p['カテゴリ']||'')+'</span><br>';
  const button=document.createElement('button');button.type='button';button.className='map-popup-button';button.textContent='この場所への行き方';button.onclick=()=>window.DiscoverUI.focus(id,false);popup.appendChild(button);
  L.circleMarker([PlaceData.lat(p),PlaceData.lng(p)],{radius:isActive?10:isSaved?8:6,color,fillColor:color,fillOpacity:.9,weight:isActive?3:1}).bindPopup(popup).addTo(pointLayer);
 }
 if(origin){if(originMarker)map.removeLayer(originMarker);originMarker=L.circleMarker([origin.lat,origin.lng],{radius:7,color:'#fff',fillColor:'#2e6a9d',fillOpacity:1,weight:3}).bindPopup(snapshot.gps?'現在地':'下諏訪駅（出発地点）').addTo(map)}
 drawRadius();drawBus();drawToilets();const key=[...combined.keys()].sort().join(',')+'|'+(active?PlaceData.keyOf(active):'')+'|'+JSON.stringify(origin)+'|'+snapshot.gps;
 if(active&&PlaceData.hasCoord(active)){bounds.length=0;bounds.push([PlaceData.lat(active),PlaceData.lng(active)])}
 if(key!==fitKey&&bounds.length){const nearOrigin=bounds.some(b=>DiscoverModel.distance({latitude:b[0],longitude:b[1]},origin)<10);if(origin&&nearOrigin)bounds.push([origin.lat,origin.lng]);if(snapshot.gps&&origin){const circle=L.circle([origin.lat,origin.lng],{radius:500});const range=circle.getBounds();bounds.push(range.getSouthWest(),range.getNorthEast())}map.fitBounds(bounds,{padding:[28,28],maxZoom:16});fitKey=key}
 map.invalidateSize();$('map-status').textContent='候補 '+[...combined.values()].filter(PlaceData.hasCoord).length+'地点・バス停 '+busStops.length+'か所';
 }
 const selectable=snapshot.places.concat(snapshot.saved,snapshot.station?[snapshot.station]:[]);
 const ids=new Set(selectable.map(PlaceData.keyOf)),all=selectable.filter(p=>{const id=PlaceData.keyOf(p);if(!ids.has(id))return false;ids.delete(id);return true});
 $('destination-select').innerHTML='<option value="">行き先を選んでください</option>'+all.map(p=>'<option value="'+esc(PlaceData.keyOf(p))+'">'+esc(p['名称'])+(snapshot.station&&PlaceData.keyOf(p)===PlaceData.keyOf(snapshot.station)?'（駅への行き方）':'')+(snapshot.saved.some(s=>PlaceData.keyOf(s)===PlaceData.keyOf(p))?' ★ 行きたい':'')+'</option>').join('');
 if(active&&!all.some(p=>PlaceData.keyOf(p)===PlaceData.keyOf(active))){const option=document.createElement('option');option.value=PlaceData.keyOf(active);option.textContent=active['名称'];$('destination-select').appendChild(option)}
 $('destination-select').value=active?PlaceData.keyOf(active):'';
 updateAccess();
}
async function getTimetable(){if(timetable)return timetable;if(!busPromise)busPromise=DiscoverTravel.load().then(data=>timetable=data).catch(e=>{busPromise=null;throw e});return busPromise}
function link(from,to,mode,label){return '<a class="route-link" target="_blank" rel="noopener noreferrer" href="'+esc(DiscoverTravel.directions(from,to,mode))+'">'+esc(label)+' ↗</a>'}
async function updateAccess(){
 const version=++routeVersion,mode=$('travel-mode').value,p=snapshot?.active,origin=snapshot?.origin;
 routeLayer?.clearLayers();$('route-result').innerHTML='';
 if(!p){$('route-result').textContent='候補の「地図・行き方」を押すか、上の行き先を選んでください。';return}
 if(!PlaceData.hasCoord(p)){ $('route-result').innerHTML='<p>この地点の座標は未登録です。</p><a class="route-link" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p['名称']+' '+(p['住所']||''))+'" target="_blank" rel="noopener noreferrer">Google Mapsで場所を確認 ↗</a>';return}
 const destination=point(p),date=$('departure-date').value,start=$('departure-time').value;
 $('route-origin-label').textContent=snapshot.originLabel||'下諏訪駅';
 if(mode==='bus')$('route-result').textContent='指定日時のバスを調べています…';
 try{
 const data=mode==='bus'?await getTimetable():null;
 if(version!==routeVersion)return;
 const movement=DiscoverTravel.access(origin,destination,mode,date,start,data),near=DiscoverTravel.nearest(busStops,destination,2);
 const nearText=near.length?near.map(s=>esc(s.stop_name)+'（約'+Math.round(s.distance*1000/10)*10+'m）').join('、'):'未確認';
 let body='<h3>'+esc(p['名称'])+'への行き方</h3>';
 if(movement?.duration===0){body+='<p class="route-summary">出発地点と同じ場所です。</p>'}
 else if(movement?.kind==='bus'){
  body+='<p class="route-summary">🚌 バス＋徒歩 約'+movement.duration+'分</p><p>'+esc(movement.route)+'<br>'+esc(movement.board.stop_name)+' '+DiscoverTravel.time(movement.depart)+'発 → '+esc(movement.alight.stop_name)+' '+DiscoverTravel.time(movement.arrive)+'着<br>乗車前の徒歩 '+movement.walkIn+'分・バス待ち '+movement.wait+'分・降車後の徒歩 '+movement.walkOut+'分</p>';
  if(map){const bp=busPoint(movement.board),ap=busPoint(movement.alight);L.polyline([[origin.lat,origin.lng],[bp.lat,bp.lng],[ap.lat,ap.lng],[destination.lat,destination.lng]],{color:'#2e6a9d',dashArray:'5 7',weight:3}).addTo(routeLayer);map.fitBounds(routeLayer.getBounds?routeLayer.getBounds():L.latLngBounds([[origin.lat,origin.lng],[destination.lat,destination.lng]]),{padding:[28,28],maxZoom:16})}
 }else if(mode==='bus'){
  body+='<p class="route-summary">この条件では直行バスが見つかりませんでした。</p><p>停留所まで徒歩15分以内、出発から乗車までの待ち60分以内で確認しています。時刻を変えるか、ナビで乗り継ぎも確認できます。</p>';
 }else{
  const label={walk:'🚶 徒歩',car:'🚗 車',bike:'🚲 自転車'}[mode];body+='<p class="route-summary">'+label+' 約'+movement.duration+'分（目安）</p><p>出発地点：'+esc(snapshot.originLabel)+' → '+esc(destination.name)+'</p>';
  if(map)L.polyline([[origin.lat,origin.lng],[destination.lat,destination.lng]],{color:'#607e65',dashArray:'5 7',weight:3}).addTo(routeLayer);
 }
 if(mode==='bus'&&movement?.kind==='bus'){const onFoot=PlannerCore.Geo.estimateSimpleMove('walk',origin,destination);body+='<p>徒歩なら約'+onFoot+'分（目安）。'+(movement.duration>onFoot+5?'この区間は徒歩の方が早いです。':'')+'</p>'}
 body+='<p class="route-near">最寄りのバス停：'+nearText+'</p>';
 if(mode==='car'){const parking=PlaceData.effective(p,'駐車場');body+='<p>駐車場：'+(PlaceData.truthy(parking)?'登録情報ではあり':PlaceData.no(parking)?'登録情報ではなし':'要確認')+'</p>'}
 body+='<p class="small-note">'+(mode==='bus'?'登録時刻表の直行便候補です。地図の点線は乗降地点をつなぐ目安で、実際のバス経路ではありません。臨時変更・運休は運行元をご確認ください。'+(data.hasExceptions?'':' 臨時運休データは未取得です。'):'所要時間と地図の線は直線距離からの目安です。道路に沿った行き方はナビで確認できます。')+'</p>'+link(origin,destination,mode,mode==='bus'?'バス・乗り継ぎをナビで確認':'この手段でナビを開く');
 $('route-result').innerHTML=body;
 }catch(e){if(version!==routeVersion)return;$('route-result').innerHTML='<p>'+esc(e.message)+'</p>'+link(origin,destination,mode,'ナビで行き方を確認')}
}
async function loadStops(){try{const response=await fetch('data/bus_stops_corrected.json',{cache:'force-cache'});if(!response.ok)throw Error('stops');const data=await response.json();busStops=Array.isArray(data)?data:(data.items||data.stops||[]);if(snapshot)draw(snapshot)}catch(_){$('map-status').textContent='バス停データを読み込めませんでした。バス検索は時刻表から確認できます。'}}
const japan=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=type=>japan.find(p=>p.type===type).value;$('departure-date').value=part('year')+'-'+part('month')+'-'+part('day');$('departure-time').value=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
$('show-bus-stops').onchange=drawBus;$('destination-select').onchange=e=>window.DiscoverUI.focus(e.target.value,false);
for(const id of ['travel-mode','departure-date','departure-time'])$(id).onchange=()=>{updateAccess();if(id!=='travel-mode'){tripLayer?.clearLayers();$('bus-route-banner').hidden=true;if(openStop)stopPopup(openStop.stop,openStop.element,openStop.wholeDay,openStop.popupObject)}};
$('show-toilets').onchange=drawToilets;
$('close-bus-trip').onclick=()=>$('bus-trip-dialog').close();
$('trip-map-button').onclick=()=>{$('bus-trip-dialog').close();$('discover-map').scrollIntoView({behavior:'smooth',block:'center'});map?.invalidateSize()};
$('map-location-update').onclick=()=>window.DiscoverUI.refreshLocation();
$('clear-bus-route').onclick=()=>{tripLayer?.clearLayers();$('bus-route-banner').hidden=true;fitKey='';if(snapshot)draw(snapshot)};
window.DiscoverMap={draw,updateAccess,reveal(){initialize();map?.invalidateSize();},loadStops};loadStops();
})();
