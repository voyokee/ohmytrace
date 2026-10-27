/** Device-local cursor and handle journal; intentionally excluded from backups. */
export class NativeScanStore {
  constructor(indexedDB=globalThis.indexedDB){this.indexedDB=indexedDB;this.db=null;}
  async open(){if(this.db)return this.db;return this.db=await new Promise((resolve,reject)=>{const r=this.indexedDB.open('ohmytrace.android-scans',1);let blocked=false;r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.db=null;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(new Error('相册进度存储被其他窗口阻塞'));};});}
  async get(key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('records'),r=tx.objectStore('records').get(key);tx.oncomplete=()=>resolve(r.result||null);tx.onabort=()=>reject(tx.error);});}
  async put(key,value){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
}
