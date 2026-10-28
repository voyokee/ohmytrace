import {dateBound,partialDate} from './schema.js';
import {photoRegion,photoPlaceName} from './geocoding/region-policy.js';
import {readTripTitle} from './media/journey-title.js';
const point=p=>p?.coordinates&&Number.isFinite(p.coordinates.latitude)&&Number.isFinite(p.coordinates.longitude)&&Math.abs(p.coordinates.latitude)<=90&&Math.abs(p.coordinates.longitude)<=180;
const date=d=>d?.precision==='ongoing'?'至今':d?.value??null;
const connectionNote='地点顺序已知，实际经过路径未知';
function collect(data,{scope={type:'all'},now=new Date()}={}){
 if(!['all','year','chapter'].includes(scope.type))throw new Error('请选择全部、年份或人生阶段');
 if(scope.type==='year'&&(!Number.isInteger(scope.year)||scope.year<1||scope.year>9999))throw new Error('请选择有效年份');
 const chapter=scope.type==='chapter'?data.chapters.find(c=>c.id===scope.id&&!c.hidden):null;
 if(scope.type==='chapter'&&!chapter)throw new Error('人生阶段不存在');
 const year=scope.type==='year'?partialDate(String(scope.year).padStart(4,'0')):null,lower=year?dateBound(year):null,upper=year?dateBound(year,true):null;
 const overlaps=e=>{const a=dateBound(e.start||{precision:'unknown'}),b=dateBound(e.end||{precision:'unknown'},true,now.getTime());return (a??b)!==null&&(b??a)!==null&&(a??b)<=upper&&(b??a)>=lower;};
 const places=new Map(data.places.filter(p=>!p.hidden&&point(p)).map(p=>[p.id,p])),hiddenTrips=new Set(data.trips.filter(t=>t.hidden).map(t=>t.id)),hiddenVisits=new Set(data.residences.filter(r=>r.hidden).map(r=>r.visitId));
 const visits=data.visits.filter(v=>!v.hidden&&!hiddenVisits.has(v.id)&&!hiddenTrips.has(v.tripId)&&places.has(v.placeId)),byVisit=new Map(visits.map(v=>[v.id,v]));
 const trips=data.trips.filter(t=>!t.hidden&&(scope.type==='all'||(chapter?chapter.relatedTripIds.includes(t.id):overlaps(t)||t.visitIds.some(id=>byVisit.has(id)&&overlaps(byVisit.get(id)))))),tripIds=new Set(trips.map(t=>t.id));
 const chapters=data.chapters.filter(c=>!c.hidden&&(scope.type==='all'||(chapter?c.id===chapter.id:overlaps(c))));
 const selectedVisits=visits.filter(v=>scope.type==='all'||tripIds.has(v.tripId)||(chapter?chapter.homeAnchors.includes(v.placeId):overlaps(v)));
 const photos=data.memories.filter(m=>m.kind==='photo'&&!m.hidden&&(!m.tripIds.length||m.tripIds.some(id=>!hiddenTrips.has(id)))&&(scope.type==='all'||(chapter?chapter.memoryIds.includes(m.id)||m.tripIds.some(id=>tripIds.has(id))||m.placeIds.some(id=>chapter.homeAnchors.includes(id)):overlaps(m))));
 const ids=scope.type==='all'?new Set(places.keys()):new Set([...selectedVisits.map(v=>v.placeId),...photos.flatMap(m=>m.placeIds),...chapters.flatMap(c=>c.homeAnchors),...data.residences.filter(r=>!r.hidden&&scope.type==='year'&&overlaps(r)).map(r=>r.placeId)]);
 const evidence=new Map(data.evidence.map(e=>[e.id,e.state])),features=[],points=new Map(),routes=[];
 for(const p of places.values())if(ids.has(p.id)){
  const related=selectedVisits.filter(v=>v.placeId===p.id),memories=photos.filter(m=>m.placeIds.includes(p.id)),periods=[...related,...memories];
  const first=periods.filter(e=>dateBound(e.start)!==null).sort((a,b)=>dateBound(a.start)-dateBound(b.start))[0],last=periods.filter(e=>dateBound(e.end,true,now.getTime())!==null).sort((a,b)=>dateBound(b.end,true,now.getTime())-dateBound(a.end,true,now.getTime()))[0];
  const states=p.evidenceIds.map(id=>evidence.get(id)),truth=states.includes('manual')?'manual':states.includes('observed')?'observed':'inferred';
  const residence=data.residences.filter(r=>!r.hidden&&r.placeId===p.id),visitType=p.visitType||(residence.some(r=>r.kind==='home')?'home':residence.length?'past':related.length&&related.every(v=>v.legacy.type==='转机')?'transit':related.length&&related.every(v=>v.legacy.type==='路过')?'pass-through':'travel');
  const feature={type:'Feature',geometry:{type:'Point',coordinates:[p.coordinates.longitude,p.coordinates.latitude]},properties:{recordType:'place',id:p.id,name:photoPlaceName(p,data),region:photoRegion(p.location?.photoCity||p.location).displayName,visitType,firstVisit:date(first?.start),lastVisit:date(last?.end),photoCount:memories.length,truth,...(!states.some(s=>['manual','observed','inferred'].includes(s))?{sourceUncertain:true}:{})}};
  features.push(feature);points.set(p.id,feature);
 }
 for(const t of trips){const stops=t.visitIds.map(id=>byVisit.get(id)).filter(v=>v&&points.has(v.placeId)).map(v=>points.get(v.placeId));
  // A single known stop has no known line; duplicating it would invent a segment.
  const feature={type:'Feature',geometry:stops.length>=2?{type:'LineString',coordinates:stops.map(p=>p.geometry.coordinates)}:null,properties:{recordType:'trip',id:t.id,title:readTripTitle(data,t),start:date(t.start),end:date(t.end),connection:'inferred-order',connectionNote}};features.push(feature);routes.push({feature,stops});
 }
 for(const c of chapters){const relevant=routes.filter(r=>c.relatedTripIds.includes(r.feature.properties.id)),placeIds=[...new Set([...c.homeAnchors,...relevant.flatMap(r=>r.stops.map(p=>p.properties.id))])].filter(id=>points.has(id));features.push({type:'Feature',geometry:null,properties:{recordType:'chapter',id:c.id,title:c.title,start:date(c.start),end:date(c.end),placeIds,tripIds:relevant.map(r=>r.feature.properties.id)}});}
 return {features,points:[...points.values()],routes};
}
export function exportGeoJSON(data,options={}){return JSON.stringify({type:'FeatureCollection',features:collect(data,options).features},null,2);}
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function exportGPX(data,{now=new Date(),...options}={}){
 const {points,routes}=collect(data,{...options,now}),tag=(name,value)=>`<${name}>${xml(value)}</${name}>`;
 const waypoint=(p,name)=>{const [lon,lat]=p.geometry.coordinates,v=p.properties;return `<${name} lat="${lat}" lon="${lon===180?-180:lon}">${tag('name',v.name)}${tag('desc',v.region)}${tag('type',v.visitType)}<extensions>${tag('oh:firstVisit',v.firstVisit)}${tag('oh:lastVisit',v.lastVisit)}${tag('oh:truth',v.truth)}</extensions></${name}>`;};
 return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OnceHere" xmlns="http://www.topografix.com/GPX/1/1" xmlns:oh="urn:oncehere:export:1">'+`<metadata>${tag('name','OnceHere 足迹')}${tag('desc',connectionNote)}${tag('time',now.toISOString())}</metadata>`+points.map(p=>waypoint(p,'wpt')).join('')+routes.map(({feature,stops})=>`<rte>${tag('name',feature.properties.title)}${tag('desc',connectionNote)}<extensions>${tag('oh:start',feature.properties.start)}${tag('oh:end',feature.properties.end)}${tag('oh:connection','inferred-order')}</extensions>${stops.map(p=>waypoint(p,'rtept')).join('')}</rte>`).join('')+'</gpx>';
}
export function exportFileName(data,{format='geojson',scope={type:'all'},now=new Date()}={}){
 if(!['geojson','gpx'].includes(format))throw new Error('导出格式不支持');
 const label=scope.type==='year'?`${scope.year}年`:scope.type==='chapter'?data.chapters.find(c=>c.id===scope.id&&!c.hidden)?.title||'阶段':'全部',safe=label.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,60)||'全部';
 const day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');return `OnceHere-足迹-${safe}-${day}.${format}`;
}
