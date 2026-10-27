import {COLLECTIONS,clone,newId,dateBound,unknownDate,validateDataset} from './schema.js';

const collections={place:'places',trip:'trips',residence:'residences',chapter:'chapters'};
const entityCollections=COLLECTIONS.filter(k=>k!=='evidence');
const visitTypes={travel:'旅行','pass-through':'路过',transit:'转机',home:'现居地',past:'曾居地'};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=values=>[...new Set(values)];
function text(value){if(typeof value!=='string'||!value.trim()||value.trim().length>160)throw new Error('请填写 1–160 字的名称');return value.trim();}
function entity(data,kind,id){const collection=Object.hasOwn(collections,kind)&&collections[kind];const result=collection&&data[collection].find(e=>e.id===id);if(!result)throw new Error('这条记录不存在');return result;}
function period(items){
  const first=[...items].sort((a,b)=>(dateBound(a.start)??Infinity)-(dateBound(b.start)??Infinity))[0];
  const last=[...items].sort((a,b)=>(dateBound(b.end,true)??-Infinity)-(dateBound(a.end,true)??-Infinity))[0];
  return {start:items.some(e=>e.start.precision==='unknown')?unknownDate():clone(first.start),end:items.some(e=>e.end.precision==='unknown')?unknownDate():clone(last.end)};
}
function remap(ids,removed,target){return unique(ids.map(id=>removed.has(id)?target:id));}
function removeEmptyTrips(data){
  const empty=new Set(data.trips.filter(t=>!t.visitIds.length).map(t=>t.id));
  data.trips=data.trips.filter(t=>!empty.has(t.id));
  for(const c of data.chapters)c.relatedTripIds=c.relatedTripIds.filter(id=>!empty.has(id));
  for(const m of data.memories)m.tripIds=m.tripIds.filter(id=>!empty.has(id));
}
function rename(data,{target,name}){
  const e=entity(data,target?.kind,target?.id),value=text(name);
  if(target.kind!=='place'){e.title=value;if(target.kind==='trip')for(const v of data.visits)if(v.tripId===e.id)v.legacy.trip=value;return {id:e.id};}
  const previous=e.name;e.name=value;
  for(const v of data.visits)if(v.placeId===e.id&&v.legacy.place===previous)v.legacy.place=value;
  for(const r of data.residences)if(r.placeId===e.id&&r.title===previous)r.title=value;
  for(const m of data.memories)if(m.placeIds.includes(e.id)&&m.title?.startsWith(previous+' · '))m.title=value+m.title.slice(previous.length);
  return {id:e.id};
}
function classifyVisits(data,visits,value){
  const targets=[];
  for(const v of visits){
    v.legacy.type=visitTypes[value];
    const p=data.places.find(p=>p.id===v.placeId),residence=data.residences.find(r=>r.visitId===v.id);
    if(value==='home'||value==='past'){
      if(value==='home')v.end={precision:'ongoing',value:null};
      else if(v.end.precision==='ongoing')v.end=unknownDate();
      const dateText=d=>d.precision==='unknown'?'未知':d.precision==='ongoing'?'至今':d.value;
      v.legacy.date=dateText(v.start)+'~'+dateText(v.end);
      const previousTrip=v.tripId;
      if(previousTrip){data.trips.find(t=>t.id===previousTrip).visitIds=data.trips.find(t=>t.id===previousTrip).visitIds.filter(id=>id!==v.id);
        for(const m of data.memories)if(m.placeIds.includes(p.id))m.tripIds=m.tripIds.filter(id=>id!==previousTrip);}
      v.tripId=null;
      const r=residence||{id:newId('residence'),visitId:v.id,placeId:p.id,title:p.name,note:v.legacy.note,evidenceIds:[]};
      Object.assign(r,{kind:value,type:visitTypes[value],start:clone(v.start),end:clone(v.end)});
      if(!residence)data.residences.push(r);
      targets.push({kind:'residence',id:r.id});
    }else if(residence){
      data.residences=data.residences.filter(r=>r.id!==residence.id);
      const trip={id:newId('trip'),title:residence.title||p.name,type:visitTypes[value],visitType:value,start:clone(v.start),end:clone(v.end),visitIds:[v.id],evidenceIds:[]};
      data.trips.push(trip);v.tripId=trip.id;v.legacy.trip=trip.title;
      targets.push({kind:'trip',id:trip.id});
      for(const m of data.memories)if(m.placeIds.includes(p.id)&&(dateBound(m.start)??-Infinity)>=(dateBound(v.start)??-Infinity)&&(dateBound(m.end,true)??Infinity)<=(dateBound(v.end,true)??Infinity))m.tripIds=unique([...m.tripIds,trip.id]);
    }
  }
  removeEmptyTrips(data);
  return targets;
}
function classify(data,{target,value}){
  const e=entity(data,target?.kind,target?.id);
  if(target.kind==='chapter'){
    if(!['study','work','life','travel','other'].includes(value))throw new Error('请选择阶段类型');
    e.type=value;return {id:e.id};
  }
  if(!Object.hasOwn(visitTypes,value))throw new Error('请选择旅行、路过、转机或居住类型');
  if(target.kind==='place'){e.visitType=value;classifyVisits(data,data.visits.filter(v=>v.placeId===e.id),value);}
  else if(target.kind==='residence')return classifyVisits(data,[data.visits.find(v=>v.id===e.visitId)],value)[0]||{kind:'residence',id:e.id};
  else {
    if(['home','past'].includes(value)&&new Set(e.visitIds.map(id=>data.visits.find(v=>v.id===id).placeId)).size>1)throw new Error('请在具体城市卡片中确认居住，不能把多个城市改为一处居住');
    e.type=visitTypes[value];e.visitType=value;
    const converted=classifyVisits(data,e.visitIds.map(id=>data.visits.find(v=>v.id===id)),value);
    if(converted.length)return converted[0];
  }
  return {kind:target.kind,id:e.id};
}
function merge(data,{kind,ids,name}){
  if(!Array.isArray(ids)||ids.length<2||new Set(ids).size!==ids.length)throw new Error('请选择至少两条不同记录');
  const records=ids.map(id=>entity(data,kind,id)),target=records[0],removed=new Set(ids.slice(1));
  if(kind==='place'){
    const names=new Map(records.map(p=>[p.id,p.name]));
    target.mergedCityKeys=unique(records.flatMap(p=>[...(p.mergedCityKeys||[]),p.location?.photoCity?.key].filter(Boolean)).concat(data.memories.filter(m=>m.placeIds.some(id=>ids.includes(id))).map(m=>m.photoObservation?.city?.key).filter(Boolean)));
    for(const v of data.visits)if(removed.has(v.placeId)){v.placeId=target.id;v.legacy.place=target.name;}
    for(const r of data.residences)if(removed.has(r.placeId)){if(r.title===names.get(r.placeId))r.title=target.name;r.placeId=target.id;}
    for(const c of data.chapters)c.homeAnchors=remap(c.homeAnchors,removed,target.id);
    for(const m of data.memories)if(m.placeIds.some(id=>removed.has(id))){
      const old=m.placeIds.map(id=>names.get(id)).find(name=>name&&m.title?.startsWith(name+' · '));
      if(old)m.title=target.name+m.title.slice(old.length);m.placeIds=remap(m.placeIds,removed,target.id);
    }
    data.places=data.places.filter(p=>!removed.has(p.id));
  }else if(kind==='trip'){
    target.visitIds=unique(records.flatMap(t=>t.visitIds));Object.assign(target,period(records));
    for(const v of data.visits)if(ids.includes(v.tripId)){v.tripId=target.id;v.legacy.trip=target.title;}
    for(const c of data.chapters)c.relatedTripIds=remap(c.relatedTripIds,removed,target.id);
    for(const m of data.memories)m.tripIds=remap(m.tripIds,removed,target.id);
    data.trips=data.trips.filter(t=>!removed.has(t.id));
  }else if(kind==='chapter'){
    Object.assign(target,period(records));for(const field of ['homeAnchors','relatedTripIds','memoryIds'])target[field]=unique(records.flatMap(c=>c[field]));
    data.chapters=data.chapters.filter(c=>!removed.has(c.id));
  }else throw new Error('此类记录暂不支持合并，请在城市或旅程中整理');
  if(name!==undefined)rename(data,{target:{kind,id:target.id},name});
  return {id:target.id};
}
function split(data,{kind,id,visitIds,title}){
  if(kind!=='trip')throw new Error('请在旅程中选择要拆出的地点');
  const trip=entity(data,kind,id),selected=new Set(visitIds);
  if(!Array.isArray(visitIds)||!selected.size||selected.size!==visitIds.length||selected.size>=trip.visitIds.length||visitIds.some(id=>!trip.visitIds.includes(id)))throw new Error('请选择部分地点拆成另一段旅程，至少保留一个地点');
  const visits=visitIds.map(id=>data.visits.find(v=>v.id===id)),newTrip={...clone(trip),id:newId('trip'),title:text(title||trip.title+' · 第二段'),visitIds:[...visitIds],evidenceIds:[]};
  delete newTrip.autoTitle;Object.assign(newTrip,period(visits));trip.visitIds=trip.visitIds.filter(id=>!selected.has(id));Object.assign(trip,period(trip.visitIds.map(id=>data.visits.find(v=>v.id===id))));
  data.trips.push(newTrip);for(const v of visits){v.tripId=newTrip.id;v.legacy.trip=newTrip.title;}
  const movedPlaces=new Set(visits.map(v=>v.placeId)),keptPlaces=new Set(trip.visitIds.map(id=>data.visits.find(v=>v.id===id).placeId));
  for(const m of data.memories)if(m.tripIds.includes(id)&&m.placeIds.some(p=>movedPlaces.has(p))){
    // Ambiguous multi-place records stay associated with both parts.
    m.tripIds=unique([...m.tripIds.filter(t=>t!==id||m.placeIds.some(p=>keptPlaces.has(p))),newTrip.id]);
  }
  for(const c of data.chapters)if(c.relatedTripIds.includes(id))c.relatedTripIds.push(newTrip.id);
  return {id:newTrip.id};
}
function hide(data,{target}){const e=entity(data,target?.kind,target?.id);e.hidden=true;return {kind:target.kind,id:e.id};}
const operations={rename,classify,merge,split,delete:hide};
function changesBetween(before,after){
  return entityCollections.flatMap(collection=>{
    const previous=new Map(before[collection].map((value,index)=>[value.id,{value,index}])),next=new Map(after[collection].map((value,index)=>[value.id,{value,index}]));
    return unique([...previous.keys(),...next.keys()]).flatMap(id=>equal(previous.get(id)?.value,next.get(id)?.value)?[]:[{collection,id,before:clone(previous.get(id)||null),after:clone(next.get(id)||null)}]);
  });
}
function audit(change,side){
  const before=change.before?.value,after=change.after?.value,value=change[side]?.value;
  if(!value)return null;
  const fields=unique([...Object.keys(before||{}),...Object.keys(after||{})]).filter(k=>k!=='evidenceIds'&&!equal(before?.[k],after?.[k]));
  const result=Object.fromEntries(fields.map(k=>[k,clone(value[k]??null)]));
  if(change.collection==='visits')result.type=value.legacy.type;
  return result;
}
function evidence(data,record,action,changes){
  const id=newId('evidence'),at=new Date().toISOString();
  data.evidence.push({id,state:'manual',source:{kind:'user-correction',commandId:record.id,action,label:record.type},
    revisions:changes.map(c=>({at,entityId:c.id,collection:c.collection,before:audit(c,'before'),after:audit(c,'after')}))});
  return id;
}

