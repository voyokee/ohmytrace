import {regionOf,photoRegion} from '../geocoding/region-policy.js';
import {visitCountsAsTravel} from '../travel-policy.js';
const shortRegion=name=>{const s=String(name||'');return s.length>2?s.replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市|府|县|都)$/,''):s;};
// Rank cities by distinct observed days, then photo count, with stable ties.
export function tripTitle(segment,{homeCountry=null}={}){
 const ranked=new Map();for(const o of segment){const key=o.city.key;let r=ranked.get(key);if(!r){r={city:o.city,days:new Set(),photos:0};ranked.set(key,r);}r.days.add(o.day);r.photos++;}
 const cities=[...ranked.values()].sort((a,b)=>b.days.size-a.days.size||b.photos-a.photos);
 if(!cities.length)return '机场 / 路过停留';
 const names=[...new Set(cities.map(r=>r.city.hasCity===false?shortRegion(r.city.region===r.city.country?'':r.city.region):r.city.label).filter(Boolean))];
 if(!names.length)return '足迹回顾';
 const countries=[...new Set(cities.map(r=>photoRegion(r.city).sovereignCode).filter(Boolean))],home=typeof homeCountry==='object'?photoRegion(homeCountry):regionOf(homeCountry),abroad=home.sovereignCode&&countries.length===1&&countries[0]!==home.sovereignCode;
 if(names.length>=3)return abroad?`${regionOf(countries[0]).shortName} · ${names[0]}等 ${names.length} 城`:`${names.slice(0,2).join('、')}等 ${names.length} 城`;
 return names.join(' · ');
}
// Old installed datasets must not require regrouping merely to display a title.
export function readTripTitle(data,trip){
 if(!trip.autoTitle||trip.title!==trip.autoTitle)return trip.title;
 const photos=data.memories.filter(m=>!m.hidden&&m.tripIds.includes(trip.id)&&m.photoObservation);
 if(!photos.some(m=>photoRegion(m.photoObservation.city).displayName!==m.photoObservation.city?.country))return trip.title;
 const ids=new Set(trip.visitIds.map(id=>data.visits.find(v=>v.id===id)).filter(v=>v&&visitCountsAsTravel(data,v,trip)).map(v=>v.placeId));
 const segment=photos.filter(m=>m.placeIds.some(id=>ids.has(id))).sort((a,b)=>a.photoObservation.takenMs-b.photoObservation.takenMs).map(m=>{const p=data.places.find(p=>p.id===m.placeIds[0]);return {day:m.photoObservation.day,city:{...m.photoObservation.city,key:p.id,label:p.name}};});
 const home=data.places.find(p=>p.id===data.meta.photoAutoGrouping?.currentHomePlaceId)?.location?.photoCity;
 return tripTitle(segment,{homeCountry:home});
}
