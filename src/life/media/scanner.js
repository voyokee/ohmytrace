import {MEDIA_LIMITS} from './config.js';
import {analyzePhotoFile} from './exif.js';
import {newId} from '../schema.js';

const VIDEO=/\.(mov|mp4|m4v|3gp)$/i,stem=name=>String(name||'').replace(/\.[^.]+$/,'').toLowerCase();
// An iPhone Live Photo exported via a picker arrives as IMG_1.HEIC + IMG_1.MOV.
// The motion part is recorded as a deferred companion, never as another visit.
export function livePhotoCompanions(files) {
  const stills=new Set(files.filter(f=>!VIDEO.test(f.name||'')).map(f=>stem(f.name)));
  return files.map(f=>VIDEO.test(f.name||'')&&stills.has(stem(f.name))?'live-photo':null);
}
// Earlier releases identified every file by its full-content hash. Large files now
// use a sampled identity, so the same original is re-matched to its legacy asset by
// size and exact capture evidence instead of producing a second Memory.
const similarSignature=a=>a.extractedTime&&a.coordinates?JSON.stringify([a.extractedTime.localDateTime,a.coordinates,a.dimensions]):null;
const legacySignature=a=>a.extractedTime&&a.originalFile?.size?JSON.stringify([a.originalFile.size,a.extractedTime.raw,a.extractedTime.offsetRaw,a.extractedTime.subsecondRaw,a.coordinates]):null;

class WorkerPool {
  constructor(factory,size){this.factory=factory;this.size=size;this.idle=[];this.all=[];this.waiting=[];this.jobs=new Map();this.failed=false;}
  start(){
    for(let i=0;i<this.size;i++){let worker;try{worker=this.factory();}catch{this.failed=true;break;}
      worker.onmessage=event=>{const job=this.jobs.get(event.data.id);if(!job)return;this.jobs.delete(event.data.id);this.release(worker);event.data.error?job.reject(new Error(event.data.error)):job.resolve(event.data.asset);};
      worker.onerror=event=>{event.preventDefault?.();this.failed=true;for(const [id,job] of this.jobs)if(job.worker===worker){this.jobs.delete(id);job.reject(new Error('PHOTO_WORKER_FAILED'));}
        worker.terminate();this.all=this.all.filter(w=>w!==worker);this.idle=this.idle.filter(w=>w!==worker);
        // Once a worker fails the remaining files fall back to the main thread; nothing may wait forever.
        for(const waiter of this.waiting.splice(0))waiter.reject(new Error('PHOTO_WORKER_FAILED'));};
      this.all.push(worker);this.idle.push(worker);}
    return this.all.length;
  }
  release(worker){const next=this.waiting.shift();if(next)next.resolve(worker);else this.idle.push(worker);}
  async run(message){
    if(!this.all.length||this.failed)throw new Error('PHOTO_WORKER_FAILED');
    const worker=this.idle.pop()||await new Promise((resolve,reject)=>this.waiting.push({resolve,reject}));
    if(!this.all.includes(worker))throw new Error('PHOTO_WORKER_FAILED');
    return new Promise((resolve,reject)=>{const id=newId('job');this.jobs.set(id,{resolve,reject,worker});worker.postMessage({id,...message});});
  }
  terminate(){for(const w of this.all)w.terminate();for(const job of this.jobs.values())job.reject(new Error('SCAN_CANCELLED'));for(const waiter of this.waiting)waiter.reject(new Error('SCAN_CANCELLED'));this.jobs.clear();this.all=[];this.idle=[];this.waiting=[];}
}

