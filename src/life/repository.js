import { clone, emptyDataset, validateDataset, migrateDataset, exportJSON, importJSON } from './schema.js';

export class IndexedDBStore {
  constructor(indexedDB = globalThis.indexedDB, name = 'ohmytrace.life') { this.indexedDB=indexedDB; this.name=name; }
  async open() {
    if(this.db)return this.db;
    if(!this.indexedDB)throw new Error('浏览器不支持 IndexedDB；数据未保存');
    this.db = await new Promise((resolve,reject)=>{
      const req=this.indexedDB.open(this.name,1);
      req.onupgradeneeded=()=>req.result.createObjectStore('datasets');
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};
      req.onerror=()=>reject(req.error);
      req.onblocked=()=>reject(new Error('数据库升级被其他标签页阻塞，请关闭其他页面后重试'));
    });
    return this.db;
  }
  async read() {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('datasets','readonly'), req=tx.objectStore('datasets').get('canonical');
      tx.oncomplete=()=>resolve(req.result ?? null);tx.onabort=()=>reject(tx.error || new Error('读取被中止'));tx.onerror=()=>{};
    });
  }
  async write(data, expectedRevision) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('datasets','readwrite'), store=tx.objectStore('datasets');let failure;
      const req=store.get('canonical');
      req.onsuccess=()=>{
        if((req.result?.revision ?? 0)!==expectedRevision){failure=new Error('其他标签页已修改数据，请刷新后重试');tx.abort();return;}
        store.put(clone(data),'canonical');
      };
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure||tx.error||new Error('保存被中止'));tx.onerror=()=>{};
    });
  }
  close() { this.db?.close(); this.db=null; }
}

function deepFreeze(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const key in value)deepFreeze(value[key]);}
  return value;
}

export class LifeRepository {
  constructor(store = new IndexedDBStore()) { this.store=store;this.data=null;this.listeners=new Set();this.queue=Promise.resolve();this.uncertain=false; }
  getDataset() { if(!this.data)throw new Error('数据尚未载入');return clone(this.data); }
  // Read-only view for rendering. A deep copy of a large library costs about 100 ms on a phone, and one screen reads
  // the data many times, so this copies once per stored value and freezes it. Code that changes data uses
  // getDataset() or update(); writing to a snapshot throws.
  snapshot() {
    if(!this.data)throw new Error('数据尚未载入');
    if(this.frozenFrom!==this.data){this.frozen=deepFreeze(clone(this.data));this.frozenFrom=this.data;}
    return this.frozen;
  }
  subscribe(listener) { this.listeners.add(listener);return ()=>this.listeners.delete(listener); }
  notify() { for(const listener of this.listeners) { try { listener(this.getDataset()); } catch(error) { globalThis.console?.error('Life subscriber failed',error); } } }
  async initialize({ legacyStorage = globalThis.localStorage, migrateLegacy } = {}) {
    const existing=await this.store.read();
    if(existing) {
      this.data=migrateDataset(existing);
      if(this.data.meta.migration?.status==='pending')await this.finishMigration();
      return this.getDataset();
    }
    // Access and JSON errors propagate. They must never silently become a demo.
    const raw=legacyStorage?.getItem('footprints.v1');
    this.data=emptyDataset();
    if(raw!=null) {
      if(!migrateLegacy)throw new Error('缺少旧数据迁移器');
      const next=await migrateLegacy(JSON.parse(raw));
      next.meta.origin='legacy';next.meta.migration={source:'footprints.v1',status:'pending'};
      await this.commit(next);
      await this.finishMigration();
    }
    return this.getDataset();
  }
  async finishMigration() {
    await this.commit({...this.getDataset(),meta:{...this.data.meta,migration:{...this.data.meta.migration,status:'complete'}}});
  }
  async commit(next) {
    if(this.uncertain)throw new Error('上次保存未能校验，请刷新后确认数据；当前修改未保存');
    const expected=this.data?.revision ?? 0;
    next=clone(next);next.revision=expected+1;validateDataset(next);
    await this.store.write(next,expected);
    try {
      const check=await this.store.read();validateDataset(check);
      if(exportJSON(check)!==exportJSON(next))throw new Error('保存后读取校验不一致');
    } catch(error) {
      this.uncertain=true;
      throw new Error(`数据可能已写入，但校验失败，请刷新确认：${error.message}`);
    }
    this.data=next;this.notify();return this.getDataset();
  }
  update(mutator) {
    const run=this.queue.then(async()=>{
      const draft=this.getDataset();const result=await mutator(draft);
      await this.commit(draft);return result;
    });
    this.queue=run.catch(()=>{});return run;
  }
  backup() { return exportJSON(this.getDataset()); }
  restore(text) {
    // Parse/validate before joining the mutation queue; invalid backups cannot erase anything.
    const next=importJSON(text);
    const run=this.queue.then(()=>this.commit(next));this.queue=run.catch(()=>{});return run;
  }
}

// Explicitly ephemeral, used only for fictional demos and deterministic tests.
export class MemoryStore {
  constructor(value = null) { this.value=clone(value); }
  async read() { return clone(this.value); }
  async write(next,expected) {
    if((this.value?.revision ?? 0)!==expected)throw new Error('其他标签页已修改数据，请刷新后重试');
    this.value=clone(next);
  }
}
