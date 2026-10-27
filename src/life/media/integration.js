import {ThumbnailStore} from './thumbnail-store.js';
import {ThumbnailGenerator} from './thumbnail.js';
import {LibraryBackup} from './library-backup.js';
import {geoNameProvider} from '../geocoding/provider.js';
import {clone,COLLECTIONS,partialDate,unknownDate,validateDataset,addEvidence,manualEvidence} from '../schema.js';
import {MediaManifest,validateManifest} from './manifest.js';import {PhotoScanner} from './scanner.js';
import {reconstructPhotos,distanceKm} from './reconstruction.js';import {RECONSTRUCTION_RULES} from './config.js';

export function photoBase(data){const next=clone(data);if(next.meta.origin==='demo')for(const key of COLLECTIONS)next[key]=[];next.meta.origin='user';return next;}
const coverageDate=(a,b)=>a?(a===b||!b?a:`${a}~${b}`):'';
const uriFor=id=>`media:${id}`;
function observedEvidence(data,asset,batchId,known){
  const id=`evidence_photo_${asset.deduplicationKey}`;if(!known.has(id)){known.add(id);data.evidence.push({id,state:asset.metadataStatus==='parsed'?'observed':'unknown',source:{kind:'photo-exif',assetId:asset.assetId,batchId,format:asset.format||'jpeg',originalFile:clone(asset.originalFile),coordinateReferenceSystem:'WGS84',metadataSources:clone(asset.metadataSources||['exif']),xmpTags:clone(asset.xmpTags||{}),mediaCreatedTime:clone(asset.mediaCreatedTime||null),gpsTime:clone(asset.gpsTime||null),extractedTime:clone(asset.extractedTime),coordinates:clone(asset.coordinates),altitude:clone(asset.altitude??null),orientation:asset.orientation??null,rawTags:clone(asset.rawTags||{}),diagnostics:clone(asset.diagnostics)},revisions:[]});}return id;
}
function assertReview(review,assetMap,data){
  if(review?.version!==1||!Array.isArray(review.candidates)||!Array.isArray(review.manualRevisions)||!Array.isArray(review.unlocatedAssetIds))throw new Error('审核草稿格式无效');
  if(review.baseDatasetId!==data.id)throw new Error('人生数据已被另一份备份替换，请重新生成候选');
  const assigned=new Set();
  for(const c of review.candidates){
    if(!['create','link','memory'].includes(c.action)||typeof c.title!=='string'||!c.title.trim()||!Array.isArray(c.visits)||!c.visits.length||!Array.isArray(c.chapterIds))throw new Error('候选信息不完整');
    if(c.excluded)continue;
    if(c.action==='link'&&!data.trips.some(t=>t.id===c.relatedTripId))throw new Error('请选择有效的已有旅行');
    if(c.chapterIds.some(id=>!data.chapters.some(ch=>ch.id===id)))throw new Error('关联的人生阶段已不存在');
    partialDate(c.start||'');partialDate(c.end||'',{end:true});
    for(const v of c.visits){
      if(typeof v.placeName!=='string'||!v.placeName.trim()||!Array.isArray(v.assetIds)||!v.assetIds.length)throw new Error('候选地点信息无效');
      if(v.placeId&&!data.places.some(p=>p.id===v.placeId))throw new Error('候选引用的地点已不存在，请重新生成候选');
      for(const id of v.assetIds){const asset=assetMap.get(id);if(!asset||asset.processingStatus!=='analyzed'||!asset.coordinates||!asset.deduplicationKey)throw new Error('候选缺少有效的照片 GPS 证据');if(assigned.has(id))throw new Error('同一照片不能出现在多个候选');assigned.add(id);}
      // Coordinates are immutable extraction evidence; review may rename or group
      // observations, not silently rewrite raw GPS through a restored review JSON.
      const first=assetMap.get(v.assetIds[0]);if(JSON.stringify(v.coordinates)!==JSON.stringify(first.coordinates))throw new Error('候选 GPS 与原始照片证据不一致');
      const days=v.assetIds.map(id=>assetMap.get(id).extractedTime?.localDateTime?.slice(0,10)).filter(Boolean).sort();
      if(v.observedStart!==(days[0]||null)||v.observedEnd!==(days.at(-1)||null))throw new Error('照片观测日期与原始证据不一致；实际旅行起止请使用人工日期字段');
    }
  }
  for(const id of review.unlocatedAssetIds){const a=assetMap.get(id);if(!a||a.coordinates||a.processingStatus!=='analyzed'||!a.deduplicationKey)throw new Error('未定位照片关系无效');}
}

