import test from 'node:test';import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';import {MemoryThumbnailStore} from '../../src/life/media/thumbnail-store.js';
import {LibraryBackup} from '../../src/life/media/library-backup.js';import {PhotoHistoryService} from '../../src/life/media/integration.js';import {PhotoScanner} from '../../src/life/media/scanner.js';
import {cleanJPEG} from '../../src/life/story/share.js';import {THUMBNAIL_LIMITS,validateThumbnail} from '../../src/life/media/thumbnail.js';import {writeZip,readZip} from '../../src/life/media/archive.js';
import {photoFile,photoJPEG} from './photo-fixtures.mjs';
const safeBlob=()=>new Blob([cleanJPEG(photoJPEG())],{type:'image/jpeg'}),assetId='asset_'+'1'.repeat(64);
async function setup({generator={create:async()=>safeBlob(),close(){}},limits}={}){const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});const manifest=new MemoryManifest(),thumbnails=new MemoryThumbnailStore({limits:limits||THUMBNAIL_LIMITS}),scanner=new PhotoScanner(manifest,{workerFactory:null}),service=new PhotoHistoryService(repository,{manifest,scanner,thumbnails,thumbnailGenerator:generator,geonames:{reverse:async()=>null}});return {repository,manifest,thumbnails,scanner,service,backups:service.backups};}
async function importPhoto(env,retain=true){const b=await env.scanner.scan([photoFile()]),review=await env.service.createReview(b.id);review.retainThumbnails=retain;await env.service.saveReview(b.id,review);return env.service.commit(b.id,await env.service.preview(b.id));}
test('thumbnail privacy, replacement, capacity and garbage collection preserve valid existing resources',async()=>{
 await assert.rejects(validateThumbnail(new Blob([photoJPEG()])),/元数据/);await validateThumbnail(safeBlob());
 const store=new MemoryThumbnailStore({limits:{...THUMBNAIL_LIMITS,budgetBytes:safeBlob().size}});await store.put(assetId,safeBlob());await store.put(assetId,safeBlob());assert.equal((await store.stats()).count,1);
 await assert.rejects(store.put('asset_'+'2'.repeat(64),safeBlob()),/CAPACITY/);assert.equal((await store.stats()).count,1);assert.ok(await store.read(assetId));await store.gc([]);assert.equal((await store.stats()).bytes,0);
});
test('retention is opt-in, stable media IDs reconnect thumbnails, decoder failure keeps metadata and reports status',async()=>{
 const a=await setup();await importPhoto(a,false);assert.equal((await a.thumbnails.stats()).count,0);
 const result=await importPhoto(a,true);assert.equal(result.createdMemories,0);assert.equal((await a.thumbnails.stats()).count,1);const memory=a.repository.getDataset().memories[0];assert.ok(await a.thumbnails.read(memory.uri.slice(6)));
 const broken=await setup({generator:{create:async()=>{throw new Error('decode');},close(){}}});const r=await importPhoto(broken,true);assert.equal(r.createdMemories,1);assert.equal(r.thumbnailWarnings.length,1);assert.match(r.warning,/未能生成/);const [asset]=await broken.manifest.listAssets();assert.equal(asset.thumbnailStatus,'THUMBNAIL_UNAVAILABLE');assert.ok(asset.coordinates&&asset.extractedTime);assert.equal((await broken.thumbnails.stats()).count,0);
});
test('unified ZIP roundtrip checks complete graph relationships and thumbnail bytes; preview never writes',async()=>{
 const from=await setup();await importPhoto(from);const zip=await from.backups.create(),to=await setup(),before=to.repository.backup(),preview=await to.backups.inspect(zip);assert.equal(to.repository.backup(),before);assert.equal((await to.manifest.listAssets()).length,0);assert.equal(preview.summary.thumbnails,1);assert.equal(preview.conflicts.length,0);
 await to.backups.restore(preview);const data=to.repository.getDataset();assert.equal(data.memories[0].id,from.repository.getDataset().memories[0].id);assert.equal(data.trips[0].visitIds[0],data.visits[0].id);assert.deepEqual(new Uint8Array(await (await to.thumbnails.read(data.memories[0].uri.slice(6))).arrayBuffer()),new Uint8Array(await safeBlob().arrayBuffer()));assert.equal(await to.thumbnails.getJournal(),null);
});
test('metadata-only unified archives and old manifest JSON remain supported',async()=>{
 const from=await setup();await importPhoto(from,false);const zip=await from.backups.create(),to=await setup(),p=await to.backups.inspect(zip);assert.equal(p.summary.thumbnails,0);await to.backups.restore(p);assert.equal(to.repository.getDataset().memories.length,1);
 const old=await from.manifest.backup();old.version=1;await new MemoryManifest().restore(old);
});
test('tampered checksums, missing referenced thumbnail and graph/index mismatch fail before mutation',async()=>{
 const from=await setup();await importPhoto(from);const entries=await readZip(await from.backups.create()),content=[];for(const e of entries)content.push([e.path,await e.read()]);
 const to=await setup(),before=to.repository.backup();const changed=content.map(([p,b])=>[p,p==='life-dataset.json'?new TextEncoder().encode(new TextDecoder().decode(b).replace('photo.jpg','evil.jpg')):b]);await assert.rejects(to.backups.inspect(writeZip(changed)),/SHA-256/);
 await assert.rejects(to.backups.inspect(writeZip(content.filter(([p])=>!p.startsWith('thumbnails/')))),/完整性/);assert.equal(to.repository.backup(),before);assert.equal((await to.thumbnails.stats()).count,0);
});
test('newer local edits block conflicting backup restoration without any writes',async()=>{
 const from=await setup();await importPhoto(from);const zip=await from.backups.create();await from.repository.update(d=>{d.trips[0].title='new local title';});const before=from.repository.backup(),preview=await from.backups.inspect(zip);assert.ok(preview.conflicts.length);await assert.rejects(from.backups.restore(preview),/冲突/);assert.equal(from.repository.backup(),before);
});
test('manifest and canonical write failures roll back staging and leave valid old data untouched',async()=>{
 const from=await setup();await importPhoto(from);const zip=await from.backups.create();
 for(const fail of ['manifest','canonical']){const to=await setup(),p=await to.backups.inspect(zip),before=to.repository.backup();if(fail==='manifest'){const original=to.manifest.restore.bind(to.manifest);let first=true;to.manifest.restore=async data=>{if(first){first=false;throw new Error('injected manifest failure');}return original(data);};}else to.repository.store.write=async()=>{throw new Error('injected canonical failure');};
 await assert.rejects(to.backups.restore(p),/injected/);assert.equal(to.repository.backup(),before);assert.equal((await to.manifest.listAssets()).length,0);assert.equal((await to.thumbnails.stats()).count,0);assert.equal(await to.thumbnails.getJournal(),null);}
});
test('durable prepared journal rolls back pre-graph interruption and completes post-graph interruption',async()=>{
 const from=await setup();await importPhoto(from);const zip=await from.backups.create();
 for(const committed of [false,true]){const to=await setup(),p=await to.backups.inspect(zip),beforeData=to.repository.getDataset(),beforeIndex=await to.manifest.backup(),addedIds=[...p.thumbnails.keys()],operationId='interrupted';
 await to.thumbnails.setJournal({operationId,state:'prepared',beforeData,beforeIndex,targetData:p.data,targetIndex:p.index,addedIds});for(const id of addedIds)await to.thumbnails.put(id,p.thumbnails.get(id),{operationId});await to.manifest.restore(p.index);if(committed)await to.repository.restore(JSON.stringify(p.data));
 const fresh=new LibraryBackup({repository:to.repository,manifest:to.manifest,thumbnails:to.thumbnails});assert.equal(await fresh.recover(),committed?'committed':'rolled-back');assert.equal((await to.thumbnails.stats()).count,committed?1:0);assert.equal((await to.manifest.listAssets()).length,committed?1:0);assert.equal(await to.thumbnails.getJournal(),null);}
});
test('identical graph before and after restore still rolls back a pre-staging interruption',async()=>{
 const env=await setup();await importPhoto(env);const beforeData=env.repository.getDataset(),beforeIndex=await env.manifest.backup(),addedIds=[beforeData.memories[0].uri.slice(6)];await env.thumbnails.delete(addedIds[0]);
 await env.thumbnails.setJournal({operationId:'same-graph',state:'prepared',beforeData,beforeIndex,targetData:structuredClone(beforeData),targetIndex:structuredClone(beforeIndex),addedIds});
 assert.equal(await env.backups.recover(),'rolled-back');assert.equal(await env.thumbnails.getJournal(),null);assert.deepEqual(env.repository.getDataset(),beforeData);
});
test('legacy index restore cannot strand existing memories or claim missing thumbnail Blobs',async()=>{
 const env=await setup();await importPhoto(env);const original=await env.manifest.backup();await assert.rejects(env.service.restoreManifest({...original,assets:[],batches:[]}),/缺少现有/);assert.deepEqual(await env.manifest.backup(),original);
 const id=original.assets[0].assetId;await env.thumbnails.delete(id);await env.service.restoreManifest(original);const restored=await env.manifest.getAsset(id);assert.equal(restored.thumbnailReference,null);assert.equal(restored.thumbnailStatus,'THUMBNAIL_RESELECT_REQUIRED');
});
