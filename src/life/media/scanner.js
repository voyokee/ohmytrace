import {MEDIA_LIMITS} from './config.js';
import {analyzePhotoFile} from './exif.js';
import {newId} from '../schema.js';

export class PhotoScanner {
  constructor(manifest,{limits=MEDIA_LIMITS,workerFactory=globalThis.Worker?()=>new Worker(new URL('./scan-worker.js',import.meta.url),{type:'module'}):null,analyze=analyzePhotoFile}={}){
    this.manifest=manifest;this.limits=limits;this.workerFactory=workerFactory;this.analyze=analyze;this.running=false;this.files=new Map();this.worker=null;
  }
  cancel(){this.cancelled=true;this.worker?.terminate();this.pendingReject?.(new Error('SCAN_CANCELLED'));this.pendingReject=null;}
  async extract(file){
    if(!this.worker)return this.analyze(file,{limits:this.limits});
    return new Promise((resolve,reject)=>{
      this.pendingReject=reject;const id=newId('job');
      this.worker.onmessage=event=>{if(event.data.id!==id)return;this.pendingReject=null;event.data.error?reject(new Error(event.data.error)):resolve(event.data.asset);};
      this.worker.onerror=event=>{this.pendingReject=null;reject(new Error(event.message||'照片处理 Worker 失败'));};
      this.worker.postMessage({id,file,limits:this.limits});
    });
  }
  async scan(input,{onProgress=()=>{},resumeBatchId=null}={}) {
    if(this.running)throw new Error('已有照片扫描正在运行');
    const files=Array.from(input);if(!files.length||files.length>this.limits.maxFiles)throw new Error(`每批请选择 1–${this.limits.maxFiles} 张照片`);
    this.running=true;this.cancelled=false;let batch,chunk=[];
    const started=performance.now();let firstResultMs=null,peakBufferEstimateBytes=0;
    try {
      batch=resumeBatchId?await this.manifest.getBatch(resumeBatchId):await this.manifest.createBatch(files);
      if(!batch||batch.total!==files.length||batch.filePlan.some((p,i)=>p.name!==files[i].name||p.size!==files[i].size||p.lastModified!==(files[i].lastModified??null)))throw new Error('恢复扫描需重新选择原批次的文件，顺序、名称、大小和修改时间须匹配');
      if(batch.status==='committed')throw new Error('这个批次已确认；可重新选择以补充或查看');
      batch.status='scanning';await this.manifest.putBatch(batch);
      if(this.workerFactory)this.worker=this.workerFactory();
      const known=new Set((await this.manifest.listAssets()).map(a=>a.assetId));
      for(let i=batch.processed;i<files.length;i++) {
        if(this.cancelled)break;const file=files[i];let asset;
        peakBufferEstimateBytes=Math.max(peakBufferEstimateBytes,Math.min(file.size,this.limits.maxFileBytes)*2+65536);
        try{asset=await this.extract(file);}catch(error){
          if(this.cancelled)break;
          asset={assetId:newId('diagnostic'),deduplicationKey:null,originalFile:{name:file.name,type:file.type,size:file.size,lastModified:file.lastModified??null},processingStatus:'error',metadataStatus:'error',extractedTime:null,coordinates:null,metadataEvidence:{state:'unknown',source:{kind:'file-diagnostic',reason:error.message}},diagnostics:[error.message],linkedMemoryId:null,thumbnailReference:null};
        }
        if(this.cancelled)break;
        if(firstResultMs===null)firstResultMs=performance.now()-started;
        if(known.has(asset.assetId))batch.duplicateCount++;known.add(asset.assetId);
        this.files.set(asset.assetId,file);chunk.push(asset);
        batch.assetIds=[...new Set([...batch.assetIds,asset.assetId])];batch.processed=i+1;
        if(['error','unsupported','oversize'].includes(asset.processingStatus))batch.failureCount++;
        if(chunk.length>=this.limits.flushEvery||i===files.length-1){await this.manifest.saveChunk(batch,chunk);chunk=[];}
        onProgress({processed:batch.processed,total:batch.total,asset,duplicateCount:batch.duplicateCount,failureCount:batch.failureCount});
        if(!this.worker)await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(chunk.length)await this.manifest.saveChunk(batch,chunk);
      batch.status=this.cancelled?'cancelled':'review';
      batch.metrics={elapsedMs:performance.now()-started,firstResultMs,peakBufferEstimateBytes,processed:batch.processed,failureCount:batch.failureCount,
        workerConcurrency:1,originalBytesPersisted:0,bufferEstimate:'2× largest bounded file + 64KiB EXIF; excludes browser/runtime overhead'};
      await this.manifest.putBatch(batch);return batch;
    }catch(error){
      if(batch){try{const durable=await this.manifest.getBatch(batch.id);if(durable)await this.manifest.putBatch({...durable,status:'interrupted',error:error.message});}catch{/* Preserve last committed chunk; surface the original storage error. */}}
      throw error;
    }finally{this.worker?.terminate();this.worker=null;this.pendingReject=null;this.running=false;}
  }
  fileFor(id){return this.files.get(id)||null;}
  clearFiles(){this.files.clear();}
}
