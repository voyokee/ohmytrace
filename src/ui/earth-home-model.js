import {dateBound} from '../life/schema.js';
import {photoPlaceName,cityIdentity} from '../life/geocoding/region-policy.js';
import {readTripTitle} from '../life/media/journey-title.js';
import {tripCountsAsTravel,memoryVisibleOnMap} from '../life/travel-policy.js';

export function tripCities(data,trip,visitIds=null){
  const places=new Map(data.places.filter(p=>!p.hidden).map(p=>[p.id,p])),visits=new Map(data.visits.filter(v=>!v.hidden).map(v=>[v.id,v]));
  const seen=new Set();
  return trip.visitIds.flatMap(id=>{if(visitIds&&!visitIds.has(id))return [];const v=visits.get(id),p=v&&places.get(v.placeId);if(!p)return [];
    const key=cityIdentity(p);if(seen.has(key))return [];seen.add(key);return [{id:p.id,name:photoPlaceName(p,data),isCity:!!p.location?.photoCity?.key&&p.location.photoCity.hasCity!==false}];});
}
export function tripLocationCount(data,trip,visitIds=null){const cities=tripCities(data,trip,visitIds);return cities.length+(cities.length&&cities.every(p=>p.isCity)?' 座城市':' 个地点');}

// A view projection only. Canonical visits and their ordered IDs stay intact.
export function earthScopedSnapshot(snapshot,data,year=null){
  const chapter=snapshot.chapter;if(year===null&&!chapter)return snapshot;
  const from=year!==null?Date.UTC(year,0,1):dateBound(chapter.start)??-Infinity;
  const to=year!==null?Date.UTC(year,11,31,23,59,59,999):dateBound(chapter.end,true)??Infinity;
  const overlaps=d=>!!d&&d.start<=to&&d.end>=from;
  const trips=snapshot.trips.filter(t=>overlaps(t.date)||year===null&&chapter).map(t=>({...t,stops:t.stops.filter(s=>overlaps(s.date)||!s.date&&year===null&&chapter)}));
  const homes=snapshot.homes.filter(h=>!h.date||overlaps(h.date));
  const namesByIdentity=new Map(Object.entries(snapshot.placeIds).map(([name,id])=>[cityIdentity(data.places.find(p=>p.id===id)),name]));
  const byId=new Map(data.places.map(p=>[p.id,p])),photoMap=new Map();
  for(const m of data.memories){
    if(m.kind!=='photo'||!memoryVisibleOnMap(data,m))continue;
    const start=dateBound(m.start),end=dateBound(m.end,true);if(start===null?year!==null:!overlaps({start,end:end??start}))continue;
    if(chapter&&!chapter.memoryIds.includes(m.id)&&!m.tripIds.some(id=>chapter.relatedTripIds.includes(id))&&!m.placeIds.some(id=>chapter.homeAnchors.includes(id)))continue;
    const seenNames=new Set();for(const id of m.placeIds){const name=namesByIdentity.get(cityIdentity(byId.get(id)));if(!name||seenNames.has(name))continue;seenNames.add(name);
      if(!photoMap.has(name)){const base=snapshot.photoPlaces.find(p=>p.place===name);photoMap.set(name,{...base,place:name,placeId:snapshot.placeIds[name],count:0,years:[],visitedYears:[]});}
      const p=photoMap.get(name),y=new Date(start).getUTCFullYear();p.count++;if(start===null)continue;if(!p.years.includes(y))p.years.push(y);if(p.countsAsVisited!==false&&!p.visitedYears.includes(y))p.visitedYears.push(y);
    }
  }
  const photoPlaces=[...photoMap.values()],names=new Set([...trips.flatMap(t=>t.stops.map(s=>s.place)),...homes.map(h=>h.place),...photoPlaces.map(p=>p.place)]);
  return {...snapshot,trips,homes,photoPlaces,rows:snapshot.rows.filter(r=>names.has(r.place))};
}
export function earthTripTitle(data,trip){
  if(!trip.autoTitle||trip.title!==trip.autoTitle)return readTripTitle(data,trip);
  const names=tripCities(data,trip).map(p=>p.name);
  return names.length>2?`${names.slice(0,2).join(' · ')}等 ${names.length} 城`:names.join(' · ')||'旅行回忆';
}
export function recentTrips(data,ids=null,query=''){
  const text=query.trim().toLocaleLowerCase();
  return data.trips.filter(t=>(!ids||ids.has(t.id))&&tripCountsAsTravel(data,t))
    .filter(t=>!text||[earthTripTitle(data,t),...tripCities(data,t).map(p=>p.name)].join(' ').toLocaleLowerCase().includes(text))
    .sort((a,b)=>{const aDate=dateBound(a.start),bDate=dateBound(b.start);return (bDate??-Infinity)-(aDate??-Infinity)||a.id.localeCompare(b.id);});
}
