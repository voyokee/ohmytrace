import {newId,partialDate,ongoingDate,dateBound,addEvidence,validateDataset} from '../schema.js';
import {distanceKm} from './reconstruction.js';

const dayMs=s=>Date.parse(s+'T00:00:00Z');
const sameDate=(a,b)=>a?.precision===b?.precision&&a?.value===b?.value;

// Editing a stop is also an edit to its parent journey. Treat old review edits
// conservatively: preserve their journey and photo membership in full.
export function photoOwnership(data){
  const evidence=new Map(data.evidence.map(e=>[e.id,e]));
  const automatic=e=>e.evidenceIds.length>0&&e.evidenceIds.every(id=>evidence.get(id)?.source?.kind==='photo-auto-import');
  const manual=e=>!!e?.evidenceIds.some(id=>{const ev=evidence.get(id);return ev?.source?.kind==='photo-review'?ev.source.manualChanges?.length>0:ev?.state==='manual'||ev?.revisions?.length>0;});
  const visits=new Map(data.visits.map(v=>[v.id,v]));
  const protectedTrips=new Set(data.trips.filter(t=>!automatic(t)||manual(t)||t.visitIds.some(id=>manual(visits.get(id)))||t.autoTitle&&t.autoTitle!==t.title).map(t=>t.id));
  const protectedHomes=new Set(data.residences.filter(r=>!automatic(r)||manual(r)||manual(visits.get(r.visitId))).map(r=>r.id));
  return {automatic,manual,protectedTrips,protectedHomes};
}

// Retain observations and identities even when an album photo is no longer
// accessible. Older versions only retained a day and city centre; use those as
// the fallback without pretending the original capture time is still known.
export function savedPhotoObservations(data){
  const places=new Map(data.places.map(p=>[p.id,p]));
  return data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('android-media:')).flatMap(m=>{
    const p=places.get(m.placeIds[0]),saved=m.photoObservation,day=saved?.day||(m.start.precision==='day'?m.start.value:null);
    if(!day||!p?.coordinates)return [];
    return [{uri:m.uri,title:m.title,latitude:saved?.latitude??p.coordinates.latitude,longitude:saved?.longitude??p.coordinates.longitude,
      local:day+'T12:00:00',takenMs:saved?.takenMs??dayMs(day)+43200000,city:saved?.city||p.location?.photoCity||{key:p.id,label:p.name,country:p.name,region:p.name},memory:m}];
  });
}

export function clearAutomaticPhotoGroups(data,{removeMemories=false}={}){
  const own=photoOwnership(data),trips=new Set(data.trips.filter(t=>own.automatic(t)&&!own.protectedTrips.has(t.id)).map(t=>t.id));
  const homes=new Set(data.residences.filter(r=>own.automatic(r)&&!own.protectedHomes.has(r.id)).map(r=>r.id));
  const protectedVisits=new Set([...data.trips.filter(t=>!trips.has(t.id)).flatMap(t=>t.visitIds),...data.residences.filter(r=>!homes.has(r.id)).map(r=>r.visitId)]);
  const visits=new Set(data.visits.filter(v=>!protectedVisits.has(v.id)&&(trips.has(v.tripId)||own.automatic(v))).map(v=>v.id));
  const memories=new Set(removeMemories?data.memories.filter(m=>m.uri?.startsWith('android-media:')&&!m.tripIds.some(id=>own.protectedTrips.has(id))&&!own.manual(m)).map(m=>m.id):[]);
  data.trips=data.trips.filter(t=>!trips.has(t.id));data.residences=data.residences.filter(r=>!homes.has(r.id));data.visits=data.visits.filter(v=>!visits.has(v.id));
  data.memories=data.memories.filter(m=>!memories.has(m.id));for(const m of data.memories)m.tripIds=m.tripIds.filter(id=>!trips.has(id));
  if(removeMemories)delete data.meta.photoAutoGrouping;
  for(const c of data.chapters){c.relatedTripIds=c.relatedTripIds.filter(id=>!trips.has(id));c.memoryIds=c.memoryIds.filter(id=>!memories.has(id));}
  // Place IDs stay stable across regrouping, including manual names and Chapter anchors.
  return {memories:memories.size,trips:trips.size};
}