export function buildPhotoPlan(input,assets,review,{batchId='preview'}={}) {
  const data=photoBase(input),assetMap=new Map(assets.map(a=>[a.assetId,a]));assertReview(review,assetMap,data);
  const original={places:data.places.length,visits:data.visits.length,trips:data.trips.length,memories:data.memories.length};
  const byUri=new Map(data.memories.map(m=>[m.uri,m])),links={},existingTripIds=new Set(data.trips.map(t=>t.id)),existingVisitIds=new Set(data.visits.map(v=>v.id)),matchedVisitIds=new Set();
  const modifications=[],chapterAssociations=[],knownEvidence=new Set(data.evidence.map(e=>e.id));let reviewEvidenceId=null;
  const reviewEvidence=()=>{
    if(!reviewEvidenceId){const source={kind:'photo-review',batchId,reviewVersion:1,manualChanges:clone(review.manualRevisions)};
      reviewEvidenceId=manualEvidence(data,source,null,{confirmedCandidateIds:review.candidates.filter(c=>!c.excluded).map(c=>c.id),includeUnlocated:review.includeUnlocated})[0];}
    return reviewEvidenceId;
  };
  function addMemory(asset,place,trip,visit){
    const uri=uriFor(asset.assetId);if(byUri.has(uri)){links[asset.assetId]=byUri.get(uri).id;return byUri.get(uri);}
    const evidence=observedEvidence(data,asset,batchId,knownEvidence),day=asset.extractedTime?.localDateTime?.slice(0,10),memory={id:`memory_photo_${asset.deduplicationKey}`,kind:'photo',title:asset.originalFile.name,uri,
      start:partialDate(day||''),end:partialDate(day||''),placeIds:place?[place.id]:[],tripIds:trip?[trip.id]:[],evidenceIds:[evidence,reviewEvidence()]};
    data.memories.push(memory);byUri.set(uri,memory);links[asset.assetId]=memory.id;
    if(visit&&!visit.evidenceIds.includes(evidence))visit.evidenceIds.push(evidence);
    return memory;
  }
  for(const c of review.candidates.filter(c=>!c.excluded)){
    const ids=c.visits.flatMap(v=>v.assetIds),fresh=ids.filter(id=>!byUri.has(uriFor(id)));
    let trip=c.action==='link'?data.trips.find(t=>t.id===c.relatedTripId):null;
    if(!fresh.length&&!trip)trip=ids.flatMap(id=>byUri.get(uriFor(id))?.tripIds||[]).map(id=>data.trips.find(t=>t.id===id)).find(Boolean)||null;
    if(fresh.length&&c.action==='create'){
      const starts=c.visits.map(v=>v.observedStart).filter(Boolean).sort(),ends=c.visits.map(v=>v.observedEnd).filter(Boolean).sort();
      const inference=addEvidence(data,'inferred',{kind:'photo-reconstruction',batchId,rules:clone(review.rules),observedStart:starts[0]||null,observedEnd:ends.at(-1)||null,arrival:'unknown',departure:'unknown',transport:'unknown',connection:'inferred'});
      trip={id:c.proposedTripId,title:c.title.trim(),type:'照片旅行',start:partialDate(c.start||''),end:partialDate(c.end||'',{end:true}),visitIds:[],evidenceIds:[...inference,reviewEvidence()]};data.trips.push(trip);
    }
    for(const v of c.visits){
      const newAssets=v.assetIds.map(id=>assetMap.get(id)).filter(a=>!byUri.has(uriFor(a.assetId)));
      if(!newAssets.length){for(const id of v.assetIds){const m=byUri.get(uriFor(id));if(m)links[id]=m.id;}continue;}
      let place=v.placeId?data.places.find(p=>p.id===v.placeId):data.places.find(p=>p.coordinates&&distanceKm(p.coordinates,v.coordinates)<=RECONSTRUCTION_RULES.existingPlaceRadiusKm);
      if(!place){place={id:v.proposedPlaceId,name:v.placeName.trim(),coordinates:clone(v.coordinates),location:{status:'confirmed',label:'照片 GPS · 用户确认关联'},evidenceIds:[observedEvidence(data,newAssets[0],batchId,knownEvidence),...(v.geoName?addEvidence(data,'inferred',{kind:'photo-place-name',...clone(v.geoName)}):[]),reviewEvidence()]};data.places.push(place);}
      let visit=null;
      if(trip){
        const available=prior=>existingVisitIds.has(prior.id)&&!matchedVisitIds.has(prior.id)&&prior.tripId===trip.id&&prior.placeId===place.id;
        visit=data.visits.find(prior=>available(prior)&&prior.start.value===v.observedStart&&prior.end.value===v.observedEnd);
        if(!visit&&existingTripIds.has(trip.id))visit=data.visits.find(prior=>available(prior)&&v.observedStart&&prior.start.value&&prior.end.value&&prior.start.value<=v.observedStart&&v.observedEnd<=prior.end.value);
        if(visit)matchedVisitIds.add(visit.id);
        if(!visit){visit={id:v.proposedVisitId,placeId:place.id,tripId:trip.id,start:partialDate(v.observedStart||''),end:partialDate(v.observedEnd||''),legacy:{date:coverageDate(v.observedStart,v.observedEnd),trip:trip.title,place:place.name,type:trip.type,note:'照片观测时段；到达和离开时间未知；地点间为推测连接'},evidenceIds:[...addEvidence(data,'inferred',{kind:'photo-visit',batchId,arrival:'unknown',departure:'unknown',arrivalWindow:clone(v.arrivalWindow||null),departureWindow:clone(v.departureWindow||null),connection:'inferred'}),reviewEvidence()]};data.visits.push(visit);trip.visitIds.push(visit.id);if(existingTripIds.has(trip.id))modifications.push({tripId:trip.id,title:trip.title,addedVisitId:visit.id,preserveExistingFields:true});}
      }
      for(const asset of newAssets)addMemory(asset,place,trip,visit);
    }
    if(trip)for(const id of c.chapterIds){const chapter=data.chapters.find(ch=>ch.id===id),memories=ids.map(id=>byUri.get(uriFor(id))).filter(Boolean);
      const before={relatedTripIds:clone(chapter.relatedTripIds),memoryIds:clone(chapter.memoryIds)};
      chapter.relatedTripIds=[...new Set([...chapter.relatedTripIds,trip.id])];chapter.memoryIds=[...new Set([...chapter.memoryIds,...memories.map(m=>m.id)])];
      if(JSON.stringify(before)!==JSON.stringify({relatedTripIds:chapter.relatedTripIds,memoryIds:chapter.memoryIds})){chapter.evidenceIds.push(reviewEvidence());chapterAssociations.push({chapterId:id,title:chapter.title,tripId:trip.id});}
    }
  }
  if(review.includeUnlocated)for(const id of review.unlocatedAssetIds)addMemory(assetMap.get(id),null,null,null);
  validateDataset(data);
  const summary={createPlaces:data.places.length-original.places,createVisits:data.visits.length-original.visits,createTrips:data.trips.length-original.trips,createdTripIds:data.trips.slice(original.trips).map(t=>t.id),createMemories:data.memories.length-original.memories,
    existingTripAdditions:modifications,chapterAssociations,unlocatedMemories:review.includeUnlocated?(uris=>review.unlocatedAssetIds.filter(id=>!uris.has(uriFor(id))).length)(new Set(input.memories.map(m=>m.uri))):0,
    preservedExistingPlaceNames:review.candidates.flatMap(c=>c.visits.filter(v=>v.placeId&&data.places.find(p=>p.id===v.placeId)?.name!==v.placeName).map(v=>({requested:v.placeName,preserved:data.places.find(p=>p.id===v.placeId)?.name}))),
    candidateChanges:review.candidates.filter(c=>!c.excluded).map(c=>({title:c.title,action:c.action,existingTripId:c.relatedTripId,actualStart:c.start||'unknown',actualEnd:c.end||'unknown',transport:'unknown',connection:'inferred',observedPlaces:c.visits.map(v=>({name:v.placeName,coordinates:v.coordinates,start:v.observedStart,end:v.observedEnd,photos:v.assetIds.length}))}))};
  return {dataset:data,links,summary,changed:summary.createMemories>0||chapterAssociations.length>0};
}
const signature=async review=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(review))))].map(v=>v.toString(16).padStart(2,'0')).join('');

