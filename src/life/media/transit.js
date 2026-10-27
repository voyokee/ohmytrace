import {AIRPORTS} from './airports.js';
import {distanceKm} from './reconstruction.js';
export function nearbyAirport(point){
 let best=null,km=3;
 for(const [ident,code,latitude,longitude] of AIRPORTS){if(Math.abs(point.latitude-latitude)>.03)continue;const d=distanceKm(point,{latitude,longitude});if(d<=km){best={ident,code};km=d;}}
 return best;
}
// Classifications describe observations, never a claimed track or flight.
export function classifyStops(group,{home=null}={}){
 const stays=[];let stay;
 for(const o of group){if(!stay||stay.placeId!==o.place.id){stay={placeId:o.place.id,photos:[]};stays.push(stay);}stay.photos.push(o);}
 const farDestination=home&&stays.some(s=>distanceKm(home,s.photos[0].place.coordinates)>100);
 for(let i=0;i<stays.length;i++){
  const s=stays[i],hours=(s.photos.at(-1).instant-s.photos[0].instant)/3600000,airports=s.photos.map(nearbyAirport);
  const manual=s.photos[0].place.visitType;
  s.type=manual||'travel';s.reason=null;
  if(!manual&&hours<12&&airports.every(a=>a&&a.ident===airports[0].ident)){s.type='transit';s.reason=`${airports[0].code} 机场 3 公里内，照片跨度不足 12 小时`;}
  else if(!manual&&farDestination&&(i===0||i===stays.length-1)&&hours<6&&distanceKm(home,s.photos[0].place.coordinates)<=100){s.type='pass-through';s.reason='出发或返程端点，距居住城市不足 100 公里，照片跨度不足 6 小时';}
 }
 // One summary per city: any substantive visit wins over a transit at the same city.
 const result=new Map();for(const s of stays){const prior=result.get(s.placeId);if(!prior||prior.type!=='travel'&&s.type==='travel')result.set(s.placeId,{type:s.type,reason:s.reason});}
 return result;
}
