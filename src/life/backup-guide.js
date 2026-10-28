const DAY=86400000;
const present=data=>data?.meta.origin!=='demo'&&!!(data?.places.length||data?.memories.length);
export class BackupGuide {
 constructor({settings,storageManager=globalThis.navigator?.storage,now=Date.now,onReminder=()=>{}}){this.settings=settings;this.manager=storageManager;this.now=now;this.onReminder=onReminder;}
 state(){const s=this.settings.get('backup',{});return s&&typeof s==='object'&&!Array.isArray(s)?s:{};}
 save(state){this.settings.set('backup',state);}
 view(data){const s=this.state(),last=s.lastBackup&&Number.isFinite(s.lastBackup.at)&&Number.isFinite(s.lastBackup.bytes)?s.lastBackup:null,dirty=present(data)&&(!last||last.id!==data.id||last.revision!==data.revision);return {lastBackup:last,dirty,reminder:!!s.pending&&dirty&&!(s.snoozeUntil>this.now())};}
 check(data){
  const s=this.state(),v=this.view(data),now=this.now();if(!Number.isFinite(s.firstImportAt)||!v.dirty||s.snoozeUntil>now||s.pending)return v;
  const stale=!v.lastBackup||now-v.lastBackup.at>30*DAY,due=s.lastReminderAt==null||Number.isFinite(s.snoozeUntil)&&now>=s.snoozeUntil||v.lastBackup&&s.lastReminderAt<v.lastBackup.at+30*DAY;
  if(stale&&due){s.pending=true;s.lastReminderAt=now;s.snoozeUntil=null;this.save(s);this.onReminder('建议现在备份一次');}return this.view(data);
 }
 async importCommitted(data){
  if(!present(data))return;const s=this.state();if(!Number.isFinite(s.firstImportAt))s.firstImportAt=this.now();
  const request=!s.persistRequested;s.persistRequested=true;this.save(s);this.check(data);
  if(request){let protectedData=false;try{protectedData=!!(await this.manager?.persist?.());}catch{/* A denied request must not block a successful import. */}this.save({...this.state(),protected:protectedData});}
 }
 markBackup(data,bytes){const s=this.state();s.lastBackup={at:this.now(),bytes,id:data.id,revision:data.revision};s.pending=false;s.snoozeUntil=null;s.lastReminderAt=null;this.save(s);}
 snooze(){const s=this.state();s.pending=false;s.snoozeUntil=this.now()+7*DAY;this.save(s);}
 async storageInfo(){let protectedData=!!this.state().protected,estimate={};try{if(this.manager?.persisted)protectedData=!!(await this.manager.persisted());}catch{/* The last successful persist result is still informative. */}try{estimate=await this.manager?.estimate?.()||{};}catch{/* Storage estimates are optional. */}return {protected:protectedData,usage:Number.isFinite(estimate.usage)?estimate.usage:null,quota:Number.isFinite(estimate.quota)?estimate.quota:null};}
}
