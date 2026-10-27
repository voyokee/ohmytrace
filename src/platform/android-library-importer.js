import {PhotoScanner} from '../life/media/scanner.js';
import {NativeScanStore} from './native-scan-store.js';
import {analyzePhotoFile} from '../life/media/exif.js';

// Inclusive start, exclusive end; datetime-local input is interpreted on the device.
export function scanRange(start='',end=''){
  const parse=value=>{if(!value)return null;const n=new Date(value).getTime();if(!Number.isFinite(n))throw new Error('扫描时间无效');return n;};
  const range={startMs:parse(start),endMs:parse(end)};
  if(range.startMs!==null&&range.endMs!==null&&range.startMs>=range.endMs)throw new Error('结束时间必须晚于开始时间');return range;
}
/** Acquisition only: all observations still pass through PhotoScanner and review. */
export class AndroidLibraryImporter {
  constructor(service,capability,{store=new NativeScanStore()}={}){this.service=service;this.capability=capability;this.store=store;this.running=false;this.controller=null;this.scanner=null;}
  cancel(){this.controller?.abort();this.scanner?.cancel();}
  async latest(){return this.store.get('active');}
  async attachFiles(session,signal){for(const entry of session.files||[])this.service.scanner.files.set(entry.assetId,this.capability.file(entry,signal));}
  async restoreFiles(batchId){const session=await this.latest();if(session?.batchId===batchId)await this.attachFiles(session);}
  async scan({range=scanRange(),resume=false,incremental=true,onProgress=()=>{}}={}){
    if(this.running||this.service.scanner.running)throw new Error('已有照片扫描正在运行');
    if(this.service.readOnly)throw new Error('演示模式不能扫描系统相册');
    this.running=true;this.controller=new AbortController();const signal=this.controller.signal;
    const key='checkpoint:'+JSON.stringify(range);let session;
    try{
      session=resume?await this.latest():null;
      if(resume&&(!session||session.status==='complete'))throw new Error('没有可恢复的相册扫描');
      if(!session){const batch=await this.service.manifest.createBatch([]);session={version:1,range,key,batchId:batch.id,since:incremental?await this.store.get(key):null,cursor:null,pending:null,files:[],status:'scanning'};await this.store.put('active',session);}
      await this.attachFiles(session);
      while(true){
        signal.throwIfAborted();let pending=session.pending;
        if(!pending){const page=await this.capability.page({...session.range,since:session.since,cursor:session.cursor,pageSize:100,signal});signal.throwIfAborted();
          const files=page.entries.map(e=>this.capability.file(e,signal)),batch=files.length?await this.service.manifest.createBatch(files):null;
          pending={page,batchId:batch?.id||null};session.pending=pending;await this.store.put('active',session);
        }
        const {page}=pending,files=page.entries.map(e=>this.capability.file(e,signal));let scanned=null;
        if(pending.batchId){
          scanned=await this.service.manifest.getBatch(pending.batchId);
          if(scanned.status!=='review'){
            this.scanner=new PhotoScanner(this.service.manifest,{workerFactory:null,concurrency:1,analyze:async(file,options)=>{const asset=await analyzePhotoFile(file,options);if(!file.locationAuthorized&&!asset.coordinates)asset.diagnostics=[...new Set([...asset.diagnostics,'GPS_PERMISSION_REQUIRED'])];return asset;}});
            scanned=await this.scanner.scan(files,{resumeBatchId:pending.batchId,onProgress:p=>onProgress({processed:session.files.length+p.processed,phase:'scanning'})});
            signal.throwIfAborted();
          }
        }
        const aggregate=await this.service.manifest.getBatch(session.batchId);if(!aggregate)throw new Error('扫描批次已不存在，请重新扫描');
        if(scanned&&!(aggregate.nativePageBatchIds||[]).includes(scanned.id)){
          aggregate.nativePageBatchIds=[...(aggregate.nativePageBatchIds||[]),scanned.id];aggregate.filePlan.push(...scanned.filePlan);aggregate.total+=scanned.total;aggregate.processed+=scanned.processed;
          aggregate.assetIds=[...new Set([...aggregate.assetIds,...scanned.assetIds])];aggregate.duplicateCount+=scanned.duplicateCount;aggregate.failureCount+=scanned.failureCount;
          await this.service.manifest.putBatch(aggregate);
        }
        // Re-analyzing is unnecessary after a crash between aggregate and journal writes.
        if(scanned){
          const known=new Set(session.files.map(e=>e.assetId));for(const [i,e] of page.entries.entries()){const id=scanned.fileAssetIds[i];if(id){this.service.scanner.files.set(id,this.capability.file(e));if(!known.has(id)){session.files.push({...e,assetId:id});known.add(id);}}}
        }
        session.pending=null;session.cursor=page.cursor;session.status=page.cursor?'scanning':'complete';session.checkpoint=page.checkpoint;
        await this.store.put('active',session);onProgress({processed:aggregate.processed,phase:session.status});
        if(!page.cursor){aggregate.status='review';await this.service.manifest.putBatch(aggregate);
          // A checkpoint is safe after durable metadata, even if human review happens later.
          if(!aggregate.failureCount)await this.store.put(session.key,page.checkpoint);return aggregate;
        }
      }
    }catch(error){if(session){session.status='interrupted';await this.store.put('active',session).catch(()=>{});}throw error;
    }finally{this.running=false;this.scanner=null;this.controller=null;}
  }
}