/** Session undo history uses entity patches; database writes and their readback are owned by the repository. */
export class EditHistory {
  constructor(repository,{limit=30,byteBudget=8*1024*1024}={}){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('无效的撤销历史上限');
    if(!Number.isSafeInteger(byteBudget)||byteBudget<1)throw new Error('无效的撤销容量上限');
    this.repository=repository;this.limit=limit;this.byteBudget=byteBudget;this.undoStack=[];this.redoStack=[];this.queue=Promise.resolve();this.listeners=new Set();
  }
  status(){return {canUndo:!!this.undoStack.length,canRedo:!!this.redoStack.length,undoCount:this.undoStack.length,redoCount:this.redoStack.length};}
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  notify(){for(const listener of this.listeners)try{listener(this.status());}catch(error){console.error('Edit history subscriber failed',error);}}
  serialized(action){const run=this.queue.then(action);this.queue=run.catch(()=>{});return run;}
  execute(command){return this.serialized(async()=>{
    if(!command||!Object.hasOwn(operations,command.type))throw new Error('不支持的修改操作');
    let record,result;
    await this.repository.update(data=>{
      if(data.meta.origin==='demo')throw new Error('示例数据不能保存修改');
      const before=clone(data);result=operations[command.type](data,clone(command));validateDataset(data);
      const changed=changesBetween(before,data);if(!changed.length)return;
      record={id:newId('edit'),type:command.type,datasetId:data.id};
      const evidenceId=evidence(data,record,'apply',changed);
      const indices=Object.fromEntries(entityCollections.map(k=>[k,new Map(data[k].map(e=>[e.id,e]))]));
      for(const c of changed){const e=indices[c.collection].get(c.id);if(e)e.evidenceIds=unique([...e.evidenceIds,evidenceId]);}
      record.changes=changesBetween(before,data);validateDataset(data);
      record.bytes=JSON.stringify(record.changes).length*2;
    });
    if(record){
      this.undoStack.push(record);this.redoStack=[];
      let bytes=this.undoStack.reduce((total,r)=>total+r.bytes,0);
      // Always retain the newest correction, even if it alone exceeds the
      // estimated serialized budget; a large edit must still offer Undo.
      while(this.undoStack.length>1&&(this.undoStack.length>this.limit||bytes>this.byteBudget))bytes-=this.undoStack.shift().bytes;
      this.notify();
    }
    return result;
  });}
  undo(){return this.restore('undo');}
  redo(){return this.restore('redo');}
  restore(action){return this.serialized(async()=>{
    const stack=action==='undo'?this.undoStack:this.redoStack,other=action==='undo'?this.redoStack:this.undoStack,record=stack.at(-1);
    if(!record)return false;
    const from=action==='undo'?'after':'before',to=action==='undo'?'before':'after';
    await this.repository.update(data=>{
      if(data.id!==record.datasetId)throw new Error('数据集已恢复或替换，不能撤销之前的修改');
      if(data.meta.origin==='demo')throw new Error('示例数据不能保存修改');
      // Check every affected entity before changing any; unrelated new records remain intact.
      const indices=Object.fromEntries(entityCollections.map(k=>[k,new Map(data[k].map(e=>[e.id,e]))]));
      for(const c of record.changes)if(!equal(indices[c.collection].get(c.id)||null,c[from]?.value||null))throw new Error('这条记录后来已变化，不能覆盖新的修改');
      for(const collection of entityCollections){
        const changes=record.changes.filter(c=>c.collection===collection),ids=new Set(changes.map(c=>c.id));
        data[collection]=data[collection].filter(e=>!ids.has(e.id));
        for(const c of changes.filter(c=>c[to]).sort((a,b)=>a[to].index-b[to].index))data[collection].splice(c[to].index,0,clone(c[to].value));
      }
      evidence(data,record,action,record.changes.map(c=>({...c,before:c[from],after:c[to]})));validateDataset(data);
    });
    stack.pop();other.push(record);this.notify();return true;
  });}
}

