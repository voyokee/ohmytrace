import {clone,validateDataset,validatePeriod} from '../schema.js';
import {validateStory,validateScene,keys,list,ids,text} from './schema.js';
import {tripCountsAsTravel,visitCountsAsTravel,visiblePlace} from '../travel-policy.js';

const date=d=>({precision:d.precision,value:d.value});
const period=e=>({start:date(e.start),end:date(e.end)});
export const COORDINATE_RULE='0.1-degree-grid (~11 km latitude); not an administrative city boundary';

export function projectShare(data,story,{images={}}={}){
  validateDataset(data);validateStory(story);
  const policy=story.privacySettings;
  const chapters=data.chapters.filter(c=>!c.hidden&&story.selectedChapterIds.includes(c.id)).map(c=>({...c,homeAnchors:c.homeAnchors.filter(id=>visiblePlace(data,id))}));
  const trips=data.trips.filter(t=>tripCountsAsTravel(data,t)&&story.selectedTripIds.includes(t.id)&&!policy.excludedTripIds.includes(t.id)).map(t=>({...t,visitIds:t.visitIds.filter(id=>{const v=data.visits.find(v=>v.id===id);return visitCountsAsTravel(data,v,t);})}));
  if(story.selectedChapterIds.some(id=>!data.chapters.some(c=>c.id===id))||story.selectedTripIds.some(id=>!data.trips.some(t=>t.id===id)))throw new Error('原始人生记录已改变，请重新生成故事');
  if(story.selectedChapterIds.some(id=>data.chapters.find(c=>c.id===id)?.hidden)||story.selectedTripIds.some(id=>!tripCountsAsTravel(data,data.trips.find(t=>t.id===id))))throw new Error('原始人生记录已改变，请重新生成故事');
  const selectedMemories=data.memories.filter(m=>!m.hidden&&story.includedMemories.includes(m.id)&&!policy.excludedMemoryIds.includes(m.id)&&
    (m.tripIds.some(id=>trips.some(t=>t.id===id))||chapters.some(c=>c.memoryIds.includes(m.id)))&&
    (m.kind==='photo'?policy.includePhotos:policy.includeNotes));
  const visitIds=new Set(trips.flatMap(t=>t.visitIds)),visits=data.visits.filter(v=>visitIds.has(v.id));
  const standalonePlaces=story.orderedScenes.filter(s=>s.kind==='place'&&!s.tripId&&!s.chapterId).map(s=>s.placeId);
  const placeIds=new Set([...visits.map(v=>v.placeId),...chapters.flatMap(c=>c.homeAnchors),...selectedMemories.flatMap(m=>m.placeIds),...standalonePlaces]);
  const places=data.places.filter(p=>!p.hidden&&placeIds.has(p.id));
  const map=(items,prefix)=>new Map(items.map((e,i)=>[e.id,`${prefix}${i+1}`]));
  const pm=map(places,'p'),tm=map(trips,'t'),cm=map(chapters,'c'),mm=map(selectedMemories,'m');
  const homes=new Set(data.residences.map(r=>r.placeId));chapters.forEach(c=>c.homeAnchors.forEach(id=>homes.add(id)));
  const exportedPlaces=places.map((p,i)=>{
    const hidden=policy.locationMode==='hidden'||policy.hiddenPlaceIds.includes(p.id),mode=hidden?'hidden':policy.locationMode;
    const coordinates=hidden||!p.coordinates?null:mode==='city'?{latitude:Math.round(p.coordinates.latitude*10)/10,longitude:Math.round(p.coordinates.longitude*10)/10}:{latitude:p.coordinates.latitude,longitude:p.coordinates.longitude};
    return {id:pm.get(p.id),name:policy.placeLabels[p.id]??(hidden?'隐藏地点':homes.has(p.id)&&mode!=='precise'?`居住区域 ${i+1}`:p.name),coordinates,granularity:mode};
  });
  const exportedMemories=selectedMemories.map(m=>({id:mm.get(m.id),kind:['photo','note','video'].includes(m.kind)?m.kind:'other',title:m.title||'记忆时刻',...period(m),
    placeIds:m.placeIds.map(id=>pm.get(id)).filter(Boolean),tripIds:m.tripIds.map(id=>tm.get(id)).filter(Boolean),
    text:policy.includeNotes&&typeof m.text==='string'?m.text:'',image:m.kind==='photo'&&images[m.id]?images[m.id]:null}));
  const exportedTrips=trips.map(t=>({id:tm.get(t.id),title:t.title,type:t.type,...period(t),routeKind:t.visitIds.some(id=>!exportedPlaces.find(p=>p.id===pm.get(visits.find(v=>v.id===id).placeId)).coordinates)?'unknown':'inferred',
    stops:t.visitIds.map(id=>{const v=visits.find(v=>v.id===id);return {placeId:pm.get(v.placeId),...period(v),note:policy.includeNotes?v.legacy.note:''};})}));
  const exportedChapters=chapters.map(c=>({id:cm.get(c.id),title:c.title,type:c.type,...period(c),homeAnchors:c.homeAnchors.map(id=>pm.get(id)),relatedTripIds:c.relatedTripIds.map(id=>tm.get(id)).filter(Boolean)}));
  const scenes=story.orderedScenes.filter(s=>(!s.chapterId||cm.has(s.chapterId))&&(!s.tripId||tm.has(s.tripId))&&(!s.memoryId||mm.has(s.memoryId))&&(!s.placeId||pm.has(s.placeId)))
    .map((s,i)=>({id:`s${i+1}`,kind:s.kind,title:s.kind==='place'&&s.title===places.find(p=>p.id===s.placeId)?.name?exportedPlaces.find(p=>p.id===pm.get(s.placeId))?.name||s.title:s.title,description:s.description,...period(s),
      chapterId:cm.get(s.chapterId)||null,tripId:tm.get(s.tripId)||null,placeId:pm.get(s.placeId)||null,memoryId:mm.get(s.memoryId)||null,duration:s.duration}));
  const evidenceIds=new Set([...places,...trips,...chapters,...visits,...selectedMemories].flatMap(e=>e.evidenceIds));
  const counts=Object.fromEntries(['observed','inferred','manual','unknown'].map(state=>[state,data.evidence.filter(e=>evidenceIds.has(e.id)&&e.state===state).length]));
  return validateArtifact({schemaVersion:1,kind:'OhMyTraceStory',storyId:story.storyId,title:story.title,description:story.description,
    selectedChapterIds:exportedChapters.map(c=>c.id),selectedTripIds:exportedTrips.map(t=>t.id),orderedScenes:scenes,visualTheme:story.visualTheme,cameraPreferences:clone(story.cameraPreferences),
    includedMemories:exportedMemories.map(m=>m.id),privacySettings:{locationMode:policy.locationMode,includeNotes:policy.includeNotes,includePhotos:policy.includePhotos,coordinateRule:COORDINATE_RULE},
    provenanceSummary:{...counts,routeExplanation:'Stops are recorded visits; lines between them are inferred connections, not recorded paths. Unknown coordinates have no line.'},
    places:exportedPlaces,trips:exportedTrips,chapters:exportedChapters,memories:exportedMemories});
}

