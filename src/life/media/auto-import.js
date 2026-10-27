import {COLLECTIONS,newId,partialDate,ongoingDate,addEvidence,validateDataset} from '../schema.js';
import {distanceKm} from './reconstruction.js';

// One-tap album import. Photos arrive as pointers (no pixels are kept) with GPS
// and capture time already read; nothing is reviewed. Unusable or unnamed
// locations are dropped silently, places are merged per city, trips split on
// time gaps and on returning home.
export const AUTO_RULES=Object.freeze({nameCellDegrees:0.05,tripGapHours:72,homeMinDays:5,homeMinShare:0.3,residenceRadiusKm:30,placeReuseKm:100,tripMatchDays:1});

/**
 * Finds places this import created whose offline name has since changed (the city
 * packs moved from English to Chinese). Async naming only; nothing is modified.
 */
export async function placeRenames(data,geonames){
  const own=new Set(data.evidence.filter(e=>e.source?.kind==='photo-auto-import').map(e=>e.id)),renames=new Map();
  for(const p of data.places){
    if(!p.coordinates||!p.evidenceIds.some(id=>own.has(id)))continue;
    let g=null;try{g=await geonames.reverse({latitude:p.coordinates.latitude,longitude:p.coordinates.longitude});}catch{continue;}
    const label=g&&(g.city||g.admin1||g.country);if(label&&label!==p.name)renames.set(p.id,{from:p.name,to:label});
  }
  return renames;
}
/** Applies placeRenames inside a repository update, including labels derived from the name. */
export function applyPlaceRenames(data,renames){
  for(const p of data.places){const r=renames.get(p.id);if(!r||p.name!==r.from)continue;p.name=r.to;
    for(const v of data.visits)if(v.placeId===p.id&&v.legacy.place===r.from)v.legacy.place=r.to;
    for(const h of data.residences)if(h.placeId===p.id&&h.title===r.from)h.title=r.to;
    for(const m of data.memories)if(m.placeIds.includes(p.id)&&m.title?.startsWith(r.from+' · '))m.title=r.to+m.title.slice(r.from.length);}
  return data;
}

const validPoint=o=>Number.isFinite(o?.latitude)&&Number.isFinite(o?.longitude)&&Math.abs(o.latitude)<=90&&Math.abs(o.longitude)<=180&&!(Math.abs(o.latitude)<1e-6&&Math.abs(o.longitude)<1e-6);
const pad=n=>String(n).padStart(2,'0');
const deviceDay=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
export const cellKey=(o,rules=AUTO_RULES)=>`${Math.round(o.latitude/rules.nameCellDegrees)}:${Math.round(o.longitude/rules.nameCellDegrees)}`;

/** Normalizes a native/web observation; returns null when it cannot be placed in time and space. */
export function normalizeObservation(o){
  if(!o||typeof o.uri!=='string'||!o.uri||!validPoint(o))return null;
  const local=typeof o.local==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(o.local)?o.local:null;
  const offset=Number.isInteger(o.offsetMinutes)?o.offsetMinutes:null,taken=Number.isFinite(o.takenMs)&&o.takenMs>0?o.takenMs:null;
  const instant=local&&offset!==null?Date.parse(local+'Z')-offset*60000:taken??(local?Date.parse(local):null);
  const day=local?local.slice(0,10):taken?deviceDay(taken):null;
  if(!Number.isFinite(instant)||!day)return null;
  return {uri:o.uri,title:o.title||null,latitude:o.latitude,longitude:o.longitude,instant,day};
}

/** Resolves one offline name per small grid cell; cells without a name are left out. */
export async function nameCells(observations,geonames,{rules=AUTO_RULES,concurrency=4,signal,onProgress=()=>{}}={}){
  const firsts=new Map();for(const o of observations){const key=cellKey(o,rules);if(!firsts.has(key))firsts.set(key,o);}
  const queue=[...firsts],names=new Map();let next=0,done=0;
  const worker=async()=>{while(next<queue.length){signal?.throwIfAborted();const [key,o]=queue[next++];
    try{names.set(key,await geonames.reverse({latitude:o.latitude,longitude:o.longitude}));}catch{names.set(key,null);}
    onProgress({processed:++done,total:queue.length});}};
  await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},worker));return names;
}

