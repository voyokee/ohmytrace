import {tripTitle} from './journey-title.js';
export {tripTitle} from './journey-title.js';
import {COLLECTIONS} from '../schema.js';
import {applyPhotoGrouping,clearAutomaticPhotoGroups,photoOwnership} from './auto-grouping.js';
export {savedPhotoObservations} from './auto-grouping.js';

// One-tap album import. Photos arrive as pointers (no pixels are kept) with GPS
// and capture time already read; nothing is reviewed. Unusable or unnamed
// locations are dropped silently, places are merged per city, trips split on
// time gaps and on returning home.
// Bump when grouping rules change. Regroup from saved observations in Photos.
// v5: domestic display/sovereign policy, without replacing manual decisions.
export const AUTO_VERSION=5;
export const AUTO_RULES=Object.freeze({nameCellDegrees:0.00001,tripGapHours:72,placeReuseKm:100});

/**
 * Finds places this import created whose offline name has since changed (the city
 * packs moved from English to Chinese). Async naming only; nothing is modified.
 */
export async function placeRenames(data,geonames){
  const own=new Set(data.evidence.filter(e=>e.source?.kind==='photo-auto-import').map(e=>e.id)),renames=new Map();
  const manual=new Set(data.evidence.filter(e=>e.state==='manual').map(e=>e.id));
  for(const p of data.places){
    if(!p.coordinates||!p.evidenceIds.some(id=>own.has(id))||p.evidenceIds.some(id=>manual.has(id)))continue;
    let g=null;try{g=await geonames.reverse({latitude:p.coordinates.latitude,longitude:p.coordinates.longitude});}catch{continue;}
    const label=g&&(g.city||g.admin1||g.country);if(label&&label!==p.name)renames.set(p.id,{from:p.name,to:label});
  }
  return renames;
}
/** Applies placeRenames inside a repository update, including labels derived from the name. */
export function applyPlaceRenames(data,renames){
  const manual=new Set(data.evidence.filter(e=>e.state==='manual').map(e=>e.id));
  for(const p of data.places){const r=renames.get(p.id);if(!r||p.name!==r.from||p.evidenceIds.some(id=>manual.has(id)))continue;p.name=r.to;
    const renamed=city=>city?{...city,label:r.to,key:`${city.countryCode||city.key.split('|')[0]}|${r.to}`} :city;
    if(p.location?.photoCity)p.location.photoCity=renamed(p.location.photoCity);
    for(const m of data.memories)if(m.placeIds.includes(p.id)&&m.photoObservation?.city)m.photoObservation.city=renamed(m.photoObservation.city);
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


function cityOf(o,names,rules){
  const g=names.get(cellKey(o,rules));if(!g||!g.country)return null;
  const label=g.city||g.admin1||g.country;
  return {key:`${g.countryCode||g.country}|${label}`,label,hasCity:!!g.city,country:g.country,countryCode:g.countryCode,sovereignCode:g.sovereignCode,region:g.admin1||g.country};
}
/** Mutates `data` (a working copy) with the photos; returns a summary. Pure apart from IDs. */
export function applyAutoImport(data,input,names,{rules=AUTO_RULES,now=new Date(),force=false}={}){
  if(data.meta.origin==='demo')for(const key of COLLECTIONS)data[key]=[];
  data.meta.origin='user';
  return applyPhotoGrouping(data,input,names,{rules,now,version:AUTO_VERSION,force},{normalizeObservation,cityOf,tripTitle});
}

/** True when saved one-tap results were grouped by an older AUTO_VERSION. */
export const autoImportOutdated=(data,now=new Date())=>data.meta.photoAutoGrouping
  ?data.meta.photoAutoGrouping.version<AUTO_VERSION||data.meta.photoAutoGrouping.year!==String(now.getFullYear())
  :data.evidence.some(e=>e.source?.kind==='photo-auto-import'&&(e.source.version||1)<AUTO_VERSION);
/**
 * Removes everything the one-tap import created (pointers, its trips, visits,
 * residences and otherwise unused places) so it can be rebuilt with current rules.
 * Records the visitor made, including CSV trips that photos extended, are kept.
 */
export function removeAutoImportData(data){return clearAutomaticPhotoGroups(data,{removeMemories:true});}

/**
 * Removes what the earlier review-based photo import produced (media: memories,
 * 照片旅行 trips, photo visits and places nothing else uses) so the one-tap import
 * can regroup the same album by city. CSV records, chapters and residences stay.
 */
export function removeLegacyPhotoData(data){
  const own=photoOwnership(data),protectedTrips=new Set(data.trips.filter(t=>own.manual(t)||t.visitIds.some(id=>own.manual(data.visits.find(v=>v.id===id)))).map(t=>t.id));
  const kind=new Map(data.evidence.map(e=>[e.id,e.source?.kind])),from=(entity,kinds)=>entity.evidenceIds.some(id=>kinds.includes(kind.get(id)));
  const memories=new Set(data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('media:')&&!m.photoObservation&&!m.evidenceIds.some(id=>kind.get(id)==='photo-auto-import')&&!m.tripIds.some(id=>protectedTrips.has(id))&&!own.manual(m)).map(m=>m.id));
  if(!memories.size)return {memories:0,trips:0};
  const trips=new Set(data.trips.filter(t=>!protectedTrips.has(t.id)&&t.type==='照片旅行'&&from(t,['photo-reconstruction'])).map(t=>t.id));
  const visits=new Set(data.visits.filter(v=>!protectedTrips.has(v.tripId)&&(trips.has(v.tripId)||from(v,['photo-visit']))).map(v=>v.id));
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
