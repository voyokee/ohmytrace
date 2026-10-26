import {clone,newId} from '../schema.js';
import {MEDIA_LIMITS} from './config.js';
import {reparseTime,TIME_FIELDS} from './time.js';

export function validateAsset(asset) {
  if(!asset||typeof asset.assetId!=='string'||!asset.originalFile||typeof asset.originalFile.name!=='string'||!Number.isSafeInteger(asset.originalFile.size)||asset.originalFile.size<0||!Array.isArray(asset.diagnostics))throw new Error('媒体索引记录损坏');
  if(asset.coordinates&&(!Number.isFinite(asset.coordinates.latitude)||!Number.isFinite(asset.coordinates.longitude)||Math.abs(asset.coordinates.latitude)>90||Math.abs(asset.coordinates.longitude)>180))throw new Error('媒体索引坐标无效');
  if(asset.deduplicationKey!==null&&(!/^[a-f0-9]{64}$/.test(asset.deduplicationKey)||asset.assetId!==`asset_${asset.deduplicationKey}`))throw new Error('媒体内容标识无效');
  if(!['analyzed','error','unsupported','oversize','deferred'].includes(asset.processingStatus)||!['parsed','missing','error','unsupported'].includes(asset.metadataStatus)||asset.diagnostics.some(d=>typeof d!=='string'))throw new Error('媒体处理状态无效');
  // Every stored time must be reproducible from its raw source string, whichever
  // container (EXIF/XMP) supplied it; a backup cannot invent a UTC instant.
  for(const t of [asset.extractedTime,asset.mediaCreatedTime].filter(Boolean)){const parsed=reparseTime(t);
    if(!parsed||TIME_FIELDS.some(k=>parsed[k]!==t[k]))throw new Error('媒体时间语义无效');
  }
  return asset;
}
export function validateManifest(input) {
  // v1 assets are a strict subset of v2 (no format/XMP/secondary-time fields), so they restore unchanged.
  if(input?.kind!=='ohmytrace.media-manifest'||![1,MEDIA_LIMITS.manifestVersion].includes(input.version)||!Array.isArray(input.assets)||!Array.isArray(input.batches))throw new Error('不支持的媒体索引备份版本');
  const ids=new Set();for(const asset of input.assets){validateAsset(asset);if(ids.has(asset.assetId))throw new Error('重复媒体 ID');ids.add(asset.assetId);}
  const batches=new Set();for(const batch of input.batches){
    if(typeof batch.id!=='string'||batches.has(batch.id)||!Array.isArray(batch.assetIds)||new Set(batch.assetIds).size!==batch.assetIds.length||batch.assetIds.some(id=>!ids.has(id))||typeof batch.startedAt!=='string'||!Number.isSafeInteger(batch.processed)||!Number.isSafeInteger(batch.total)||batch.processed<0||batch.processed>batch.total||!Array.isArray(batch.filePlan)||batch.filePlan.length!==batch.total||!['scanning','review','prepared','committed','cancelled','interrupted'].includes(batch.status))throw new Error('媒体批次关系无效');
    if(batch.review&&(batch.review.version!==1||!Array.isArray(batch.review.candidates)||!Array.isArray(batch.review.unlocatedAssetIds)||!Array.isArray(batch.review.manualRevisions)||batch.review.candidates.some(c=>typeof c.id!=='string'||typeof c.title!=='string'||!Array.isArray(c.visits)||!Array.isArray(c.chapterIds)||!Array.isArray(c.matches)||!Array.isArray(c.reasons)||c.visits.some(v=>typeof v.id!=='string'||typeof v.placeName!=='string'||!Array.isArray(v.assetIds)||v.assetIds.some(id=>!batch.assetIds.includes(id))||!v.coordinates||!Number.isFinite(v.coordinates.latitude)||!Number.isFinite(v.coordinates.longitude)))))throw new Error('媒体审核草稿无效');
    batches.add(batch.id);
  }
  return input;
}
const batchRecord=(files)=>({id:newId('import'),version:1,status:'scanning',startedAt:new Date().toISOString(),
  filePlan:files.map(f=>({name:f.name||'',size:f.size,lastModified:f.lastModified??null})),total:files.length,
  processed:0,assetIds:[],duplicateCount:0,failureCount:0,review:null,commitState:null,metrics:null});