const shortRegion=name=>String(name||'').replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市)$/,'')||name;
function cityOf(o,names,rules){
  const g=names.get(cellKey(o,rules));if(!g||!g.country)return null;
  const label=g.city||g.admin1||g.country;
  return {key:`${g.countryCode||g.country}|${label}`,label,country:g.country,region:g.admin1||g.country};
}
function coverage(entity,data){
  const visits=(entity.visitIds||[]).map(id=>data.visits.find(v=>v.id===id)).filter(Boolean);
  const days=visits.flatMap(v=>[v.start,v.end]).filter(d=>d?.precision==='day').map(d=>d.value).sort();
  const start=entity.start?.precision==='day'?entity.start.value:days[0],end=entity.end?.precision==='day'?entity.end.value:days.at(-1);
  return start&&end?{start,end}:null;
}
const dayMs=day=>Date.parse(day+'T00:00:00Z');

/** Mutates `data` (a working copy) with the photos; returns a summary. Pure apart from IDs. */
export function applyAutoImport(data,input,names,{rules=AUTO_RULES,now=new Date()}={}){
  if(data.meta.origin==='demo')for(const key of COLLECTIONS)data[key]=[];
  data.meta.origin='user';
  const known=new Set(data.memories.map(m=>m.uri)),seen=new Set(),photos=[];
  for(const raw of input){const o=normalizeObservation(raw);if(!o||known.has(o.uri)||seen.has(o.uri))continue;
    const city=cityOf(o,names,rules);if(!city)continue;seen.add(o.uri);photos.push({...o,city});}
  const summary={photos:photos.length,newTrips:0,newPlaces:0,tripIds:[],latestTripId:null};
  if(!photos.length)return summary;
  photos.sort((a,b)=>a.instant-b.instant||a.uri.localeCompare(b.uri));
  const [evidence]=addEvidence(data,'observed',{kind:'photo-auto-import',at:now.toISOString(),photos:photos.length,rules:{...rules}});

  // Home: an existing residence nearby, else the city holding most photo days.
  const residencePlaces=data.residences.map(r=>data.places.find(p=>p.id===r.placeId)).filter(p=>p?.coordinates);
  const nearResidence=o=>residencePlaces.find(p=>distanceKm(p.coordinates,o)<=rules.residenceRadiusKm)||null;
  let homeKey=null;
  if(!residencePlaces.length){
    const days=new Map(),all=new Set();for(const o of photos){all.add(o.day);if(!days.has(o.city.key))days.set(o.city.key,new Set());days.get(o.city.key).add(o.day);}
    const [key,set]=[...days].sort((a,b)=>b[1].size-a[1].size)[0];
    if(set.size>=rules.homeMinDays&&set.size>=all.size*rules.homeMinShare)homeKey=key;
  }
  const homeCountry=(homeKey?photos.find(o=>o.city.key===homeKey):null)?.city.country
    ??[...photos.reduce((m,o)=>m.set(o.city.country,(m.get(o.city.country)||0)+1),new Map())].sort((a,b)=>b[1]-a[1])[0][0];

  // Places are one per city: reuse a same-named place nearby, else create once.
  const placeFor=new Map();
  const cityPlace=(city,points)=>{
    if(placeFor.has(city.key))return placeFor.get(city.key);
    const c={latitude:points.reduce((n,o)=>n+o.latitude,0)/points.length,longitude:points.reduce((n,o)=>n+o.longitude,0)/points.length};
    let place=data.places.find(p=>p.name===city.label&&p.coordinates&&distanceKm(p.coordinates,c)<=rules.placeReuseKm);
    if(!place){place={id:newId('place'),name:city.label,coordinates:c,location:{status:'confirmed',label:'照片 GPS'},evidenceIds:[evidence]};data.places.push(place);summary.newPlaces++;}
    placeFor.set(city.key,place);return place;
  };
  const memory=(o,place,trip)=>data.memories.push({id:newId('memory_photo'),kind:'photo',title:o.title||`${o.city.label} · ${o.day}`,uri:o.uri,
    start:partialDate(o.day),end:partialDate(o.day),placeIds:[place.id],tripIds:trip?[trip.id]:[],evidenceIds:[evidence]});

  // Split into home photos and trip segments in one chronological pass.
  const segments=[];let current=null;
  for(const o of photos){
    const home=homeKey?o.city.key===homeKey:!!nearResidence(o);
    if(home){current=null;const place=nearResidence(o)||cityPlace(o.city,photos.filter(p=>p.city.key===o.city.key));o.homePlace=place;continue;}
    if(!current||o.instant-current.at(-1).instant>rules.tripGapHours*3600000){current=[];segments.push(current);}
    current.push(o);
  }
  for(const o of photos)if(o.homePlace)memory(o,o.homePlace,null);
  if(homeKey&&!data.residences.length){
    const homes=photos.filter(o=>o.homePlace),place=homes[0].homePlace,visit={id:newId('visit'),placeId:place.id,tripId:null,start:partialDate(homes[0].day),end:ongoingDate(),
      legacy:{date:`${homes[0].day}~至今`,trip:'',place:place.name,type:'现居地',note:'照片推断的常住城市'},evidenceIds:[evidence]};
    data.visits.push(visit);data.residences.push({id:newId('residence'),visitId:visit.id,placeId:place.id,kind:'home',start:partialDate(homes[0].day),end:ongoingDate(),title:place.name,note:'照片推断的常住城市',type:'现居地',evidenceIds:[evidence]});
  }

  for(const segment of segments){
    const start=segment[0].day,end=segment.at(-1).day,from=dayMs(start)-rules.tripMatchDays*86400000,to=dayMs(end)+rules.tripMatchDays*86400000;
    let trip=data.trips.find(t=>{const c=coverage(t,data);return c&&dayMs(c.start)<=to&&dayMs(c.end)>=from;});
    if(!trip){
      const regions=[...new Set(segment.map(o=>o.city.country===homeCountry?shortRegion(o.city.region):o.city.country))];
      trip={id:newId('trip'),title:`${regions.slice(0,2).join(' · ')}${regions.length>2?' 等':''}之旅`,type:'旅行',start:partialDate(start),end:partialDate(end),visitIds:[],evidenceIds:[evidence]};
      data.trips.push(trip);summary.newTrips++;
    }else{
      const c=coverage(trip,data);
      if(trip.start.precision==='day'&&start<trip.start.value)trip.start=partialDate(start);
      if(trip.end.precision==='day'&&end>trip.end.value)trip.end=partialDate(end);
      if(!c&&trip.start.precision==='unknown'){trip.start=partialDate(start);trip.end=partialDate(end);}
    }
    const byCity=new Map();for(const o of segment){if(!byCity.has(o.city.key))byCity.set(o.city.key,[]);byCity.get(o.city.key).push(o);}
    for(const group of byCity.values()){
      const place=cityPlace(group[0].city,group),first=group[0].day,last=group.at(-1).day;
      let visit=data.visits.find(v=>v.tripId===trip.id&&v.placeId===place.id);
      if(visit){if(visit.start.precision==='day'&&first<visit.start.value)visit.start=partialDate(first);if(visit.end.precision==='day'&&last>visit.end.value)visit.end=partialDate(last);}
      else{visit={id:newId('visit'),placeId:place.id,tripId:trip.id,start:partialDate(first),end:partialDate(last),
        legacy:{date:first===last?first:`${first}~${last}`,trip:trip.title,place:place.name,type:trip.type,note:''},evidenceIds:[evidence]};
        data.visits.push(visit);trip.visitIds.push(visit.id);}
      for(const o of group)memory(o,place,trip);
    }
    if(!summary.tripIds.includes(trip.id))summary.tripIds.push(trip.id);
  }
  summary.latestTripId=summary.tripIds.at(-1)||null;
  validateDataset(data);return summary;
}


