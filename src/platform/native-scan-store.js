/** Device-local cursor and handle journal; intentionally excluded from backups. */
export class NativeScanStore {
  constructor(indexedDB=globalThis.indexedDB,name='ohmytrace.android-scans'){this.indexedDB=indexedDB;this.name=name;this.db=null;}
  async open(){if(this.db)return this.db;return this.db=await new Promise((resolve,reject)=>{const r=this.indexedDB.open(this.name,1);let blocked=false;r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.db=null;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(new Error('相册进度存储被其他窗口阻塞'));};});}
  fileRange(batchId,count=Number.MAX_SAFE_INTEGER){return IDBKeyRange.bound(['files',batchId,0],['files',batchId,Math.max(0,count-1)]);}
  async get(key){const db=await this.open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('records'),store=tx.objectStore('records'),r=store.get(key);let value=null,failure=null;
    r.onsuccess=()=>{value=r.result||null;if(key==='active'&&value?.fileRecordsVersion===1){const {fileCount,fileRecordsVersion,...session}=value;
      if(!fileCount){value={...session,files:[]};return;}const q=store.getAll(this.fileRange(session.batchId,fileCount));q.onsuccess=()=>{if(q.result.length!==fileCount){failure=new Error('相册扫描文件日志不完整，请重新扫描');tx.abort();return;}value={...session,files:q.result};};
    }};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||tx.error);
  });}
  async put(key,value){const db=await this.open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let failure=null;
    if(key==='active'&&Array.isArray(value.files)){
      const previous=store.get(key);previous.onsuccess=()=>{try{
        const old=previous.result,{files,...record}=value,same=old?.batchId===value.batchId,from=same&&old.fileRecordsVersion===1?old.fileCount:0;
        if(from>files.length)throw new Error('不能回退已保存的相册文件日志');
        if(old?.batchId&&!same)store.delete(this.fileRange(old.batchId));
        // The small cursor and only newly acquired handles share one transaction.
        // Old inline-array journals migrate on their first successful update.
        for(let i=from;i<files.length;i++)store.put(files[i],['files',value.batchId,i]);
        store.put({...record,fileRecordsVersion:1,fileCount:files.length},key);
      }catch(error){failure=error;tx.abort();}};
    }else store.put(value,key);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure||tx.error);
  });}
}
