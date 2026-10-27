import {dateBound} from './schema.js';
// One policy for cards, statistics, replay and export. Original observations stay intact.
const nonTravel=value=>['transit','pass-through','home','past','路过','转机','现居地','曾居地'].includes(value);
export const visiblePlace=(data,id)=>data.places.some(p=>p.id===id&&!p.hidden);
export function visitCountsAsTravel(data,visit,trip=null){
  if(!visit||visit.hidden||!visiblePlace(data,visit.placeId)||trip?.hidden||nonTravel(trip?.visitType)||nonTravel(trip?.type))return false;
  const place=data.places.find(p=>p.id===visit.placeId);
  return !nonTravel(place.visitType)&&!nonTravel(visit.legacy.type);
}
export function tripCountsAsTravel(data,trip){
  return !!trip&&!trip.hidden&&!nonTravel(trip.visitType)&&!nonTravel(trip.type)&&trip.visitIds.some(id=>visitCountsAsTravel(data,data.visits.find(v=>v.id===id),trip));
}
export function memoryVisibleOnMap(data,memory){
  return !memory.hidden&&memory.placeIds.some(id=>visiblePlace(data,id))&&(!memory.tripIds.length||memory.tripIds.some(id=>data.trips.some(t=>t.id===id&&!t.hidden)));
}

export function placeCountsAsVisited(data,id,{year=null}={}){
 const p=data.places.find(p=>p.id===id);if(!p||p.hidden||nonTravel(p.visitType))return false;
 const visits=data.visits.filter(v=>v.placeId===id);
 return !visits.length||visits.some(v=>!v.hidden&&!['transit','pass-through','转机','路过'].includes(v.legacy.type)&&(year==null||(dateBound(v.start)??-Infinity)<=Date.UTC(year,11,31,23,59,59)&&(dateBound(v.end,true)??Infinity)>=Date.UTC(year,0,1)));
}