/**
 * Removes what the earlier review-based photo import produced (media: memories,
 * 照片旅行 trips, photo visits and places nothing else uses) so the one-tap import
 * can regroup the same album by city. CSV records, chapters and residences stay.
 */
export function removeLegacyPhotoData(data){
  const kind=new Map(data.evidence.map(e=>[e.id,e.source?.kind])),from=(entity,kinds)=>entity.evidenceIds.some(id=>kinds.includes(kind.get(id)));
  const memories=new Set(data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('media:')).map(m=>m.id));
  if(!memories.size)return {memories:0,trips:0};
  const trips=new Set(data.trips.filter(t=>t.type==='照片旅行'&&from(t,['photo-reconstruction'])).map(t=>t.id));
  const visits=new Set(data.visits.filter(v=>trips.has(v.tripId)||from(v,['photo-visit'])).map(v=>v.id));
  data.memories=data.memories.filter(m=>!memories.has(m.id));
  data.visits=data.visits.filter(v=>!visits.has(v.id));
  for(const t of data.trips)t.visitIds=t.visitIds.filter(id=>!visits.has(id));
  for(const t of data.trips)if(!t.visitIds.length)trips.add(t.id);
  data.trips=data.trips.filter(t=>!trips.has(t.id));
  for(const c of data.chapters){c.relatedTripIds=c.relatedTripIds.filter(id=>!trips.has(id));c.memoryIds=c.memoryIds.filter(id=>!memories.has(id));}
  const used=new Set([...data.visits.map(v=>v.placeId),...data.residences.map(r=>r.placeId),...data.chapters.flatMap(c=>c.homeAnchors),...data.memories.flatMap(m=>m.placeIds)]);
  data.places=data.places.filter(p=>used.has(p.id)||!from(p,['photo-exif']));
  return {memories:memories.size,trips:trips.size};
}