/** A conservative display of provenance: missing evidence remains explicitly unknown. */
export function sourceSummary(data,entity){
  const sources=(entity?.evidenceIds||[]).map(id=>data.evidence.find(e=>e.id===id)).filter(Boolean);
  if(sources.some(e=>e.state==='manual'))return {state:'manual',label:'人工',detail:'你已修改或确认这条记录；重新整理会保留人工决定。'};
  if(entity?.kind==='photo'&&entity.photoObservation)return {state:'observed',label:'照片观测',detail:'来自照片记录的拍摄地点与时间，原图仍在相册。'};
  if(sources.some(e=>e.state==='inferred')){
    const photos=data.memories.filter(m=>m.kind==='photo'&&(m.tripIds.includes(entity.id)||m.placeIds.includes(entity.placeId||entity.id)));
    const days=new Set(photos.filter(m=>m.start.precision==='day').map(m=>m.start.value));
    return {state:'inferred',label:'推断',detail:photos.length?String(photos.length)+' 张照片 · '+String(days.size)+' 个拍照日；按已有观测推断，可在“不对？”里修改。':'根据已有记录推断，可在“不对？”里修改。'};
  }
  const observed=sources.filter(e=>e.state==='observed');
  if(observed.length)return {state:'observed',label:observed.some(e=>/photo|exif/.test(e.source?.kind||''))?'照片观测':'记录观测',detail:'来自已导入的记录；地点之间的连接不代表实测轨迹。'};
  return {state:'unknown',label:'来源待确认',detail:'尚无可核对的来源，不能视为已经确认的经历。'};
}
