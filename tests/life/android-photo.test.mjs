import test from 'node:test';
import assert from 'node:assert/strict';
import {AndroidPhotoBridge,AndroidPhotoCapability} from '../../src/platform/android-photo-capability.js';
import {AndroidLibraryImporter,scanRange} from '../../src/platform/android-library-importer.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';
import {PhotoScanner} from '../../src/life/media/scanner.js';
import {PhotoHistoryService} from '../../src/life/media/integration.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {photoJPEG} from './photo-fixtures.mjs';
import {analyzePhotoFile} from '../../src/life/media/exif.js';

class Journal {
  records=new Map();
  async get(key){return structuredClone(this.records.get(key)||null);}
  async put(key,value){this.records.set(key,structuredClone(value));}
}
function library(photoCount=5){
  const photos=Array.from({length:photoCount},(_,i)=>({bytes:photoJPEG({nonce:i+1}),entry:{name:'same-name.jpg',mimeType:'image/jpeg',lastModified:1000,handle:{source:'android',scopeId:'device:full:gps',localId:String(i+1)}}}));
  for(const p of photos)p.entry.size=p.bytes.length;
  const calls=[],checkpoint={scopeId:'device:full:gps',versions:{primary:'v1'},upper:{primary:10}};
  let stop=false,failRead=false,locationGranted=true,grantLocation=true;
  const permissions=()=>({photos:'authorized',location:locationGranted?'authorized':'permission-required'});
  const bridge={async call(method,params,{signal}={}){signal?.throwIfAborted();calls.push({method,params});
    if(method==='permissionStatus')return permissions();
    if(method==='requestPermission'){if(params.location&&grantLocation)locationGranted=true;return permissions();}
    if(method==='readSamples'){if(failRead)throw new Error('PERMISSION_REVOKED');const p=photos.find(p=>p.entry.handle.localId===params.handle.localId);return {headBase64:Buffer.from(p.bytes.subarray(0,params.headLength)).toString('base64'),tailBase64:Buffer.from(p.bytes.subarray(p.bytes.length-params.tailLength)).toString('base64'),tailOffset:p.bytes.length-params.tailLength};}
    if(method==='readRange'){if(failRead)throw new Error('PERMISSION_REVOKED');const p=photos.find(p=>p.entry.handle.localId===params.handle.localId);return {base64:Buffer.from(p.bytes.subarray(params.offset,params.offset+params.length)).toString('base64')};}
    if(method==='enumerate'){if(stop)throw new Error('SIMULATED_PROCESS_STOP');const n=params.cursor||0,entries=photos.slice(n,n+2).map(p=>structuredClone(p.entry));return {entries,cursor:n+2<photos.length?n+2:null,scopeId:checkpoint.scopeId,checkpoint};}
    throw new Error(method);
  }};
  return {photos,calls,checkpoint,capability:new AndroidPhotoCapability(bridge),stop:()=>stop=true,restart:()=>stop=false,revoke:()=>failRead=true,requireLocation:({grant=true}={})=>{locationGranted=false;grantLocation=grant;}};
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

test('denied photo GPS permission stops map scanning before enumeration, batches or checkpoints',async()=>{
  const lib=library(3),s=await service(),store=new Journal();lib.requireLocation({grant:false});
  const importer=new AndroidLibraryImporter(s,lib.capability,{store});
  await assert.rejects(importer.scan(),/GPS_PERMISSION_REQUIRED/);
  assert.equal(lib.calls.filter(c=>c.method==='enumerate'||c.method==='readRange').length,0,'never read a redacted library as if originals had no GPS');
  assert.equal((await s.manifest.listBatches()).length,0);assert.equal(store.records.size,0);assert.equal(importer.running,false);
});

test('map scanning requests missing photo GPS permission before reading any original',async()=>{
  const lib=library(2),s=await service(),store=new Journal();lib.requireLocation();
  const importer=new AndroidLibraryImporter(s,lib.capability,{store}),batch=await importer.scan();
  const requested=lib.calls.findIndex(c=>c.method==='requestPermission'&&c.params.location),enumerated=lib.calls.findIndex(c=>c.method==='enumerate');
  assert.ok(requested>=0&&requested<enumerated,'GPS consent must precede all media reads');
  assert.equal(batch.assetIds.length,2);assert.ok((await s.assetsFor(batch)).every(a=>a.coordinates));
});

test('native pages do not repeatedly read the growing full library to deduplicate',async()=>{
  const lib=library(20),s=await service(),store=new Journal(),list=s.manifest.listAssets.bind(s.manifest);let fullReads=0;
  s.manifest.listAssets=async()=>{fullReads++;return list();};
  const batch=await new AndroidLibraryImporter(s,lib.capability,{store}).scan();
  assert.equal(batch.total,20);assert.ok(fullReads<=1,`full-library reads grew with pages: ${fullReads}`);
  const again=await new AndroidLibraryImporter(s,lib.capability,{store}).scan();assert.equal(again.duplicateCount,20,'one cached index still detects all earlier imports');
});

test('ordinary multi-megabyte native photos cross the bridge once each for metadata and identity samples',async()=>{
  const lib=library(3),s=await service(),store=new Journal();
  for(const p of lib.photos){const bytes=new Uint8Array(3*1024*1024);bytes.set(p.bytes);bytes[bytes.length-1]=+p.entry.handle.localId;p.bytes=bytes;p.entry.size=bytes.length;}
  const expected=await Promise.all(lib.photos.map(p=>analyzePhotoFile(new File([p.bytes],p.entry.name,{lastModified:p.entry.lastModified}))));
  const batch=await new AndroidLibraryImporter(s,lib.capability,{store}).scan();assert.deepEqual(batch.assetIds,expected.map(a=>a.assetId),'sample optimization preserves content identity');
  const reads=lib.calls.filter(c=>['readRange','readSamples'].includes(c.method));assert.equal(reads.length,3,'one original open/bridge transfer per normal photo');
  assert.ok(batch.assetIds.every(id=>!s.scanner.fileFor(id).sampleRanges?.length),'sample bytes must be released after analysis, never retained for the whole library');
});