export function applyPhotoGrouping(data,input,names,{rules,now,version,force=false},{normalizeObservation,cityOf,tripTitle}){
  const own=photoOwnership(data),saved=savedPhotoObservations(data),byURI=new Map(saved.map(o=>[o.uri,o])),known=new Set(data.memories.map(m=>m.uri));
  let fresh=0;
  for(const raw of input){const o=normalizeObservation(raw);if(!o)continue;const city=cityOf(o,names,rules);if(!city)continue;
    const previous=byURI.get(o.uri);if(known.has(o.uri)&&!previous)continue;if(!previous&&!known.has(o.uri))fresh++;
    byURI.set(o.uri,{...o,city,memory:previous?.memory});known.add(o.uri);
  }
  const summary={photos:fresh,newTrips:0,newPlaces:0,tripIds:[],latestTripId:null};
  if(!fresh&&!force)return summary;
  const photos=[...byURI.values()].map(raw=>({...normalizeObservation(raw),...raw})).sort((a,b)=>a.instant-b.instant||a.uri.localeCompare(b.uri));
  if(!photos.length)return summary;
  // Refresh cached city names from the current offline pack when available.
  for(const o of photos)o.city=cityOf(o,names,rules)||o.city;
  const oldTripByURI=new Map(data.memories.map(m=>[m.uri,[...m.tripIds]])),oldTrips=[...data.trips],oldHomes=[...data.residences],oldVisits=new Map(data.visits.map(v=>[v.id,v]));
  const chapterTrips=new Map(data.chapters.map(c=>[c.id,new Set(c.relatedTripIds)]));
  const [evidence]=addEvidence(data,'inferred',{kind:'photo-auto-import',version,at:now.toISOString(),photos:photos.length,rules:{...rules}});
  clearAutomaticPhotoGroups(data);

  const cityDays=new Map(),byCity=new Map(),homeByYear=new Map();
  for(const o of photos){const key=o.day.slice(0,4)+'|'+o.city.key;
    if(!cityDays.has(key))cityDays.set(key,{city:o.city,year:o.day.slice(0,4),days:new Set()});cityDays.get(key).days.add(o.day);
    if(!byCity.has(o.city.key))byCity.set(o.city.key,[]);byCity.get(o.city.key).push(o);
  }
  for(const value of [...cityDays.values()].sort((a,b)=>a.city.key.localeCompare(b.city.key))){const best=homeByYear.get(value.year);if(!best||value.days.size>best.days.size)homeByYear.set(value.year,value);}
  const currentYear=String(now.getFullYear()),placeFor=new Map();
  for(const group of byCity.values()){
    const city=group[0].city,c={latitude:group.reduce((s,o)=>s+o.latitude,0)/group.length,longitude:group.reduce((s,o)=>s+o.longitude,0)/group.length};
    let p=group.map(o=>o.memory?.placeIds[0]).map(id=>data.places.find(p=>p.id===id)).find(p=>p?.coordinates&&distanceKm(p.coordinates,c)<=rules.placeReuseKm);
    p||=data.places.find(p=>p.name===city.label&&p.coordinates&&distanceKm(p.coordinates,c)<=rules.placeReuseKm);
    if(!p){p={id:newId('place'),name:city.label,coordinates:c,location:{status:'confirmed',label:'照片 GPS'},evidenceIds:[evidence]};data.places.push(p);summary.newPlaces++;}
    p.location={...p.location,photoCity:city};placeFor.set(city.key,p);
    for(const o of group){o.place=p;if(!o.memory){o.memory={id:newId('memory_photo'),kind:'photo',title:o.title||`${p.name} · ${o.day}`,uri:o.uri,start:partialDate(o.day),end:partialDate(o.day),placeIds:[p.id],tripIds:[],evidenceIds:[evidence]};data.memories.push(o.memory);}
      o.memory.photoObservation={latitude:o.latitude,longitude:o.longitude,takenMs:o.instant,day:o.day,city};
    }
  }
  const gap=rules.tripGapHours*3600000;
  const stays=[];let stay;
  for(const o of photos){if(!stay||stay.city.key!==o.city.key||o.instant-stay.photos.at(-1).instant>gap){stay={city:o.city,photos:[]};stays.push(stay);}stay.photos.push(o);}
  const beyondTwoMonths=stay=>{const d=new Date(dayMs(stay.photos[0].day)),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+2);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return dayMs(stay.photos.at(-1).day)>d.getTime();};
  const longStays=stays.filter(beyondTwoMonths),longPhotos=new Set(longStays.flatMap(s=>s.photos));
  const manualHome=data.residences.filter(r=>own.manual(r)||own.manual(oldVisits.get(r.visitId)));
  const covers=(r,o)=>r.placeId===o.place.id&&(dateBound(r.start)??-Infinity)<=dayMs(o.day)&&(dateBound(r.end,true,now.getTime())??Infinity)>=dayMs(o.day);
  const manualTravel=new Set(data.visits.filter(v=>own.manual(v)&&v.tripId&&v.evidenceIds.some(id=>data.evidence.find(e=>e.id===id)?.revisions.some(r=>r.before?.type!==r.after?.type))).map(v=>v.placeId));
  const isHome=o=>!manualTravel.has(o.place.id)&&(manualHome.some(r=>covers(r,o))||homeByYear.get(o.day.slice(0,4))?.city.key===o.city.key||longPhotos.has(o));
  const residenceRuns=longStays.map(s=>({city:s.city,photos:s.photos,current:false}));
  const thisYear=homeByYear.get(currentYear);
  if(thisYear){const group=byCity.get(thisYear.city.key).filter(o=>o.day.startsWith(currentYear));residenceRuns.push({city:thisYear.city,photos:group,current:true});}
  // Older yearly homes require evidence of a continuous stay, just like any other former city.
  const usedHomes=new Set();
  for(const run of residenceRuns){const p=placeFor.get(run.city.key);if(manualTravel.has(p.id)||manualHome.some(r=>r.placeId===p.id)||run.current===false&&thisYear?.city.key===run.city.key&&run.photos.some(o=>o.day.startsWith(currentYear)))continue;
    const first=run.photos[0].day,last=run.photos.at(-1).day,start=partialDate(first),end=run.current?ongoingDate():partialDate(last);
    const previous=oldHomes.find(r=>!own.protectedHomes.has(r.id)&&!usedHomes.has(r.id)&&r.placeId===p.id&&sameDate(r.start,start));
    const id=previous?.id||newId('residence'),visitId=previous?.visitId||newId('visit'),kind=run.current?'home':'past',type=run.current?'现居地':'曾居地';usedHomes.add(id);
    const note=run.current?'按今年照片天数推断的常住城市':'连续照片观测超过两个月，推断为曾住城市';
    data.visits.push({id:visitId,placeId:p.id,tripId:null,start,end,legacy:{date:`${first}~${run.current?'至今':last}`,trip:'',place:p.name,type,note},evidenceIds:[evidence]});
    data.residences.push({id,visitId,placeId:p.id,kind,start,end,title:p.name,note,type,evidenceIds:[evidence]});
  }
  const segments=[];let segment;
  for(const o of photos){
    // Protected journey membership is a user decision and also a segment boundary.
    if(o.memory.tripIds.some(id=>own.protectedTrips.has(id))||isHome(o)){segment=null;continue;}
    if(!segment||o.instant-segment.at(-1).instant>gap){segment=[];segments.push(segment);}segment.push(o);
  }
  const reused=new Set();
  for(const group of segments){
    const scores=new Map();for(const o of group)for(const id of oldTripByURI.get(o.uri)||[])if(!own.protectedTrips.has(id)&&!reused.has(id))scores.set(id,(scores.get(id)||0)+1);
    const prior=[...scores].sort((a,b)=>b[1]-a[1])[0]?.[0],old=oldTrips.find(t=>t.id===prior),id=old?.id||newId('trip');reused.add(id);
    const title=tripTitle(group),trip={id,title,autoTitle:title,type:'旅行',start:partialDate(group[0].day),end:partialDate(group.at(-1).day),visitIds:[],evidenceIds:[evidence]};data.trips.push(trip);if(!old)summary.newTrips++;
    // One city summary per journey. Alternating nearby photo locations must not
    // produce thousands of stops or inflate a city's journey count.
    const stops=new Map();
    for(const o of group){let stop=stops.get(o.place.id);if(!stop){stop={id:newId('visit'),placeId:o.place.id,tripId:id,start:partialDate(o.day),end:partialDate(o.day),legacy:{date:o.day,trip:title,place:o.place.name,type:'旅行',note:''},evidenceIds:[evidence]};stops.set(o.place.id,stop);data.visits.push(stop);trip.visitIds.push(stop.id);}stop.end=partialDate(o.day);stop.legacy.date=stop.start.value===o.day?o.day:`${stop.start.value}~${o.day}`;o.memory.tripIds=[id];}
    for(const c of data.chapters)if(group.some(o=>(oldTripByURI.get(o.uri)||[]).some(id=>chapterTrips.get(c.id).has(id)))&&!c.relatedTripIds.includes(id))c.relatedTripIds.push(id);
    summary.tripIds.push(id);
  }
  // No generated evidence may grow without bound on repeated incremental imports.
  const usedEvidence=new Set(['places','visits','trips','residences','chapters','memories'].flatMap(k=>data[k].flatMap(e=>e.evidenceIds)));
  data.evidence=data.evidence.filter(e=>e.source?.kind!=='photo-auto-import'||usedEvidence.has(e.id));
  data.meta.photoAutoGrouping={version,year:currentYear,currentHomePlaceId:thisYear?placeFor.get(thisYear.city.key).id:null};
  summary.latestTripId=summary.tripIds.at(-1)||null;validateDataset(data);return summary;
}
