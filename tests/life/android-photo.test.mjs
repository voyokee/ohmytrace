import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidPhotoBridge,AndroidPhotoCapability} from '../../src/platform/android-photo-capability.js';
import {AndroidLibraryImporter,scanRange} from '../../src/platform/android-library-importer.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';
import {PhotoScanner} from '../../src/life/media/scanner.js';
import {PhotoHistoryService} from '../../src/life/media/integration.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {photoJPEG} from './photo-fixtures.mjs';

class Journal {
  records=new Map();
  async get(key){return structuredClone(this.records.get(key)||null);}
  async put(key,value){this.records.set(key,structuredClone(value));}
}
function library(photoCount=5){
  const photos=Array.from({length:photoCount},(_,i)=>({bytes:photoJPEG({nonce:i+1}),entry:{name:'same-name.jpg',mimeType:'image/jpeg',lastModified:1000,handle:{source:'android',scopeId:'device:full:gps',localId:String(i+1)}}}));
  for(const p of photos)p.entry.size=p.bytes.length;
  const calls=[],checkpoint={scopeId:'device:full:gps',versions:{primary:'v1'},upper:{primary:10}};
  let stop=false,failRead=false;
  const bridge={async call(method,params,{signal}={}){signal?.throwIfAborted();calls.push({method,params});
    if(method==='readRange'){if(failRead)throw new Error('PERMISSION_REVOKED');const p=photos.find(p=>p.entry.handle.localId===params.handle.localId);return {base64:Buffer.from(p.bytes.subarray(params.offset,params.offset+params.length)).toString('base64')};}
    if(method==='enumerate'){if(stop)throw new Error('SIMULATED_PROCESS_STOP');const n=params.cursor||0,entries=photos.slice(n,n+2).map(p=>structuredClone(p.entry));return {entries,cursor:n+2<photos.length?n+2:null,scopeId:checkpoint.scopeId,checkpoint};}
    throw new Error(method);
  }};
  return {photos,calls,checkpoint,capability:new AndroidPhotoCapability(bridge),stop:()=>stop=true,restart:()=>stop=false,revoke:()=>failRead=true};
}
async function service(){const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null});return new PhotoHistoryService(repository,{manifest,scanner,geonames:{async reverse(){return null;}}});}

test('native album pages use original bounded ranges and feed existing review/commit with collision-safe file identities',async()=>{
  const lib=library(),s=await service(),store=new Journal(),importer=new AndroidLibraryImporter(s,lib.capability,{store});
  const batch=await importer.scan({range:scanRange('2025-01-01','2026-01-01')});
  assert.equal(batch.total,5);assert.equal(batch.assetIds.length,5);assert.equal(s.repository.getDataset().memories.length,0,'scan cannot commit canonical data');
  const active=await importer.latest();assert.equal(new Set(active.files.map(e=>e.assetId)).size,5,'equal names/sizes/mtime must not alias handles');
  for(const e of active.files){const file=s.scanner.fileFor(e.assetId);assert.equal(file.nativeHandle.localId,e.handle.localId);}
  assert.deepEqual(await store.get(active.key),lib.checkpoint);assert.ok(lib.calls.filter(c=>c.method==='readRange').every(c=>c.params.length<=262144));
  await s.createReview(batch.id);const preview=await s.preview(batch.id);await s.commit(batch.id,preview);assert.equal(s.repository.getDataset().memories.length,5);
  const again=await importer.scan({range:active.range});assert.equal(again.duplicateCount,5);await s.createReview(again.id);await s.commit(again.id,await s.preview(again.id));assert.equal(s.repository.getDataset().memories.length,5);
});