function validPeriod(e){for(const d of [e.start,e.end])keys(d,['precision','value']);validatePeriod(e.start,e.end);}
export function validateArtifact(a){
  keys(a,['schemaVersion','kind','storyId','title','description','selectedChapterIds','selectedTripIds','orderedScenes','visualTheme','cameraPreferences','includedMemories','privacySettings','provenanceSummary','places','trips','chapters','memories']);
  if(a.schemaVersion!==1||a.kind!=='OhMyTraceStory')throw new Error('不支持的分享作品版本');
  text(a.storyId,200);text(a.title,200);text(a.description,4000);
  if(!['atlas','night','paper'].includes(a.visualTheme))throw new Error('无效主题');
  keys(a.cameraPreferences,['motion','speed']);if(!['system','reduced'].includes(a.cameraPreferences.motion)||!Number.isFinite(a.cameraPreferences.speed)||a.cameraPreferences.speed<.25||a.cameraPreferences.speed>4)throw new Error('无效镜头设置');
  keys(a.privacySettings,['locationMode','includeNotes','includePhotos','coordinateRule']);const p=a.privacySettings;
  if(!['city','precise','hidden'].includes(p.locationMode)||typeof p.includeNotes!=='boolean'||typeof p.includePhotos!=='boolean'||p.coordinateRule!==COORDINATE_RULE)throw new Error('无效分享隐私规则');
  keys(a.provenanceSummary,['observed','inferred','manual','unknown','routeExplanation']);
  for(const k of ['observed','inferred','manual','unknown'])if(!Number.isSafeInteger(a.provenanceSummary[k])||a.provenanceSummary[k]<0)throw new Error('无效来源摘要');text(a.provenanceSummary.routeExplanation,500);
  const sets={};for(const name of ['places','trips','chapters','memories']){list(a[name],5000);ids(a[name].map(e=>e.id));sets[name]=new Set(a[name].map(e=>e.id));}
  const ref=(id,kind)=>{if(!sets[kind].has(id))throw new Error(`无效分享关系：${kind}`);};
  const refs=(values,kind)=>{ids(values);values.forEach(id=>ref(id,kind));};
  for(const place of a.places){
    keys(place,['id','name','coordinates','granularity']);text(place.name,200);
    if(!['city','precise','hidden'].includes(place.granularity)||p.locationMode==='hidden'&&place.granularity!=='hidden'||p.locationMode==='city'&&place.granularity==='precise')throw new Error('地点与隐私范围不一致');
    const c=place.coordinates;
    if(c!==null){keys(c,['latitude','longitude']);if(!Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||place.granularity==='hidden')throw new Error('无效分享坐标');
      if(place.granularity==='city'&&[c.latitude,c.longitude].some(n=>Math.abs(n*10-Math.round(n*10))>1e-8))throw new Error('模糊地点仍携带精确坐标');}
  }
  for(const t of a.trips){keys(t,['id','title','type','start','end','routeKind','stops']);text(t.title,200);text(t.type,200);validPeriod(t);if(!['observed','inferred','unknown'].includes(t.routeKind))throw new Error('无效路径证据');
    list(t.stops,10000);if(!t.stops.length)throw new Error('旅行缺少到访地点');for(const s of t.stops){keys(s,['placeId','start','end','note']);ref(s.placeId,'places');validPeriod(s);text(s.note,4000);if(!p.includeNotes&&s.note)throw new Error('备注未授权');}
    if(t.routeKind!=='unknown'&&t.stops.some(s=>!a.places.find(place=>place.id===s.placeId).coordinates))throw new Error('未知位置不能伪装成已知路线');}
  for(const c of a.chapters){keys(c,['id','title','type','start','end','homeAnchors','relatedTripIds']);text(c.title,200);text(c.type,200);validPeriod(c);refs(c.homeAnchors,'places');refs(c.relatedTripIds,'trips');}
  for(const m of a.memories){keys(m,['id','kind','title','start','end','placeIds','tripIds','text','image']);text(m.title,200);text(m.text,4000);validPeriod(m);refs(m.placeIds,'places');refs(m.tripIds,'trips');
    if(!['photo','note','video','other'].includes(m.kind)||m.kind==='photo'&&!p.includePhotos||m.text&&!p.includeNotes)throw new Error('记忆未授权');
    if(m.image!==null){if(m.kind!=='photo'||!p.includePhotos)throw new Error('照片未授权');validateImage(m.image);}}
  refs(a.selectedChapterIds,'chapters');refs(a.selectedTripIds,'trips');refs(a.includedMemories,'memories');
  if(a.selectedChapterIds.length!==a.chapters.length||a.selectedTripIds.length!==a.trips.length||a.includedMemories.length!==a.memories.length)throw new Error('作品包含未选择记录');
  list(a.orderedScenes,5000).forEach(s=>{validateScene(s);validPeriod(s);for(const [key,kind]of [['chapterId','chapters'],['tripId','trips'],['placeId','places'],['memoryId','memories']])if(s[key]!==null)ref(s[key],kind);});ids(a.orderedScenes.map(s=>s.id));
  if(!a.orderedScenes.length)throw new Error('作品至少需要一个镜头');
  if(a.memories.filter(m=>m.image).length>64)throw new Error('一份作品最多包含 64 张缩略图');
  if(new TextEncoder().encode(JSON.stringify(a)).length>24*1024*1024)throw new Error('作品超过 24 MiB 限制');
  return a;
}
export function parseArtifact(input){if(typeof input==='string'&&input.length>24*1024*1024)throw new Error('作品超过 24 MiB 限制');return validateArtifact(clone(typeof input==='string'?JSON.parse(input):input));}

