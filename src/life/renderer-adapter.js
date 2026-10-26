import {clone,dateBound,validateDataset} from './schema.js';
import {datasetRows} from './legacy.js';

const format=d=>d.precision==='unknown'?'未知':d.precision==='ongoing'?'至今':d.value;
// Bounds are display-only intervals; canonical precision remains untouched.
export function renderDate(start,end) {
  const a=dateBound(start),b=dateBound(end,true);
  if(a==null)return null;
  const label=JSON.stringify(start)===JSON.stringify(end)?format(start):`${format(start)} – ${format(end)}`;
  return {start:a,end:b??dateBound(start,true),days:start.precision==='day'&&end.precision==='day'?Math.round((b-a)/86400000)+1:null,
    ongoing:end.precision==='ongoing',label,short:label,prec:start.precision,uncertainEnd:end.precision==='unknown'};
}
function inYear(item,year) {
  if(!item.date)return item.kind!=='trip';
  return new Date(item.date.start).getUTCFullYear()<=year&&new Date(item.date.end).getUTCFullYear()>=year;
}
export function projectDataset(data,scope={type:'all'}) {
  validateDataset(data);
  const keys=new Map(),used=new Set();
  for(const p of data.places) {
    let key=p.name;
    if(used.has(key)){let i=2;while(used.has(`${p.name} · ${i}`))i++;key=`${p.name} · ${i}`;}
    used.add(key);keys.set(p.id,key);
  }
  const places=Object.create(null),placeIds=Object.create(null);
  for(const p of data.places){const key=keys.get(p.id);placeIds[key]=p.id;places[key]={...clone(p.location),...(p.coordinates?{lat:p.coordinates.latitude,lon:p.coordinates.longitude}:{}),lifePlaceId:p.id,sourceName:p.name};}
  const visits=new Map(data.visits.map(v=>[v.id,v]));
  let trips=data.trips.map(t=>({id:t.id,kind:'trip',title:t.title,type:t.type,date:renderDate(t.start,t.end),
    stops:t.visitIds.map(id=>{const v=visits.get(id);return {place:keys.get(v.placeId),placeId:v.placeId,visitId:id,note:v.legacy.note};})}));
  let homes=data.residences.map(r=>({id:r.id,kind:r.kind,title:r.title,place:keys.get(r.placeId),placeId:r.placeId,type:r.type,note:r.note,date:renderDate(r.start,r.end)}));
  const chapter=scope.type==='chapter'?data.chapters.find(c=>c.id===scope.id):null;
  if(scope.type==='chapter') {
    if(!chapter)throw new Error('人生阶段不存在');
    trips=trips.filter(t=>chapter.relatedTripIds.includes(t.id));
    homes=homes.filter(h=>chapter.homeAnchors.includes(h.placeId));
    // Home anchors need not already be ResidencePeriod records. Synthetic view
    // items never become fabricated canonical residences.
    for(const id of chapter.homeAnchors)if(!homes.some(h=>h.placeId===id))homes.push({id:`anchor:${id}`,kind:'home',title:keys.get(id),place:keys.get(id),placeId:id,type:'阶段地点',note:'关联阶段地点',date:renderDate(chapter.start,chapter.end)});
  } else if(scope.type==='year') {trips=trips.filter(t=>inYear(t,scope.year));homes=homes.filter(h=>inYear(h,scope.year));}
  const order=x=>x.date?.start??Infinity;
  trips.sort((a,b)=>order(a)-order(b));homes.sort((a,b)=>(b.kind==='home')-(a.kind==='home')||order(b)-order(a));
  trips.forEach((t,i)=>{
    t.n=i+1;t.year=t.date?new Date(t.date.start).getUTCFullYear():null;t.endYear=t.date?new Date(t.date.end).getUTCFullYear():null;
    const dated=homes.filter(h=>h.date&&t.date&&h.date.start<=t.date.start&&t.date.start<=h.date.end);
    const undated=homes.filter(h=>h.kind==='home'&&!h.date);
    t.origin=dated.sort((a,b)=>b.date.start-a.date.start)[0]||(undated.length===1?undated[0]:null);
  });
  const rows=datasetRows(data).map(r=>({...r,place:keys.get(r._lifePlaceId)}));
  return {rows,places,placeIds,trips,homes,chapter:clone(chapter),chapterPeriod:chapter?renderDate(chapter.start,chapter.end):null,scope:clone(scope)};
}
export class RendererAdapter {
  constructor(repository) {
    this.repository=repository;this.scope={type:'all'};this.focus=null;this.listeners=new Set();
    this.unsubscribe=repository.subscribe(data=>{
      if(this.scope.type==='chapter'&&!data.chapters.some(c=>c.id===this.scope.id))this.scope={type:'all'};
      if(this.focus&&!data[this.focus.type==='trip'?'trips':'places'].some(e=>e.id===this.focus.id))this.focus=null;
      this.emit();
    });
  }
  getRenderSnapshot() {return {...projectDataset(this.repository.getDataset(),this.scope),focus:clone(this.focus)};}
  setScope(scope) {
    if(!['all','year','chapter'].includes(scope?.type)||scope.type==='year'&&(!Number.isInteger(scope.year)||scope.year<1||scope.year>9999))throw new Error('无效浏览范围');
    projectDataset(this.repository.getDataset(),scope);this.scope=clone(scope);this.focus=null;this.emit();
  }
  focusTrip(id) {this.setFocus('trip',id,'trips');}
  focusPlace(id) {this.setFocus('place',id,'places');}
  setFocus(type,id,key) {
    if(!this.repository.getDataset()[key].some(e=>e.id===id))throw new Error('聚焦对象不存在');
    this.focus={type,id};this.emit();
  }
  subscribe(listener) {this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  emit() {for(const listener of this.listeners)listener(this.getRenderSnapshot());}
  dispose() {this.unsubscribe();this.listeners.clear();}
}
