import {AUTO_VERSION,applyAutoImport,nameCells,normalizeObservation,autoImportOutdated,savedPhotoObservations,placeRenames,applyPlaceRenames} from '../life/media/auto-import.js';
import {addEvidence,partialDate,newId} from '../life/schema.js';
/** File-picker equivalent of the Android one-tap path. The old review editor is advanced only. */
export class WebAutoImport {
 constructor(service){this.service=service;this.repository=service.repository;this.geonames=service.geonames;this.running=false;this.controller=null;}
 cancel(){this.controller?.abort();this.service.scanner.cancel();}
 hasImported(){return this.repository.getDataset().memories.some(m=>m.kind==='photo');}
 hasLegacy(){return false;}
 outdated(){return autoImportOutdated(this.repository.getDataset());}
 async localize(){if(this.running)return;const renames=await placeRenames(this.repository.getDataset(),this.geonames);if(renames.size)await this.repository.update(d=>applyPlaceRenames(d,renames));}
 async regroup({onProgress=()=>{}}={}){if(this.running)throw new Error('正在导入');this.running=true;this.controller=new AbortController();try{const d=this.repository.getDataset(),rows=savedPhotoObservations(d),names=await nameCells(rows.map(normalizeObservation),this.geonames,{signal:this.controller.signal});let result;await this.repository.update(data=>{if(data.revision!==d.revision)throw new Error('记录已变化，请重新整理');result=applyAutoImport(data,rows,names,{force:true});});return {...result,regrouped:true,scanned:rows.length};}finally{this.running=false;this.controller=null;}}
 async run({files,resumeBatchId=null,onProgress=()=>{}}={}){
  if(this.running)throw new Error('正在导入');if(this.service.readOnly)throw new Error('示例不能保存照片');
  this.running=true;this.controller=new AbortController();const {signal}=this.controller;
  try{
   const batch=await this.service.scanner.scan(files,{resumeBatchId,automatic:true,onProgress:p=>onProgress({phase:'reading',scanned:p.processed,total:p.total,points:p.asset?.coordinates?[p.asset.coordinates]:[]})});
   if(batch.status==='cancelled')throw new DOMException('已取消','AbortError');signal.throwIfAborted();
   const assets=await this.service.assetsFor(batch),rows=assets.filter(a=>a.processingStatus==='analyzed'&&a.coordinates&&a.extractedTime).map(a=>({uri:'media:'+a.assetId,title:a.originalFile.name,...a.coordinates,local:a.extractedTime.localDateTime,offsetMinutes:a.extractedTime.offsetMinutes,takenMs:a.extractedTime.utcEpochMs}));
   const previous=this.repository.getDataset(),known=new Set(previous.memories.map(m=>m.uri)),outdated=this.outdated(),fresh=rows.filter(r=>!known.has(r.uri));
   onProgress({phase:'placing',scanned:batch.processed,total:batch.total});
   const names=await nameCells((outdated?[...savedPhotoObservations(previous),...fresh]:fresh).map(normalizeObservation).filter(Boolean),this.geonames,{signal});signal.throwIfAborted();
   await this.service.manifest.putBatch({...batch,automatic:true,status:'prepared',commitState:'prepared'});
   let summary={photos:0,newTrips:0,newPlaces:0,tripIds:[],latestTripId:null};
   const additions=assets.filter(a=>a.processingStatus==='analyzed'&&a.deduplicationKey&&!known.has('media:'+a.assetId));
   if(additions.length||outdated)await this.repository.update(d=>{
    summary=applyAutoImport(d,fresh,names,{force:outdated});
    const [evidence]=addEvidence(d,'observed',{kind:'photo-auto-import',version:AUTO_VERSION,batchId:batch.id,method:'file-extraction'}),byURI=new Map(d.memories.map(m=>[m.uri,m]));
    for(const a of additions){const uri='media:'+a.assetId;let m=byURI.get(uri);
     // Keep unnamed/no-GPS pointers without fabricating a city, date or journey.
     if(!m){const start=partialDate(a.extractedTime?.localDateTime?.slice(0,10)||'');m={id:newId('memory_photo'),kind:'photo',title:a.originalFile.name,uri,start,end:{...start},placeIds:[],tripIds:[],evidenceIds:[]};d.memories.push(m);}
     m.evidenceIds.push(evidence);
    }
   });
   const current=this.repository.getDataset(),assetURIs=new Set(assets.map(a=>'media:'+a.assetId)),links=Object.fromEntries(current.memories.filter(m=>assetURIs.has(m.uri)).map(m=>[m.uri.slice(6),m.id]));
   let warning=null;try{await this.service.manifest.acknowledge(batch.id,links);}catch{warning='照片记录已保存；媒体索引将在下次打开时修复。';}
   let thumbnailWarnings=[];if(this.service.thumbnails){onProgress({phase:'previews',scanned:batch.processed,total:batch.total});thumbnailWarnings=await this.service.retainThumbnails(Object.keys(links),{signal,onProgress:p=>onProgress({phase:'previews',scanned:p.processed,total:p.total})});}
   const linkedIds=new Set(Object.values(links));return {...summary,photos:additions.length,scanned:batch.processed,unlocated:current.memories.filter(m=>linkedIds.has(m.id)&&!m.placeIds.length).length,warning,thumbnailWarnings};
  }finally{this.running=false;this.controller=null;}
 }
}