test('process interruption resumes at durable page and recovers native handles after reopening',async()=>{
  const lib=library(),s=await service(),store=new Journal(),first=new AndroidLibraryImporter(s,lib.capability,{store});
  await assert.rejects(first.scan({onProgress:p=>{if(p.phase==='scanning'&&p.processed===2)lib.stop();}}),/SIMULATED_PROCESS_STOP/);
  const before=await first.latest();assert.equal(before.cursor,2);assert.equal(before.status,'interrupted');assert.equal(await store.get(before.key),null,'no checkpoint for incomplete range');
  lib.restart();s.scanner.clearFiles();const second=new AndroidLibraryImporter(s,lib.capability,{store}),batch=await second.scan({resume:true});
  assert.equal(batch.total,5);assert.equal(batch.assetIds.length,5);assert.ok(batch.assetIds.every(id=>s.scanner.fileFor(id)?.nativeHandle));
  const pages=lib.calls.filter(c=>c.method==='enumerate').map(c=>c.params.cursor);assert.deepEqual(pages,[null,2,2,4]);
});

test('crash after aggregate persistence but before journal advancement replays a page without doubling totals',async()=>{
  const lib=library(3),s=await service(),store=new Journal(),put=store.put.bind(store);let stopped=false;
  store.put=async(key,value)=>{if(key==='active'&&(stopped||value.cursor===2&&!value.pending)){stopped=true;throw new Error('JOURNAL_IO_FAILURE');}return put(key,value);};
  const importer=new AndroidLibraryImporter(s,lib.capability,{store});await assert.rejects(importer.scan(),/JOURNAL_IO_FAILURE/);
  const durable=await store.get('active');assert.ok(durable.pending);assert.equal(durable.cursor,null);store.put=put;
  const recovered=new AndroidLibraryImporter(s,lib.capability,{store}),batch=await recovered.scan({resume:true});assert.equal(batch.total,3);assert.equal(batch.assetIds.length,3);
});

test('metadata read failure never advances the incremental checkpoint; revoked handles remain explicit failures',async()=>{
  const lib=library(2),s=await service(),store=new Journal(),importer=new AndroidLibraryImporter(s,lib.capability,{store});lib.revoke();
  const batch=await importer.scan();assert.equal(batch.failureCount,2);const state=await importer.latest();assert.equal(await store.get(state.key),null);assert.equal(s.repository.getDataset().memories.length,0);
});

test('native cancellation leaves a resumable page and no checkpoint, then succeeds with new importer',async()=>{
  const lib=library(4),s=await service(),store=new Journal(),first=new AndroidLibraryImporter(s,lib.capability,{store});
  await assert.rejects(first.scan({onProgress:p=>{if(p.processed===1)first.cancel();}}),/abort/i);assert.equal(first.running,false);
  const state=await first.latest();assert.equal(await store.get(state.key),null);assert.equal(state.status,'interrupted');
  const next=new AndroidLibraryImporter(s,lib.capability,{store}),batch=await next.scan({resume:true});assert.equal(batch.total,4);assert.equal(batch.assetIds.length,4);
});

test('bridge correlates asynchronous replies and cancellation clears outstanding work',async()=>{
  const messages=[],port={postMessage(text){messages.push(JSON.parse(text));}},bridge=new AndroidPhotoBridge(port);
  const a=bridge.call('a'),b=bridge.call('b');port.onmessage({data:JSON.stringify({id:'2',result:'second'})});port.onmessage({data:JSON.stringify({id:'1',result:'first'})});assert.deepEqual(await Promise.all([a,b]),['first','second']);
  const controller=new AbortController(),pending=bridge.call('readRange',{}, {signal:controller.signal});controller.abort();await assert.rejects(pending,/abort/i);assert.equal(bridge.pending.size,0);assert.equal(messages.at(-1).method,'cancel');
});

test('native ranges are half open and malformed or reversed dates fail before acquisition',()=>{
  assert.deepEqual(scanRange(),{startMs:null,endMs:null});assert.throws(()=>scanRange('invalid'),/时间无效/);assert.throws(()=>scanRange('2026-01-01','2025-01-01'),/结束时间/);
});