export class PhotoHistoryService {
  constructor(repository,{manifest=new MediaManifest(),scanner=null,readOnly=false,geonames=geoNameProvider,thumbnails=null,thumbnailGenerator=null}={}){this.geonames=geonames;this.repository=repository;this.manifest=manifest;this.scanner=scanner||new PhotoScanner(manifest);this.readOnly=readOnly;this.thumbnails=thumbnails||(globalThis.indexedDB?new ThumbnailStore():null);this.thumbnailGenerator=thumbnailGenerator||new ThumbnailGenerator();this.backups=this.thumbnails?new LibraryBackup({repository,manifest,thumbnails:this.thumbnails}):null;}
  async assetsFor(batch){const assets=await this.manifest.listAssets(),ids=new Set(batch.assetIds);return assets.filter(a=>ids.has(a.assetId));}
  async createReview(batchId,{onProgress=()=>{},namingTimeoutMs=1500,namingBudgetMs=8000,namingConcurrency=4}={}){
    const batch=await this.manifest.getBatch(batchId);if(!batch)throw new Error('导入批次不存在');
    onProgress({phase:'grouping',processed:0,total:batch.assetIds.length});await new Promise(r=>setTimeout(r,0));
    const current=this.repository.getDataset(),review=reconstructPhotos(await this.assetsFor(batch),photoBase(current));
    review.baseWasEphemeral=current.revision===0&&['new','demo'].includes(current.meta.origin);
    // Coordinates/grouping are durable before optional static name-pack I/O.
    await this.saveReview(batchId,review);
    const groups=new Map();for(const c of review.candidates)for(const v of c.visits){if(v.placeId)continue;const key=JSON.stringify(v.coordinates);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(v);}
    const queue=[...groups.values()],total=queue.reduce((n,g)=>n+g.length,0),deadline=performance.now()+namingBudgetMs;
    let next=0,processed=0;onProgress({phase:'naming',processed,total});
    const worker=async()=>{let lastYield=performance.now();while(next<queue.length){const visits=queue[next++];let name=null,diagnostic=null;
      const remaining=deadline-performance.now();
      if(remaining<=0)diagnostic='OFFLINE_NAMES_TIMEOUT';
      else{let timer;try{name=await Promise.race([Promise.resolve().then(()=>this.geonames.reverse(visits[0].coordinates)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('OFFLINE_NAMES_TIMEOUT')),Math.min(namingTimeoutMs,remaining));})]);}
        catch(error){diagnostic=error.message==='OFFLINE_NAMES_TIMEOUT'?error.message:'OFFLINE_NAMES_UNAVAILABLE';}finally{clearTimeout(timer);}}
      for(const visit of visits){if(name){visit.geoName=name;visit.placeName=name.displayName;}else if(diagnostic)visit.namingDiagnostic=diagnostic;}
      processed+=visits.length;onProgress({phase:'naming',processed,total});
      if(performance.now()-lastYield>8){await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}
    }};
    await Promise.all(Array.from({length:Math.min(queue.length,Math.max(1,namingConcurrency))},worker));
    onProgress({phase:'saving-review',processed,total});await this.saveReview(batchId,review);onProgress({phase:'ready',processed,total});return review;
  }
  async saveReview(batchId,review){const batch=await this.manifest.getBatch(batchId);if(!batch)throw new Error('导入批次不存在');await this.manifest.putBatch({...batch,review:clone(review)});}
  async preview(batchId){const batch=await this.manifest.getBatch(batchId);if(!batch?.review)throw new Error('请先生成并审核候选');const data=this.repository.getDataset();
    // A never-persisted empty/demo dataset gets a fresh ID on reload. Rebase only
    // this explicitly ephemeral draft; a replaced real dataset still requires review.
    if(batch.review.baseDatasetId!==data.id&&batch.review.baseWasEphemeral&&data.revision===0&&['new','demo'].includes(data.meta.origin)){batch.review.baseDatasetId=data.id;await this.saveReview(batchId,batch.review);}
    const plan=buildPhotoPlan(data,await this.assetsFor(batch),batch.review,{batchId});return {batchId,baseRevision:data.revision,signature:await signature(batch.review),summary:plan.summary};}
  async commit(batchId,preview,{onThumbnailProgress=()=>{}}={}){
    if(this.backups&&await this.thumbnails.getJournal())throw new Error('统一备份恢复尚未完成，请刷新后修复再导入');
    if(this.readOnly)throw new Error('景观演示不能保存照片历史，请返回首页');
    if(this.scanner.running)throw new Error('请等待扫描结束或取消扫描');
    const batch=await this.manifest.getBatch(batchId);
    if(!batch?.review||preview?.batchId!==batchId||preview.signature!==await signature(batch.review))throw new Error('审核内容已变化，请重新预览');
    if(this.repository.getDataset().revision!==preview.baseRevision)throw new Error('人生数据已变化，请重新预览再确认');
    const assets=await this.assetsFor(batch);let plan=buildPhotoPlan(this.repository.getDataset(),assets,batch.review,{batchId});
    // Prepare the durable intent first. Separate databases cannot share a
    // transaction: authoritative Memory URIs make post-commit recovery idempotent.
    await this.manifest.putBatch({...batch,status:'prepared',commitState:'prepared',preparedRevision:preview.baseRevision});
    let thumbnailWarnings=[];if(batch.review.retainThumbnails&&this.thumbnails){thumbnailWarnings=await this.retainThumbnails(Object.keys(plan.links),{onProgress:onThumbnailProgress});}
    if(plan.changed)await this.repository.update(d=>{
      if(d.revision!==preview.baseRevision)throw new Error('人生数据已变化，请重新预览再确认');
      plan=buildPhotoPlan(d,assets,batch.review,{batchId});Object.assign(d,plan.dataset);
    });
    let warning=null;try{await this.manifest.acknowledge(batchId,plan.links);}catch(error){warning=`人生数据已保存，媒体索引确认未完成；刷新后可修复：${error.message}`;}
    if(thumbnailWarnings.length)warning=[warning,`照片记忆已保存；${thumbnailWarnings.length} 张未能生成或保留缩略图，请查看照片诊断。`].filter(Boolean).join(' ');
    return {thumbnailWarnings,createdMemories:plan.summary.createMemories,summary:plan.summary,links:plan.links,warning,tripId:plan.summary.createdTripIds[0]||batch.review.candidates.find(c=>!c.excluded&&c.action==='link')?.relatedTripId||null};
  }
  async retainThumbnails(ids,{onProgress=()=>{},signal}={}){
    const warnings=[];let capacity=false,done=0;
    for(const id of ids){if(signal?.aborted)break;const asset=await this.manifest.getAsset(id);if(!asset)continue;
      try{let retained=null;try{retained=await this.thumbnails.read(id);}catch{/* Reselecting an original can replace a broken retained resource. */}if(retained){onProgress({processed:++done,total:ids.length});continue;}if(capacity)throw new Error('THUMBNAIL_CAPACITY_LIMIT');const file=this.scanner.fileFor(id);if(!file)throw new Error('THUMBNAIL_RESELECT_REQUIRED');
        const blob=await this.thumbnailGenerator.create(file,{dimensions:asset.dimensions,orientation:asset.orientation});const reference=await this.thumbnails.put(id,blob);await this.manifest.updateAsset(id,{thumbnailReference:reference,thumbnailStatus:'saved'});
      }catch(error){const code=/CAPACITY_LIMIT/.test(error.message)?'THUMBNAIL_CAPACITY_LIMIT':error.message==='THUMBNAIL_RESELECT_REQUIRED'?error.message:'THUMBNAIL_UNAVAILABLE';if(code==='THUMBNAIL_CAPACITY_LIMIT')capacity=true;warnings.push({assetId:id,code});await this.manifest.updateAsset(id,{thumbnailStatus:code,diagnostics:[...new Set([...asset.diagnostics,code])]});}
      onProgress({processed:++done,total:ids.length});
    }this.thumbnailGenerator.close();return warnings;
  }
  async recover(){
    if(this.backups)await this.backups.recover();
    const data=this.repository.getDataset(),links=Object.fromEntries(data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('media:')).map(m=>[m.uri.slice(6),m.id]));
    for(const batch of await this.manifest.listBatches()){
      if(batch.status==='scanning')await this.manifest.putBatch({...batch,status:'interrupted',error:'页面关闭中断；重新选择原文件可续扫'});
      if(batch.commitState==='prepared'){
        const ids=batch.assetIds.filter(id=>links[id]);
        const committed=data.evidence.some(e=>['photo-review','photo-auto-import'].includes(e.source?.kind)&&e.source.batchId===batch.id);
        if(committed||ids.length===batch.assetIds.length)await this.manifest.acknowledge(batch.id,Object.fromEntries(ids.map(id=>[id,links[id]])));
      }
    }
  }
  async restoreManifest(input){if(this.scanner.running)throw new Error('请先停止扫描');validateManifest(input);input=clone(input);const ids=new Set(input.assets.map(a=>a.assetId));if(this.repository.getDataset().memories.some(m=>m.kind==='photo'&&m.uri?.startsWith('media:')&&!ids.has(m.uri.slice(6))))throw new Error('此媒体索引缺少现有照片记忆引用，未替换本地索引；请使用对应的统一备份');for(const asset of input.assets)if(asset.thumbnailReference){let retained=null;try{retained=await this.thumbnails?.read(asset.assetId);}catch{/* A metadata-only backup cannot restore a missing Blob. */}if(!retained){asset.thumbnailReference=null;asset.thumbnailStatus='THUMBNAIL_RESELECT_REQUIRED';asset.diagnostics=[...new Set([...asset.diagnostics,'THUMBNAIL_RESELECT_REQUIRED'])];}}await this.manifest.restore(input);await this.recover();}
}
