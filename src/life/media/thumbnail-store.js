import {THUMBNAIL_LIMITS,validateThumbnail} from './thumbnail.js';
const safeId=id=>/^asset_[a-f0-9]{64}$/.test(id);
export const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
export class ThumbnailStore {
 constructor({indexedDB=globalThis.indexedDB,name='ohmytrace.thumbnails',storage=globalThis.navigator?.storage,limits=THUMBNAIL_LIMITS}={}){this.indexedDB=indexedDB;this.name=name;this.storage=storage;this.limits=limits;this.db=null;this.queue=Promise.resolve();}
 async open(){if(this.db)return this.db;if(!this.indexedDB)throw new Error('缩略图存储不可用');this.db=await new Promise((resolve,reject)=>{const r=this.indexedDB.open(this.name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('thumbnails',{keyPath:'assetId'});r.result.createObjectStore('journal',{keyPath:'id'});};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('缩略图数据库被其他页面阻塞'));r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};});return this.db;}
 async tx(store,mode,body){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let result,error;tx.oncomplete=()=>resolve(typeof result==='function'?result():result);tx.onabort=()=>reject(error||tx.error||new Error('缩略图事务中断'));tx.onerror=()=>{};try{result=body(tx.objectStore(store),e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}});}
 async mutate(action){return globalThis.navigator?.locks?navigator.locks.request('ohmytrace.thumbnails-write',action):action();}
 async directory(){if(this.directoryPromise===undefined)this.directoryPromise=this.storage?.getDirectory?this.storage.getDirectory().then(r=>r.getDirectoryHandle('ohmytrace-thumbnails',{create:true})).catch(()=>null):Promise.resolve(null);return this.directoryPromise;}
 list(){return this.tx('thumbnails','readonly',s=>{const r=s.getAll();return ()=>r.result;});}
 record(id){return this.tx('thumbnails','readonly',s=>{const r=s.get(id);return ()=>r.result||null;});}
 async stats(){const rows=await this.list();return {count:rows.length,bytes:rows.reduce((n,r)=>n+r.size,0),budgetBytes:this.limits.budgetBytes,backend:(await this.directory())?'opfs':'indexeddb-blob'};}
 async read(id){const row=await this.record(id);if(!row)return null;let blob=row.blob;
  try{if(row.backend==='opfs'){const dir=await this.directory();if(!dir)throw new Error('OPFS_UNAVAILABLE');blob=await (await dir.getFileHandle(row.fileName)).getFile();}if(!blob||blob.size!==row.size||await digest(await blob.arrayBuffer())!==row.sha256)throw new Error('THUMBNAIL_CHECKSUM');await validateThumbnail(blob,this.limits);return new Blob([blob],{type:'image/jpeg'});}
  catch{throw new Error('缩略图读取失败：请从统一备份恢复或重新选择原文件');}
 }
 put(id,blob,{operationId=null}={}){const run=this.queue.then(()=>this.mutate(async()=>{
  if(!safeId(id))throw new Error('缩略图资产 ID 无效');await validateThumbnail(blob,this.limits);const sha256=await digest(await blob.arrayBuffer()),dir=await this.directory(),old=await this.record(id),fileName=`${id}_${crypto.randomUUID()}.jpg`;
  let backend='indexeddb-blob';if(dir){let writer;try{writer=await (await dir.getFileHandle(fileName,{create:true})).createWritable();await writer.write(blob);await writer.close();writer=null;const file=await (await dir.getFileHandle(fileName)).getFile();if(await digest(await file.arrayBuffer())!==sha256)throw new Error('THUMBNAIL_WRITE_VERIFY');backend='opfs';}catch{try{await writer?.abort();await dir.removeEntry(fileName);}catch{/* incomplete file is never indexed */}}}
  const row={assetId:id,size:blob.size,sha256,type:'image/jpeg',backend,fileName:backend==='opfs'?fileName:null,blob:backend==='opfs'?null:blob,operationId,updatedAt:new Date().toISOString()};
  try{await this.tx('thumbnails','readwrite',(s,fail)=>{const all=s.getAll();all.onsuccess=()=>{const size=all.result.filter(r=>r.assetId!==id).reduce((n,r)=>n+r.size,0)+blob.size;if(size>this.limits.budgetBytes){fail(new Error('THUMBNAIL_CAPACITY_LIMIT：缩略图已达 100 MB 预算，已暂停新增'));return;}s.put(row);};});}
  catch(e){if(backend==='opfs')await dir.removeEntry(fileName).catch(()=>{});throw e;}
  if(old?.backend==='opfs')await dir?.removeEntry(old.fileName).catch(()=>{});return {assetId:id,store:'ohmytrace.thumbnails',sha256,size:blob.size};
 }));this.queue=run.catch(()=>{});return run;}
 async delete(id){return this.mutate(()=>this.remove(id));}
 async remove(id){const old=await this.record(id);await this.tx('thumbnails','readwrite',s=>s.delete(id));if(old?.backend==='opfs'){const dir=await this.directory();await dir?.removeEntry(old.fileName).catch(()=>{});}}
 async gc(referencedIds){return this.mutate(async()=>{const keep=new Set(referencedIds);for(const r of await this.list())if(!keep.has(r.assetId))await this.remove(r.assetId);const dir=await this.directory();if(dir){const names=new Set((await this.list()).filter(r=>r.backend==='opfs').map(r=>r.fileName));for await(const [name]of dir.entries())if(!names.has(name))await dir.removeEntry(name);}return this.stats();});}
 getJournal(){return this.tx('journal','readonly',s=>{const r=s.get('restore');return ()=>r.result||null;});}
 setJournal(record){return this.tx('journal','readwrite',s=>record?s.put({...record,id:'restore'}):s.delete('restore'));}
 close(){this.db?.close();this.db=null;}
}
export class MemoryThumbnailStore {
 constructor({limits=THUMBNAIL_LIMITS}={}){this.limits=limits;this.rows=new Map();this.journal=null;}
 async list(){return [...this.rows.values()];}async record(id){return this.rows.get(id)||null;}async read(id){return this.rows.get(id)?.blob||null;}
 async put(id,blob,{operationId=null}={}){await validateThumbnail(blob,this.limits);const size=[...this.rows.values()].filter(r=>r.assetId!==id).reduce((n,r)=>n+r.size,0)+blob.size;if(size>this.limits.budgetBytes)throw new Error('THUMBNAIL_CAPACITY_LIMIT');const sha256=await digest(await blob.arrayBuffer());this.rows.set(id,{assetId:id,blob,size:blob.size,sha256,operationId,type:'image/jpeg'});return {assetId:id,store:'ohmytrace.thumbnails',sha256,size:blob.size};}
 async stats(){return {count:this.rows.size,bytes:[...this.rows.values()].reduce((n,r)=>n+r.size,0),budgetBytes:this.limits.budgetBytes,backend:'memory'};}
 async delete(id){this.rows.delete(id);}async gc(ids){for(const id of this.rows.keys())if(!ids.includes(id))this.rows.delete(id);return this.stats();}
 async getJournal(){return structuredClone(this.journal);}async setJournal(j){this.journal=j?structuredClone({...j,id:'restore'}):null;}
}
