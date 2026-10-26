import {clone,newId,dateBound} from '../schema.js';
import {RECONSTRUCTION_RULES} from './config.js';

export function distanceKm(a,b,rules=RECONSTRUCTION_RULES) {
  const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=((b.longitude-a.longitude+540)%360-180)*rad;
  const q=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
  return rules.earthRadiusKm*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,q))));
}
const localDay=asset=>asset.extractedTime?.localDateTime?.slice(0,10)||null;
const ordinal=asset=>asset.extractedTime?.wallClockOrdinal??null;
function gapHours(a,b) {
  const instant=a.extractedTime?.utcEpochMs!==null&&b.extractedTime?.utcEpochMs!==null&&Number.isFinite(a.extractedTime?.utcEpochMs)&&Number.isFinite(b.extractedTime?.utcEpochMs);
  if(ordinal(a)===null||ordinal(b)===null)return {hours:null,basis:'unknown'};
  return {hours:((instant?b.extractedTime.utcEpochMs:ordinal(b))-(instant?a.extractedTime.utcEpochMs:ordinal(a)))/3600000,basis:instant?'offset-instant':'local-order-uncertain'};
}
function coveredDates(assets) {const days=assets.map(localDay).filter(Boolean).sort();return {start:days[0]||null,end:days.at(-1)||null};}
function residenceFor(asset,data,rules) {
  const day=localDay(asset);if(!day)return null;
  const stamp=Date.parse(day+'T00:00:00Z');
  return data.residences.find(r=>{
    const p=data.places.find(p=>p.id===r.placeId),a=dateBound(r.start),b=dateBound(r.end,true);
    return p?.coordinates&&a!==null&&b!==null&&a<=stamp&&stamp<=b&&distanceKm(p.coordinates,asset.coordinates,rules)<=rules.homeRadiusKm;
  })||null;
}
function placeFor(coordinates,data,rules) {
  return data.places.filter(p=>p.coordinates).map(p=>({place:p,distance:distanceKm(p.coordinates,coordinates,rules)})).filter(p=>p.distance<=rules.existingPlaceRadiusKm).sort((a,b)=>a.distance-b.distance||a.place.id.localeCompare(b.place.id))[0]?.place||null;
}
function visitFor(assets,data,rules) {
  const first=assets[0],place=placeFor(first.coordinates,data,rules),residence=residenceFor(first,data,rules);
  const covered=coveredDates(assets);
  return {id:newId('visit_candidate'),proposedPlaceId:newId('place'),proposedVisitId:newId('visit'),placeId:place?.id||null,
    placeName:place?.name||`城市未知 · ${first.coordinates.latitude.toFixed(4)}, ${first.coordinates.longitude.toFixed(4)}`,
    coordinates:clone(first.coordinates),assetIds:assets.map(a=>a.assetId),observedStart:covered.start,observedEnd:covered.end,
    arrival:'unknown',departure:'unknown',residenceId:residence?.id||null,
    reasons:[place?'existing-place-within-radius':'photo-gps-observation',residence?'within-dated-residence':'residence-not-established']};
}
function tripCoverage(trip,data) {
  let a=dateBound(trip.start),b=dateBound(trip.end,true);
  if(a===null||b===null){const visits=data.visits.filter(v=>trip.visitIds.includes(v.id));const starts=visits.map(v=>dateBound(v.start)).filter(v=>v!==null),ends=visits.map(v=>dateBound(v.end,true)).filter(v=>v!==null);a=starts.length?Math.min(...starts):null;b=ends.length?Math.max(...ends):null;}
  return {start:a,end:b};
}
export function matchExistingTrips(visits,data,rules=RECONSTRUCTION_RULES) {
  const starts=visits.map(v=>v.observedStart).filter(Boolean).sort(),ends=visits.map(v=>v.observedEnd).filter(Boolean).sort();
  if(!starts.length)return [];
  const a=Date.parse(starts[0]+'T00:00:00Z'),b=Date.parse(ends.at(-1)+'T00:00:00Z'),padding=rules.existingTripDayPadding*86400000;
  return data.trips.flatMap(trip=>{
    const coverage=tripCoverage(trip,data);if(coverage.start===null||coverage.end===null||a>coverage.end+padding||b<coverage.start-padding)return [];
    const places=trip.visitIds.map(id=>data.visits.find(v=>v.id===id)?.placeId).map(id=>data.places.find(p=>p.id===id)).filter(p=>p?.coordinates);
    const matches=visits.filter(v=>places.some(p=>distanceKm(p.coordinates,v.coordinates,rules)<=rules.existingPlaceRadiusKm)).length;
    return matches?[{tripId:trip.id,matchedStops:matches,reasons:['overlapping-photo-coverage','near-existing-trip-stop']}]:[];
  }).sort((a,b)=>b.matchedStops-a.matchedStops||a.tripId.localeCompare(b.tripId));
}
function candidateFor(visits,data,rules) {
  const matches=matchExistingTrips(visits,data,rules),allHome=visits.every(v=>v.residenceId);
  return {id:newId('trip_candidate'),proposedTripId:newId('trip'),title:`照片记录 · ${visits[0].observedStart||'日期未知'}`,
    visits,action:matches.length?'link':allHome?'memory':'create',relatedTripId:matches[0]?.tripId||null,matches,
    start:'',end:'',transport:'unknown',chapterIds:[],excluded:false,
    reasons:[allHome?'daily-photos-within-residence':'possible-away-visit',visits.reduce((n,v)=>n+v.assetIds.length,0)===1?'single-photo-boundaries-unknown':'photo-coverage-not-complete-trip']};
}
export function reconstructPhotos(input,data,{rules=RECONSTRUCTION_RULES}={}) {
  const assets=[...new Map(input.map(a=>[a.assetId,a])).values()];
  const supported=assets.filter(a=>a.processingStatus==='analyzed'),located=supported.filter(a=>a.coordinates);
  const allZoned=located.filter(a=>a.extractedTime).every(a=>Number.isFinite(a.extractedTime.utcEpochMs));
  const stamp=a=>!a.extractedTime?Infinity:allZoned?a.extractedTime.utcEpochMs:ordinal(a);
  located.sort((a,b)=>stamp(a)-stamp(b)||a.assetId.localeCompare(b.assetId));
  const visits=[];let group=[];
  const flush=()=>{if(group.length){visits.push(visitFor(group,data,rules));group=[];}};
  for(const asset of located) {
    const previous=group.at(-1),gap=previous?gapHours(previous,asset):null;
    if(previous&&(gap.hours===null||gap.hours<0||gap.hours>rules.visitGapHours||distanceKm(group[0].coordinates,asset.coordinates,rules)>rules.placeRadiusKm||residenceFor(previous,data,rules)?.id!==residenceFor(asset,data,rules)?.id))flush();
    group.push(asset);
  }flush();
  const assetMap=new Map(assets.map(a=>[a.assetId,a])),candidates=[];let trip=[];
  const flushTrip=()=>{if(trip.length){candidates.push(candidateFor(trip,data,rules));trip=[];}};
  for(const visit of visits) {
    const prior=trip.at(-1),a=prior&&assetMap.get(prior.assetIds.at(-1)),b=assetMap.get(visit.assetIds[0]),gap=a?gapHours(a,b):null;
    if(prior&&(gap.hours===null||gap.hours<0||gap.hours>rules.tripGapHours||Boolean(prior.residenceId)!==Boolean(visit.residenceId)))flushTrip();
    trip.push(visit);
  }flushTrip();
  return {version:1,baseDatasetId:data.id,baseRevision:data.revision,rules:clone(rules),candidates,
    unlocatedAssetIds:supported.filter(a=>!a.coordinates).map(a=>a.assetId),includeUnlocated:true,
    diagnosticAssetIds:assets.filter(a=>a.processingStatus!=='analyzed').map(a=>a.assetId),
    timeOrderBasis:allZoned?'offset-instant':'local-order-uncertain',manualRevisions:[]};
}
function recordRevision(review,action,before,after){review.manualRevisions.push({at:new Date().toISOString(),action,before:clone(before),after:clone(after)});}
export function editCandidate(review,id,patch) {
  const candidate=review.candidates.find(c=>c.id===id);if(!candidate)throw new Error('候选不存在');
  const allowed=['title','action','relatedTripId','start','end','chapterIds','excluded'];
  if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('不支持的候选修改');
  const before=clone(candidate);Object.assign(candidate,clone(patch));recordRevision(review,'edit',before,candidate);return review;
}
export function editVisitName(review,candidateId,visitId,name) {
  const visit=review.candidates.find(c=>c.id===candidateId)?.visits.find(v=>v.id===visitId);if(!visit||!name.trim())throw new Error('地点名称不能为空');
  const before=clone(visit);visit.placeName=name.trim();recordRevision(review,'rename-place',before,visit);return review;
}
export function mergeCandidates(review,ids) {
  const selected=review.candidates.filter(c=>ids.includes(c.id)&&!c.excluded);if(selected.length<2)throw new Error('至少选择两个候选合并');
  const first=selected[0],merged={...clone(first),id:newId('trip_candidate'),proposedTripId:newId('trip'),visits:selected.flatMap(c=>clone(c.visits)),chapterIds:[...new Set(selected.flatMap(c=>c.chapterIds))],reasons:[...new Set(selected.flatMap(c=>c.reasons)),'manual-merge']};
  if(!selected.every(c=>c.relatedTripId===first.relatedTripId)){merged.action='create';merged.relatedTripId=null;}
  merged.visits.sort((a,b)=>(a.observedStart||'9999').localeCompare(b.observedStart||'9999'));
  review.candidates=review.candidates.filter(c=>!ids.includes(c.id));review.candidates.push(merged);recordRevision(review,'merge',selected,merged);return review;
}
export function splitCandidate(review,id,{photos=false,assets=[]}={}) {
  const candidate=review.candidates.find(c=>c.id===id);if(!candidate)throw new Error('候选不存在');
  const assetMap=new Map(assets.map(a=>[a.assetId,a]));
  const pieces=photos?candidate.visits.flatMap(v=>v.assetIds.map(assetId=>{const asset=assetMap.get(assetId);return {...clone(v),id:newId('visit_candidate'),proposedVisitId:newId('visit'),assetIds:[assetId],observedStart:localDay(asset),observedEnd:localDay(asset)};})):clone(candidate.visits);
  if(pieces.length<2)throw new Error('候选没有足够的地点或照片可拆分');
  const split=pieces.map((visit,i)=>({...clone(candidate),id:newId('trip_candidate'),proposedTripId:newId('trip'),title:`${candidate.title} · ${i+1}`,visits:[visit],reasons:[...candidate.reasons,'manual-split']}));
  review.candidates=review.candidates.filter(c=>c.id!==id).concat(split);recordRevision(review,'split',candidate,split);return review;
}
