import {dateBound,clone} from '../schema.js';
import {validateArtifact,parseArtifact} from './share.js';
import {periodText} from './schema.js';

const renderDate=e=>{const start=dateBound(e.start),end=dateBound(e.end,true);return start===null?null:{start,end:end??dateBound(e.start,true),prec:e.start.precision,days:null,label:periodText(e),short:periodText(e)};};
// Deliberately no Repository, IndexedDB, localStorage or Canonical Dataset here.
export function createStoryBridge(input){
  const artifact=parseArtifact(input);let scope={type:'all'},focus=null;
  const names=new Map(),used=new Set();for(const p of artifact.places){let name=p.name,i=1;while(used.has(name))name=`${p.name} · ${++i}`;used.add(name);names.set(p.id,name);}
  const adapter={get scope(){return clone(scope);},setScope(next){
    if(!['all','chapter','trip','year'].includes(next?.type)||next.type==='chapter'&&!artifact.chapters.some(c=>c.id===next.id)||next.type==='trip'&&!artifact.trips.some(t=>t.id===next.id))throw new Error('分享范围无效');scope=clone(next);
  },focusTrip(id){if(!artifact.trips.some(t=>t.id===id))throw new Error('旅行不存在');focus={type:'trip',id};},focusPlace(id){if(!artifact.places.some(p=>p.id===id))throw new Error('地点不存在');focus={type:'place',id};},
    getRenderSnapshot(){
      const chapter=scope.type==='chapter'?artifact.chapters.find(c=>c.id===scope.id):null;
      let trips=artifact.trips.filter(t=>scope.type==='chapter'?chapter.relatedTripIds.includes(t.id):scope.type==='trip'?t.id===scope.id:true).map((t,i)=>{
        let date=renderDate(t);if(!date){const dated=t.stops.filter(s=>dateBound(s.start)!==null).sort((a,b)=>dateBound(a.start)-dateBound(b.start));if(dated.length){date=renderDate({start:dated[0].start,end:dated.at(-1).end});date.label=`到访观测 ${date.label} · 旅行起止未知`;date.short=date.label;}}
        return {id:t.id,kind:'trip',title:t.title,type:t.type||'旅行',n:i+1,date,year:date?new Date(date.start).getUTCFullYear():null,endYear:date?new Date(date.end).getUTCFullYear():null,origin:null,inferredConnections:t.routeKind==='inferred',routeKind:t.routeKind,
          stops:t.stops.map((s,index)=>({place:names.get(s.placeId),placeId:s.placeId,visitId:`${t.id}:${index}`,note:s.note})),memoryCount:artifact.memories.filter(m=>m.kind==='photo'&&m.tripIds.includes(t.id)).length};
      });
      if(scope.type==='year')trips=trips.filter(t=>t.year!==null&&t.year<=scope.year&&t.endYear>=scope.year);
      const selected=chapter?[chapter]:artifact.chapters;
      const homes=selected.flatMap(c=>c.homeAnchors.map(id=>({id:`anchor:${c.id}:${id}`,anchor:true,kind:'home',title:names.get(id),place:names.get(id),placeId:id,type:'阶段地点',note:'分享的阶段地点',date:renderDate(c)})));
      const places=Object.create(null),placeIds=Object.create(null);
      for(const p of artifact.places){const name=names.get(p.id);placeIds[name]=p.id;places[name]={status:p.coordinates?'confirmed':'unknown',lifePlaceId:p.id,sourceName:p.name,granularity:p.granularity,...(p.coordinates?{lat:p.coordinates.latitude,lon:p.coordinates.longitude}:{})};}
      const rows=[...trips.flatMap(t=>t.stops.map(s=>({place:s.place}))),...homes.map(h=>({place:h.place}))];
      return {rows,places,placeIds,trips,homes,chapter:clone(chapter),chapterPeriod:chapter?renderDate(chapter):null,scope:clone(scope),focus:clone(focus)};
    }};
  return {adapter,status:()=>`只读分享 · ${artifact.title}`,artifact:clone(artifact)};
}
