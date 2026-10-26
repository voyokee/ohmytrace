import {validateDataset,newId,clone,dateBound} from '../schema.js';
import {validateStory,unknown} from './schema.js';

function coverage(entity,data){
  const visits=(entity.visitIds||[]).map(id=>data.visits.find(v=>v.id===id));
  const observedStarts=visits.map(v=>dateBound(v.start)).filter(n=>n!==null),observedEnds=visits.map(v=>dateBound(v.end,true)).filter(n=>n!==null);
  const start=dateBound(entity.start)??(observedStarts.length?Math.min(...observedStarts):null);
  const end=dateBound(entity.end,true)??(observedEnds.length?Math.max(...observedEnds):dateBound(entity.start,true));
  return start===null?null:{start,end:end??start};
}
export function storyYears(data){const years=new Set();for(const t of data.trips){const d=coverage(t,data);if(d)for(let y=new Date(d.start).getUTCFullYear();y<=new Date(d.end).getUTCFullYear();y++)years.add(y);}return [...years].sort((a,b)=>a-b);}

export function composeStory(data,{scope={type:'all'},title='我的人生故事',chapterIds,tripIds}={}){
  validateDataset(data);
  const byYear=e=>{const d=coverage(e,data),year={precision:'year',value:String(scope.year).padStart(4,'0')};return d!==null&&d.start<=dateBound(year,true)&&d.end>=dateBound(year);};
  if(!['all','chapter','trip','year'].includes(scope.type))throw new Error('未知故事范围');
  if(scope.type==='chapter'&&!data.chapters.some(c=>c.id===scope.id)||scope.type==='trip'&&!data.trips.some(t=>t.id===scope.id))throw new Error('故事范围不存在');
  if(scope.type==='year'&&(!Number.isInteger(scope.year)||scope.year<1||scope.year>9999))throw new Error('无效故事年份');
  const chapters=data.chapters.filter(c=>chapterIds?chapterIds.includes(c.id):scope.type==='chapter'?c.id===scope.id:scope.type==='all'||scope.type==='year'&&byYear(c));
  const trips=data.trips.filter(t=>tripIds?tripIds.includes(t.id):scope.type==='chapter'?chapters.some(c=>c.relatedTripIds.includes(t.id)):scope.type==='trip'?t.id===scope.id:scope.type==='year'?byYear(t):true)
    .sort((a,b)=>(dateBound(a.start)??Infinity)-(dateBound(b.start)??Infinity));
  if(chapterIds?.some(id=>!chapters.some(c=>c.id===id))||tripIds?.some(id=>!trips.some(t=>t.id===id)))throw new Error('故事选择包含不存在的记录');
  const scenes=[];
  const add=(kind,title,entity={},refs={})=>scenes.push({id:newId('scene'),kind,title,description:'',start:clone(entity.start||unknown()),end:clone(entity.end||unknown()),chapterId:null,tripId:null,placeId:null,memoryId:null,...refs,duration:kind==='place'?4:3});
  add('globe',title);
  const seen=new Set();
  function tripScenes(t,chapterId=null){
    seen.add(t.id);add('trip',t.title,t,{tripId:t.id,chapterId});
    for(const id of t.visitIds){const v=data.visits.find(v=>v.id===id),p=data.places.find(p=>p.id===v.placeId);add('place',p.name,v,{tripId:t.id,chapterId,placeId:p.id});}
  }
  for(const c of chapters){
    add('chapter',c.title,c,{chapterId:c.id});
    for(const id of c.homeAnchors){const p=data.places.find(p=>p.id===id);add('place',p.name,c,{chapterId:c.id,placeId:id});}
    for(const t of trips.filter(t=>c.relatedTripIds.includes(t.id)))tripScenes(t,c.id);
  }
  for(const t of trips.filter(t=>!seen.has(t.id)))tripScenes(t);
  add('closing','继续探索这段人生');
  return validateStory({schemaVersion:1,kind:'LifeStory',storyId:newId('story'),title,description:'',selectedChapterIds:chapters.map(c=>c.id),selectedTripIds:trips.map(t=>t.id),orderedScenes:scenes,
    visualTheme:'atlas',cameraPreferences:{motion:'system',speed:1},includedMemories:[],
    privacySettings:{locationMode:'city',includeNotes:false,includePhotos:false,excludedTripIds:[],excludedMemoryIds:[],hiddenPlaceIds:[],placeLabels:{}},
    provenanceSummary:{method:'deterministic-user-selection-v1'}});
}

export function setStoryMemories(story,data,memoryIds){
  const next=clone(story);next.includedMemories=[...new Set(memoryIds)];next.orderedScenes=next.orderedScenes.filter(s=>s.kind!=='memory'||next.includedMemories.includes(s.memoryId));
  for(const id of next.includedMemories){
    const m=data.memories.find(m=>m.id===id);if(!m)throw new Error('记忆不存在');
    if(!m.tripIds.some(id=>next.selectedTripIds.includes(id))&&!data.chapters.some(c=>next.selectedChapterIds.includes(c.id)&&c.memoryIds.includes(id)))throw new Error('记忆不在所选人生范围内');
    if(next.orderedScenes.some(s=>s.kind==='memory'&&s.memoryId===id))continue;
    const after=next.orderedScenes.findLastIndex(s=>s.kind==='place'&&m.placeIds.includes(s.placeId)||s.kind==='trip'&&m.tripIds.includes(s.tripId));
    next.orderedScenes.splice(after>=0?after+1:Math.max(1,next.orderedScenes.length-1),0,{id:newId('scene'),kind:'memory',title:m.title||'记忆时刻',description:'',start:clone(m.start),end:clone(m.end),chapterId:null,tripId:m.tripIds.find(id=>next.selectedTripIds.includes(id))||null,placeId:m.placeIds[0]||null,memoryId:id,duration:5});
  }
  return validateStory(next);
}
