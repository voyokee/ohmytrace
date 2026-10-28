import test from 'node:test';import assert from 'node:assert/strict';
import {LocalSettings} from '../../src/life/local-settings.js';import {BackupGuide} from '../../src/life/backup-guide.js';
const day=86400000,data=()=>({id:'dataset-a',revision:1,meta:{origin:'user'},places:[{id:'p'}],memories:[]});
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};}
test('settings survive storage denial and malformed contents without changing canonical data',()=>{
 const denied=new LocalSettings({storage:{getItem(){throw Error('denied');},setItem(){throw Error('quota');}}});assert.equal(denied.get('timelineMode','year'),'year');assert.equal(denied.set('timelineMode','life'),false);assert.equal(denied.get('timelineMode','year'),'life');
 const bad=new LocalSettings({storage:{getItem:()=>'{bad'}});assert.deepEqual(bad.get('backup',{}),{});
});
test('a blocked localStorage getter is handled before reading preferences',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('storage access blocked');}});
 try{assert.doesNotThrow(()=>new LocalSettings());}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('persistence is requested once after a successful meaningful import, never on construction or empty data',async()=>{
 let calls=0;const manager={persist:async()=>{calls++;return true;},estimate:async()=>({usage:100,quota:1000})},store=storage(),settings=new LocalSettings({storage:store}),g=new BackupGuide({settings,storageManager:manager});
 assert.equal(calls,0);await g.importCommitted({...data(),places:[]});assert.equal(calls,0);const d=data(),before=structuredClone(d);await g.importCommitted(d);await g.importCommitted({...d,revision:2});assert.equal(calls,1);assert.equal((await g.storageInfo()).protected,true);assert.equal((await g.storageInfo()).usage,100);assert.deepEqual(d,before);
 await new BackupGuide({settings:new LocalSettings({storage:store}),storageManager:manager}).importCommitted(d);assert.equal(calls,1,'reload must not request again');
});
test('first reminder, changed data after 30 days, seven-day snooze and successful backup are non-blocking and durable',async()=>{
 let now=1000,notices=0;const store=storage(),settings=new LocalSettings({storage:store}),g=new BackupGuide({settings,now:()=>now,onReminder:()=>notices++}),d=data();await g.importCommitted(d);assert.equal(notices,1);assert.equal(g.view(d).reminder,true);g.check(d);assert.equal(notices,1);
 g.markBackup(d,2048);assert.equal(g.view(d).dirty,false);assert.equal(g.view(d).reminder,false);assert.equal(g.view(d).lastBackup.bytes,2048);now+=31*day;g.check(d);assert.equal(notices,1,'age alone is not a reason to warn');d.revision++;g.check(d);assert.equal(notices,2);g.check(d);assert.equal(notices,2);
 g.snooze();assert.equal(g.view(d).reminder,false);now+=6*day;g.check(d);assert.equal(notices,2);now+=day+1;g.check(d);assert.equal(notices,3);assert.equal(g.view(d).reminder,true);
 const restored=new BackupGuide({settings:new LocalSettings({storage:store}),now:()=>now});assert.equal(restored.view(d).lastBackup.bytes,2048);assert.equal(restored.view(d).dirty,true);
 g.markBackup(d,4096);assert.equal(g.view(d).reminder,false);assert.equal(g.view(d).dirty,false);
});
test('rejected persistence and missing storage APIs preserve usable backup guidance',async()=>{
 const g=new BackupGuide({settings:new LocalSettings({storage:null}),storageManager:{persist:async()=>{throw Error('blocked');},estimate:async()=>{throw Error('unsupported');}}});await g.importCommitted(data());assert.equal((await g.storageInfo()).protected,false);assert.equal(g.view(data()).reminder,true);
 const absent=new BackupGuide({settings:new LocalSettings({storage:null}),storageManager:null});await absent.importCommitted(data());assert.equal((await absent.storageInfo()).protected,false);
});