export class MediaManifest {
  constructor(indexedDB=globalThis.indexedDB,name='ohmytrace.media'){this.indexedDB=indexedDB;this.name=name;this.db=null;}
  async open(){
    if(this.db)return this.db;
    if(!this.indexedDB)throw new Error('浏览器媒体存储不可用');
    this.db=await new Promise((resolve,reject)=>{
      const req=this.indexedDB.open(this.name,1);let blocked=false;
      req.onupgradeneeded=()=>{req.result.createObjectStore('assets',{keyPath:'assetId'});req.result.createObjectStore('batches',{keyPath:'id'});};
      req.onerror=()=>reject(req.error);req.onblocked=()=>{blocked=true;reject(new Error('媒体数据库被其他标签页阻塞'));};
      req.onsuccess=()=>{if(blocked){req.result.close();return;}const db=req.result;db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};
    });return this.db;
  }
  async transaction(stores,mode,body){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(stores,mode);let result,failure;
      tx.oncomplete=()=>resolve(typeof result==='function'?result():result);
      tx.onabort=()=>reject(failure||tx.error||new Error('媒体事务被中止'));tx.onerror=()=>{};
      try{result=body(tx);}catch(error){failure=error;tx.abort();}
    });
  }
  getAsset(id){return this.transaction(['assets'],'readonly',tx=>{const r=tx.objectStore('assets').get(id);return ()=>r.result||null;});}
  getBatch(id){return this.transaction(['batches'],'readonly',tx=>{const r=tx.objectStore('batches').get(id);return ()=>r.result||null;});}
  listAssets(){return this.transaction(['assets'],'readonly',tx=>{const r=tx.objectStore('assets').getAll();return ()=>r.result;});}
  listBatches(){return this.transaction(['batches'],'readonly',tx=>{const r=tx.objectStore('batches').getAll();return ()=>r.result;});}
  async createBatch(files){const batch=batchRecord(files);await this.putBatch(batch);return batch;}
  putBatch(batch){return this.transaction(['batches'],'readwrite',tx=>{tx.objectStore('batches').put(clone(batch));});}
  async saveChunk(batch,assets){
    assets.forEach(validateAsset);
    await this.transaction(['assets','batches'],'readwrite',tx=>{
      const store=tx.objectStore('assets');
      for(const asset of assets){const request=store.get(asset.assetId);request.onsuccess=()=>{
        const old=request.result,record=old?{...old,importBatchIds:[...new Set([...(old.importBatchIds||[old.importBatchId]),batch.id])]}:
          {...clone(asset),importBatchId:batch.id,importBatchIds:[batch.id]};store.put(record);
      };}
      tx.objectStore('batches').put(clone(batch));
    });
  }
  async acknowledge(batchId,links){
    await this.transaction(['assets','batches'],'readwrite',tx=>{
      const assets=tx.objectStore('assets'),batches=tx.objectStore('batches');
      for(const [id,memoryId]of Object.entries(links)){const r=assets.get(id);r.onsuccess=()=>{if(r.result)assets.put({...r.result,linkedMemoryId:memoryId});};}
      const req=batches.get(batchId);req.onsuccess=()=>{if(req.result)batches.put({...req.result,status:'committed',commitState:'acknowledged',committedAt:new Date().toISOString()});};
    });
  }
  async backup(){return this.transaction(['assets','batches'],'readonly',tx=>{
    const a=tx.objectStore('assets').getAll(),b=tx.objectStore('batches').getAll();return ()=>({kind:'ohmytrace.media-manifest',version:MEDIA_LIMITS.manifestVersion,scope:'metadata-and-review-only; no originals or thumbnails',assets:a.result,batches:b.result});
  });}
  async restore(input){
    validateManifest(input);
    await this.transaction(['assets','batches'],'readwrite',tx=>{
      const a=tx.objectStore('assets'),b=tx.objectStore('batches');a.clear();b.clear();input.assets.forEach(row=>a.put(clone(row)));input.batches.forEach(row=>b.put(clone(row)));
    });
  }
  close(){this.db?.close();this.db=null;}
}

export class MemoryManifest {
  constructor(){this.assets=new Map();this.batches=new Map();}
  async getAsset(id){return clone(this.assets.get(id)||null);}async getBatch(id){return clone(this.batches.get(id)||null);}
  async listAssets(){return clone([...this.assets.values()]);}async listBatches(){return clone([...this.batches.values()]);}
  async createBatch(files){const b=batchRecord(files);await this.putBatch(b);return b;}
  async putBatch(b){this.batches.set(b.id,clone(b));}
  async saveChunk(batch,assets){assets.forEach(validateAsset);for(const a of assets){const old=this.assets.get(a.assetId);this.assets.set(a.assetId,old?{...old,importBatchIds:[...new Set([...old.importBatchIds,batch.id])]}:{...clone(a),importBatchId:batch.id,importBatchIds:[batch.id]});}await this.putBatch(batch);}
  async acknowledge(id,links){for(const [a,m]of Object.entries(links))if(this.assets.has(a))this.assets.get(a).linkedMemoryId=m;const b=this.batches.get(id);if(b){b.status='committed';b.commitState='acknowledged';}}
  async backup(){return {kind:'ohmytrace.media-manifest',version:MEDIA_LIMITS.manifestVersion,assets:await this.listAssets(),batches:await this.listBatches()};}
  async restore(input){validateManifest(input);this.assets=new Map(input.assets.map(a=>[a.assetId,clone(a)]));this.batches=new Map(input.batches.map(b=>[b.id,clone(b)]));}
}
