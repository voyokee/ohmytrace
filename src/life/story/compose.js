import {validateDataset,newId,clone,dateBound,partialDate} from '../schema.js';
import {validateStory,unknown,memoryInStory} from './schema.js';
import {tripCountsAsTravel,visitCountsAsTravel,visiblePlace} from '../travel-policy.js';
import {readTripTitle} from '../media/journey-title.js';
import {photoPlaceName,cityIdentity} from '../geocoding/region-policy.js';

function coverage(entity,data){
  const visits=(entity.visitIds||[]).map(id=>data.visits.find(v=>v.id===id));
  const observedStarts=visits.map(v=>dateBound(v.start)).filter(n=>n!==null),observedEnds=visits.map(v=>dateBound(v.end,true)).filter(n=>n!==null);
  const start=dateBound(entity.start)??(observedStarts.length?Math.min(...observedStarts):null);
  const end=dateBound(entity.end,true)??(observedEnds.length?Math.max(...observedEnds):dateBound(entity.start,true));
  return start===null?null:{start,end:end??start};
}
export function storyYears(data){const years=new Set();for(const t of data.trips.filter(t=>tripCountsAsTravel(data,t))){const d=coverage(t,data);if(d)for(let y=new Date(d.start).getUTCFullYear();y<=new Date(d.end).getUTCFullYear();y++)years.add(y);}return [...years].sort((a,b)=>a-b);}