export class PhotoScanner {
  constructor(manifest,{limits=MEDIA_LIMITS,workerFactory=globalThis.Worker?()=>new Worker(new URL('./scan-worker.js',import.meta.url),{type:'module'}):null,analyze=analyzePhotoFile,concurrency=null}={}){
    this.manifest=manifest;this.limits=limits;this.workerFactory=workerFactory;this.analyze=analyze;this.running=false;this.files=new Map();this.pool=null;
    const cores=globalThis.navigator?.hardwareConcurrency||2;
    this.concurrency=concurrency??Math.max(1,Math.min(limits.workerConcurrency,cores-1));
  }
  cancel(){this.cancelled=true;this.pool?.terminate();}
  // A job carries several files: each worker reply needs a main-thread task, and
  // on a busy page (the 3D globe renders every frame) per-file replies throttle the scan.
  async extractGroup(files,companions){
    if(this.pool&&!this.pool.failed){
      try{return (await this.pool.run({files,limits:this.limits,companions})).map(r=>r.error?{failure:new Error(r.error)}:r.asset);}
      catch(error){if(this.cancelled||error.message!=='PHOTO_WORKER_FAILED')throw error;this.workerUnavailable=true;}
    }
    const results=[];
    for(let k=0;k<files.length;k++){if(this.cancelled)break;try{results.push(await this.analyze(files[k],{limits:this.limits,companion:companions[k]}));}catch(error){results.push({failure:error});}}
    return results;
  }
  async scan(input,{onProgress=()=>{},resumeBatchId=null}={}) {
    if(this.running)throw new Error('已有照片扫描正在运行');
    const files=Array.from(input);if(!files.length||files.length>this.limits.maxFiles)throw new Error(`每批请选择 1–${this.limits.maxFiles} 张照片`);
    this.running=true;this.cancelled=false;this.usedWorker=false;this.workerUnavailable=false;let batch,chunk=[];
    const started=performance.now();let firstResultMs=null,lastYield=started;
    const pending=new Map(),companions=livePhotoCompanions(files),group=this.limits.filesPerJob,window=this.concurrency*2;
    try {
      batch=resumeBatchId?await this.manifest.getBatch(resumeBatchId):await this.manifest.createBatch(files);
      if(!batch||batch.total!==files.length||batch.filePlan.some((p,i)=>p.name!==files[i].name||p.size!==files[i].size||p.lastModified!==(files[i].lastModified??null)))throw new Error('恢复扫描需重新选择原批次的文件，顺序、名称、大小和修改时间须匹配');
      if(batch.status==='committed')throw new Error('这个批次已确认；可重新选择以补充或查看');
      batch.status='scanning';await this.manifest.putBatch(batch);
      if(this.workerFactory){this.pool=new WorkerPool(this.workerFactory,this.concurrency);this.usedWorker=this.pool.start()>0;if(!this.usedWorker)this.workerUnavailable=true;}
      const existing=await this.manifest.listAssets(),known=new Set(existing.map(a=>a.assetId)),batchIds=new Set(batch.assetIds);
      const legacy=new Map(existing.filter(a=>a.identity!=='sampled-sha256-v2'&&a.deduplicationKey).map(a=>[legacySignature(a),a]).filter(([k])=>k));
      const similar=new Map();for(const a of existing){const key=similarSignature(a);if(key)similar.set(key,[...(similar.get(key)||[]),a.assetId].slice(0,this.limits.maxDuplicateHints));}
      const resumeCursor=batch.processed;
      // Up to `window` groups of files are analyzed concurrently, but results are committed
      // strictly in input order so the durable resume cursor never skips a file.
      const launch=g=>{if(g*group<files.length&&!pending.has(g)&&!this.cancelled)pending.set(g,this.extractGroup(files.slice(g*group,(g+1)*group),companions.slice(g*group,(g+1)*group)).catch(error=>({failure:error})));};
      let results=null;
      for(let i=0;i<files.length;i++) {
        if(this.cancelled)break;const file=files[i],g=Math.floor(i/group);
        if(i%group===0){for(let h=g;h<g+window;h++)launch(h);results=await pending.get(g);pending.delete(g);}
        if(this.cancelled)break;
        let asset=results?.failure?results:results?.[i%group];
        if(this.cancelled)break;
        if(!asset||asset.failure){
          asset={assetId:newId('diagnostic'),deduplicationKey:null,originalFile:{name:file.name,type:file.type,size:file.size,lastModified:file.lastModified??null},processingStatus:'error',metadataStatus:'error',extractedTime:null,coordinates:null,metadataEvidence:{state:'unknown',source:{kind:'file-diagnostic',reason:asset?.failure?.message||'SCAN_FAILED'}},diagnostics:[asset?.failure?.message||'SCAN_FAILED'],linkedMemoryId:null,thumbnailReference:null};
        }
        const alias=asset.identity==='sampled-sha256-v2'&&legacy.get(legacySignature(asset));
        if(alias){
          // Legacy metadata similarity is only a lookup hint. Verify actual bytes
          // before reusing a full-content identity; otherwise retain both records.
          let verified=false;if(file.size<=64*1024*1024){const full=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');verified=full===alias.deduplicationKey;}
          if(verified)asset={...asset,assetId:alias.assetId,deduplicationKey:alias.deduplicationKey,identity:'content-sha256'};
          else asset.possibleDuplicateAssetIds=[alias.assetId];
        }
        const hintKey=similarSignature(asset),hints=hintKey?(similar.get(hintKey)||[]).filter(id=>id!==asset.assetId).slice(0,this.limits.maxDuplicateHints):[];if(hints.length)asset.possibleDuplicateAssetIds=[...new Set([...(asset.possibleDuplicateAssetIds||[]),...hints])].slice(0,this.limits.maxDuplicateHints);
        if(hintKey)similar.set(hintKey,[...new Set([...(similar.get(hintKey)||[]),asset.assetId])].slice(0,this.limits.maxDuplicateHints));
        if(i<resumeCursor){if(asset.deduplicationKey&&!batchIds.has(asset.assetId))throw new Error('续扫文件内容与已保存批次不同，请新建导入而不是继续此批次');this.files.set(asset.assetId,file);continue;}
        if(firstResultMs===null)firstResultMs=performance.now()-started;
        if(known.has(asset.assetId))batch.duplicateCount++;known.add(asset.assetId);
        this.files.set(asset.assetId,file);chunk.push(asset);
        if(!batchIds.has(asset.assetId)){batchIds.add(asset.assetId);batch.assetIds.push(asset.assetId);}batch.processed=i+1;
        if(['error','unsupported','oversize'].includes(asset.processingStatus))batch.failureCount++;
        if(chunk.length>=this.limits.flushEvery||i===files.length-1){await this.manifest.saveChunk(batch,chunk);chunk=[];}
        onProgress({processed:batch.processed,total:batch.total,asset,duplicateCount:batch.duplicateCount,failureCount:batch.failureCount});
        // Keep the page responsive without paying a clamped timer per file.
        if(performance.now()-lastYield>12){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
      }
      if(chunk.length)await this.manifest.saveChunk(batch,chunk);
      batch.status=this.cancelled?'cancelled':'review';
      batch.metrics={elapsedMs:performance.now()-started,firstResultMs,processed:batch.processed,failureCount:batch.failureCount,
        workerConcurrency:this.usedWorker?this.pool.all.length:0,processingMode:this.usedWorker?(this.workerUnavailable?'worker-with-main-thread-fallback':'worker-pool'):'main-thread',
        originalBytesPersisted:0,readStrategy:`header ${this.limits.sampleBytes} B + tail ${this.limits.tailSampleBytes} B per file; ≤${this.limits.maxHeaderBytes} B when metadata is deeper`};
      await this.manifest.putBatch(batch);return batch;
    }catch(error){
      if(batch){try{const durable=await this.manifest.getBatch(batch.id);if(durable)await this.manifest.putBatch({...durable,status:'interrupted',error:error.message});}catch{/* Preserve last committed chunk; surface the original storage error. */}}
      throw error;
    }finally{this.pool?.terminate();this.pool=null;this.running=false;}
  }
  fileFor(id){return this.files.get(id)||null;}
  clearFiles(){this.files.clear();}
}