// Thumbnail JPEGs must not contain EXIF, XMP, comments or device metadata.
export function cleanJPEG(bytes,{reject=false}={}){
  if(bytes[0]!==255||bytes[1]!==216)throw new Error('缩略图不是 JPEG');
  const out=[bytes.slice(0,2)];let i=2,dimensions=false,scan=false,seenScan=false;
  while(i<bytes.length){
    if(scan){
      const start=i;
      // Entropy-coded scans may contain FF00 escapes and restart markers. A real
      // marker ends the scan; inspect subsequent segments too (including between
      // progressive scans), rather than trusting everything after the first SOS.
      while(i<bytes.length){
        if(bytes[i]!==255){i++;continue;}
        const markerStart=i;while(bytes[i]===255)i++;
        const marker=bytes[i];
        if(marker===0||marker>=208&&marker<=215){i++;continue;}
        i=markerStart;break;
      }
      out.push(bytes.slice(start,i));scan=false;
    }
    const start=i;
    if(bytes[i++]!==255)throw new Error('JPEG 段无效');while(bytes[i]===255)i++;
    const marker=bytes[i++];
    if(marker===217){
      if(!dimensions||!seenScan||i!==bytes.length)throw new Error('JPEG 图像不完整或含尾随数据');
      out.push(bytes.slice(start,i));const result=new Uint8Array(out.reduce((n,b)=>n+b.length,0));let offset=0;
      for(const part of out){result.set(part,offset);offset+=part.length;}return result;
    }
    if(marker===undefined||marker<192||marker===216||marker>=208&&marker<=215)throw new Error('JPEG 段无效');
    const length=(bytes[i]<<8)|bytes[i+1];if(length<2||i+length>bytes.length)throw new Error('JPEG 段越界');
    if([192,193,194].includes(marker)){
      if(length<8||length!==8+3*bytes[i+7])throw new Error('JPEG 尺寸段无效');
      const height=(bytes[i+3]<<8)|bytes[i+4],width=(bytes[i+5]<<8)|bytes[i+6];if(!width||!height||width>1024||height>1024)throw new Error('缩略图尺寸超出限制');dimensions=true;
    }
    if(marker===218){if(!dimensions||length<8||length!==6+2*bytes[i+2])throw new Error('JPEG 扫描段无效');scan=true;seenScan=true;}
    if(marker>=225&&marker<=239||marker===254){if(reject)throw new Error('缩略图含多余元数据');}
    else out.push(bytes.slice(start,i+length));
    i+=length;
  }
  throw new Error('JPEG 缺少图像数据');
}
export function validateImage(image){
  text(image,360000);if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw new Error('只允许内嵌 JPEG 缩略图');
  const binary=atob(image.split(',')[1]);if(binary.length>256*1024)throw new Error('缩略图超过 256 KiB');cleanJPEG(Uint8Array.from(binary,c=>c.charCodeAt(0)),{reject:true});
}

// Stable, replaceable publishing boundary; JSON/ZIP exports remain independent.
export {StoryPublisher as Publisher} from './publishing/publisher.js';