export function composeStory(data,{scope={type:'all'},title='OnceHere 足迹回顾',chapterIds,tripIds}={}){
  validateDataset(data);
  const byYear=e=>{const d=coverage(e,data),year={precision:'year',value:String(scope.year).padStart(4,'0')};return d!==null&&d.start<=dateBound(year,true)&&d.end>=dateBound(year);};
  if(!['all','chapter','trip','year','range','place','residence'].includes(scope.type))throw new Error('未知故事范围');
  const place=scope.type==='place'?data.places.find(p=>p.id===scope.id&&!p.hidden):null;
  const sameCity=p=>place&&p&&!p.hidden&&cityIdentity(p)===cityIdentity(place);
  const contextChapter=data.chapters.find(c=>!c.hidden&&c.id===(scope.chapterId|| (scope.type==='chapter'?scope.id:null)));
  if(scope.chapterId&&!contextChapter)throw new Error('人生阶段不存在');
  const stageMatches=e=>!contextChapter||(dateBound(e.start)??-Infinity)<=(dateBound(contextChapter.end,true)??Infinity)&&(dateBound(e.end,true)??Infinity)>=(dateBound(contextChapter.start)??-Infinity);
  const residence=scope.type==='residence'?data.residences.find(r=>r.id===scope.id&&!r.hidden&&visiblePlace(data,r.placeId)):null;
  if(scope.type==='place'&&!place||scope.type==='residence'&&!residence)throw new Error('故事范围不存在');
  // A range is inclusive at month or day precision, e.g. {start:'2025-03',end:'2025-09'}.
  const from=scope.type==='range'?dateBound(partialDate(scope.start)):null,to=scope.type==='range'?dateBound(partialDate(scope.end),true):null;
  if(scope.type==='range'&&(from===null||to===null||from>to))throw new Error('请选择有效的开始和结束时间');
  const byRange=e=>{const d=coverage(e,data);return d!==null&&d.start<=to&&d.end>=from;},inScope=e=>scope.type==='year'?byYear(e):scope.type==='range'&&byRange(e);
  if(scope.type==='chapter'&&!data.chapters.some(c=>c.id===scope.id)||scope.type==='trip'&&!data.trips.some(t=>t.id===scope.id))throw new Error('故事范围不存在');
  if((scope.type==='year'||scope.year!==undefined)&&(!Number.isInteger(scope.year)||scope.year<1||scope.year>9999))throw new Error('无效故事年份');
  const cityYear=v=>(scope.year===undefined||byYear(v))&&stageMatches(v);
  const chapters=data.chapters.filter(c=>!c.hidden&&(chapterIds?chapterIds.includes(c.id):scope.type==='chapter'?c.id===scope.id:scope.type==='all'||inScope(c)));
  const trips=data.trips.filter(t=>tripCountsAsTravel(data,t)&&cityYear(t)&&(!contextChapter||contextChapter.relatedTripIds.includes(t.id))&&(tripIds?tripIds.includes(t.id):scope.type==='chapter'?chapters.some(c=>c.relatedTripIds.includes(t.id)):scope.type==='trip'?t.id===scope.id:scope.type==='place'?t.visitIds.some(id=>{const v=data.visits.find(v=>v.id===id);return visitCountsAsTravel(data,v,t)&&sameCity(data.places.find(p=>p.id===v.placeId))&&cityYear(v);}):scope.type==='residence'?((coverage(t,data)?.start??Infinity)<=(dateBound(residence.end,true)??Infinity)&&(coverage(t,data)?.end??-Infinity)>=(dateBound(residence.start)??-Infinity)):['year','range'].includes(scope.type)?inScope(t):true))
    .sort((a,b)=>(dateBound(a.start)??Infinity)-(dateBound(b.start)??Infinity));
  if(chapterIds?.some(id=>!chapters.some(c=>c.id===id))||tripIds?.some(id=>!trips.some(t=>t.id===id)))throw new Error('故事选择包含不存在的记录');
  const scenes=[];
  const add=(kind,title,entity={},refs={})=>{
    let start=clone(entity.start||unknown()),end=clone(entity.end||unknown());
    if(['place','trip','chapter'].includes(kind)){
      const lower=scope.year!==undefined?partialDate(String(scope.year)):contextChapter?.start;
      const upper=scope.year!==undefined?partialDate(String(scope.year)):contextChapter?.end;
      if(lower&&dateBound(lower)!==null&&dateBound(start)!==null&&dateBound(start)<dateBound(lower))start=clone(lower);
      if(upper&&dateBound(upper,true)!==null&&dateBound(end,true)!==null&&dateBound(end,true)>dateBound(upper,true))end=clone(upper);
    }
    scenes.push({id:newId('scene'),kind,title,description:'',start,end,chapterId:null,tripId:null,placeId:null,memoryId:null,...refs,duration:kind==='place'?4:3});
  };
  add('globe',title);
  if(place){const time=scope.year?{start:partialDate(String(scope.year)),end:partialDate(String(scope.year))}:contextChapter||{};add('place',photoPlaceName(place,data),time,{placeId:place.id});}
  if(residence){const p=data.places.find(p=>p.id===residence.placeId);add('place',photoPlaceName(p,data),residence,{placeId:p.id});}
  const seen=new Set();
  function tripScenes(t,chapterId=null){
    seen.add(t.id);add('trip',readTripTitle(data,t),t,{tripId:t.id,chapterId});
    for(const id of t.visitIds){const v=data.visits.find(v=>v.id===id),p=data.places.find(p=>p.id===v.placeId);if(visitCountsAsTravel(data,v,t)&&cityYear(v)&&(!place||sameCity(p)))add('place',photoPlaceName(p,data),v,{tripId:t.id,chapterId,placeId:p.id});}
  }
  for(const c of chapters){
    add('chapter',c.title,c,{chapterId:c.id});
    for(const id of c.homeAnchors){const p=data.places.find(p=>p.id===id);if(!p.hidden)add('place',photoPlaceName(p,data),c,{chapterId:c.id,placeId:id});}
    for(const t of trips.filter(t=>c.relatedTripIds.includes(t.id)))tripScenes(t,c.id);
  }
  for(const t of trips.filter(t=>!seen.has(t.id)))tripScenes(t);
  add('closing','回放结束');
  return validateStory({schemaVersion:1,kind:'LifeStory',storyId:newId('story'),title,description:'',selectedChapterIds:chapters.map(c=>c.id),selectedTripIds:trips.map(t=>t.id),orderedScenes:scenes,
    visualTheme:'atlas',cameraPreferences:{motion:'system',speed:1},includedMemories:[],
    privacySettings:{locationMode:'city',includeNotes:false,includePhotos:false,excludedTripIds:[],excludedMemoryIds:[],hiddenPlaceIds:[],placeLabels:{}},
    provenanceSummary:{method:'deterministic-user-selection-v1'}});
}

export function setStoryMemories(story,data,memoryIds){
  const next=clone(story);next.includedMemories=[...new Set(memoryIds)];next.orderedScenes=next.orderedScenes.filter(s=>s.kind!=='memory'||next.includedMemories.includes(s.memoryId));
  for(const id of next.includedMemories){
    const m=data.memories.find(m=>m.id===id);if(!m||m.hidden)throw new Error('照片或记录不存在');
    if(!memoryInStory(next,data,m))throw new Error('照片或记录不在所选范围内');
    if(next.orderedScenes.some(s=>s.kind==='memory'&&s.memoryId===id))continue;
    const after=next.orderedScenes.findLastIndex(s=>m.tripIds.length?m.tripIds.includes(s.tripId)&&(s.kind==='trip'||s.kind==='place'&&m.placeIds.includes(s.placeId)):s.kind==='place'&&m.placeIds.includes(s.placeId));
    next.orderedScenes.splice(after>=0?after+1:Math.max(1,next.orderedScenes.length-1),0,{id:newId('scene'),kind:'memory',title:m.title||'记忆时刻',description:'',start:clone(m.start),end:clone(m.end),chapterId:null,tripId:m.tripIds.find(id=>next.selectedTripIds.includes(id))||null,placeId:m.placeIds[0]||null,memoryId:id,duration:5});
  }
  return validateStory(next);
}
