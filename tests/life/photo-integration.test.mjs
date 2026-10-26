import test from 'node:test';import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {emptyDataset,upsertChapter,exportJSON,importJSON} from '../../src/life/schema.js';
import {importCSVInto,updatePlace,datasetRows,reconcileRows} from '../../src/life/legacy.js';
import {RendererAdapter} from '../../src/life/renderer-adapter.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';import {PhotoScanner} from '../../src/life/media/scanner.js';
import {PhotoHistoryService,buildPhotoPlan} from '../../src/life/media/integration.js';import {editCandidate,editVisitName} from '../../src/life/media/reconstruction.js';
import {photoFile} from './photo-fixtures.mjs';
async function setup(){const store=new MemoryStore(),repository=new LifeRepository(store);await repository.initialize({legacyStorage:null});const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null}),service=new PhotoHistoryService(repository,{manifest,scanner});return {store,repository,manifest,scanner,service};}
async function reviewFiles(env,files){const batch=await env.scanner.scan(files),review=await env.service.createReview(batch.id);return {batch,review};}

test('scan and dry run do not mutate canonical data; one confirmation writes a complete v1 graph',async()=>{
  const env=await setup(),before=env.repository.backup(),{batch,review}=await reviewFiles(env,[photoFile(),photoFile({lat:30,lon:120,time:'2025:05:02 11:00:00',nonce:1}),photoFile({lat:null,lon:null,nonce:2})]);
  const preview=await env.service.preview(batch.id);assert.equal(env.repository.backup(),before);assert.equal(env.store.value,null);
  assert.equal(preview.summary.createTrips,1);assert.equal(preview.summary.createMemories,3);assert.equal(preview.summary.unlocatedMemories,1);
  const real=env.store.write.bind(env.store);let writes=0;env.store.write=async(...a)=>{writes++;return real(...a);};
  const result=await env.service.commit(batch.id,preview),d=env.repository.getDataset();assert.equal(writes,1);assert.equal(result.createdMemories,3);
  assert.equal(d.schemaVersion,1);assert.equal(d.trips.length,1);assert.equal(d.visits.length,2);assert.equal(d.residences.length,0);assert.equal(d.chapters.length,0);
  assert.equal(d.trips[0].start.precision,'unknown');assert.equal(d.trips[0].end.precision,'unknown');
  assert.ok(d.memories.find(m=>m.title==='photo.jpg'&&m.placeIds.length===0));assert.deepEqual(importJSON(exportJSON(d)),d);
  const adapter=new RendererAdapter(env.repository),snapshot=adapter.getRenderSnapshot();assert.equal(snapshot.trips[0].year,2025);assert.equal(snapshot.trips[0].inferredConnections,true);assert.equal(snapshot.trips[0].date.days,null);
  assert.match(snapshot.trips[0].date.label,/旅行起止未完全确认/);adapter.dispose();
  assert.equal((await env.manifest.getBatch(batch.id)).status,'committed');assert.ok((await env.manifest.listAssets()).every(a=>a.linkedMemoryId));
});
test('repeat and renamed-file imports never duplicate canonical records or rewrite a no-op dataset',async()=>{
  const env=await setup(),file=photoFile(),first=await reviewFiles(env,[file]);await env.service.commit(first.batch.id,await env.service.preview(first.batch.id));
  const before=env.repository.backup(),second=await reviewFiles(env,[new File([file],'renamed.jpg',{type:'image/jpeg',lastModified:456})]);
  const preview=await env.service.preview(second.batch.id);assert.equal(preview.summary.createMemories,0);assert.equal(preview.summary.createTrips,0);
  await env.service.commit(second.batch.id,preview);assert.equal(env.repository.backup(),before);assert.equal((await env.manifest.listAssets()).length,1);
});
test('CSV match appends evidence and memories while preserving manual fields, place corrections and Chapter associations',async()=>{
  const env=await setup();await env.repository.update(d=>{
    importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2025-05-01~2025-05-03,CSV 旅行,北京,旅行,我的手动备注,"39.9,116.4"');
    updatePlace(d,d.places[0].id,{lat:39.90001,lon:116.40001,status:'confirmed',label:'用户校正'});
    upsertChapter(d,{title:'硕士',start:'2024',end:'2026'});upsertChapter(d,{title:'实习',start:'2025',end:'2025'});
  });
  const before=env.repository.getDataset(),{batch,review}=await reviewFiles(env,[photoFile()]);assert.equal(review.candidates[0].action,'link');
  editCandidate(review,review.candidates[0].id,{title:'不应覆盖 CSV',chapterIds:before.chapters.map(c=>c.id)});await env.service.saveReview(batch.id,review);
  await env.service.commit(batch.id,await env.service.preview(batch.id));const d=env.repository.getDataset();
  assert.deepEqual(d.places,before.places);assert.equal(d.trips.length,1);assert.equal(d.visits.length,1);assert.deepEqual(d.trips[0],before.trips[0]);assert.deepEqual(d.visits[0].legacy,before.visits[0].legacy);
  assert.ok(d.chapters.every(c=>c.relatedTripIds.includes(before.trips[0].id)&&c.memoryIds.includes(d.memories[0].id)));
  assert.ok(d.evidence.some(e=>e.state==='manual'&&e.source.kind==='photo-review'&&e.source.manualChanges.length));
  const next=await reviewFiles(env,[photoFile({time:'2025:05:02 10:30:00',nonce:8})]);await env.service.commit(next.batch.id,await env.service.preview(next.batch.id));assert.equal(env.repository.getDataset().trips.length,1);assert.equal(env.repository.getDataset().memories.length,2);
});
test('recovery after canonical commit and manifest acknowledgement failure is exactly once',async()=>{
  const env=await setup(),{batch}=await reviewFiles(env,[photoFile()]);const real=env.manifest.acknowledge.bind(env.manifest);env.manifest.acknowledge=async()=>{throw new Error('quota');};
  const result=await env.service.commit(batch.id,await env.service.preview(batch.id));assert.match(result.warning,/人生数据已保存/);
  assert.equal(env.repository.getDataset().memories.length,1);assert.equal((await env.manifest.getBatch(batch.id)).commitState,'prepared');
  env.manifest.acknowledge=real;const restarted=new LifeRepository(env.store);await restarted.initialize({legacyStorage:null});
  const service=new PhotoHistoryService(restarted,{manifest:env.manifest});await service.recover();assert.equal((await env.manifest.getBatch(batch.id)).status,'committed');
  await service.commit(batch.id,await service.preview(batch.id));assert.equal(restarted.getDataset().memories.length,1);assert.equal(restarted.getDataset().trips.length,1);
});
test('prepare/write failure and stale preview cannot partially alter committed canonical data',async()=>{
  const env=await setup(),{batch}=await reviewFiles(env,[photoFile()]),preview=await env.service.preview(batch.id),before=env.repository.backup();
  const put=env.manifest.putBatch.bind(env.manifest);env.manifest.putBatch=async()=>{throw new Error('manifest quota');};await assert.rejects(env.service.commit(batch.id,preview),/manifest quota/);assert.equal(env.repository.backup(),before);
  env.manifest.putBatch=put;const write=env.store.write.bind(env.store);env.store.write=async()=>{throw new Error('canonical aborted');};await assert.rejects(env.service.commit(batch.id,preview),/canonical aborted/);assert.equal(env.repository.backup(),before);
  env.store.write=write;await env.repository.update(d=>upsertChapter(d,{title:'新阶段'}));await assert.rejects(env.service.commit(batch.id,preview),/重新预览/);
  await env.service.commit(batch.id,await env.service.preview(batch.id));assert.equal(env.repository.getDataset().memories.length,1);
});
test('legacy row edits and CSV append preserve photo Trip unknown boundaries and stable IDs',async()=>{
  const env=await setup(),{batch}=await reviewFiles(env,[photoFile()]);await env.service.commit(batch.id,await env.service.preview(batch.id));
  const before=env.repository.getDataset(),rows=datasetRows(before);rows[0].note='编辑照片观测备注';
  await env.repository.update(d=>reconcileRows(d,rows,{manual:true}));const after=env.repository.getDataset();assert.equal(after.trips[0].id,before.trips[0].id);assert.equal(after.trips[0].start.precision,'unknown');assert.equal(after.memories[0].tripIds[0],after.trips[0].id);
  await env.repository.update(d=>importCSVInto(d,'日期,行程,地点,坐标\n2026,新 CSV,上海,"31,121"'));
  assert.equal(env.repository.getDataset().trips.find(t=>t.id===before.trips[0].id).start.precision,'unknown');
});
test('demo data is removed only on confirmed photo commit; missing GPS stays off the map',async()=>{
  const env=await setup();env.repository.data=emptyDataset('demo');importCSVInto(env.repository.data,'日期,行程,地点,坐标\n2020,虚构,虚构地点,"10,20"');env.repository.data.meta.origin='demo';
  const before=env.repository.backup(),{batch}=await reviewFiles(env,[photoFile({lat:null,lon:null})]);const preview=await env.service.preview(batch.id);assert.equal(env.repository.backup(),before);
  await env.service.commit(batch.id,preview);const d=env.repository.getDataset();assert.equal(d.places.length,0);assert.equal(d.visits.length,0);assert.equal(d.trips.length,0);assert.equal(d.memories.length,1);assert.equal(d.meta.origin,'user');
});
test('restored review cannot turn observation date edits into fake EXIF evidence',async()=>{
  const env=await setup(),{batch,review}=await reviewFiles(env,[photoFile()]),before=env.repository.backup();
  review.candidates[0].visits[0].observedStart='2000-01-01';await env.service.saveReview(batch.id,review);
  await assert.rejects(env.service.preview(batch.id),/观测日期/);assert.equal(env.repository.backup(),before);
});
test('a fresh browser can resume saved review after reload without persisting canonical data before confirmation',async()=>{
  const env=await setup(),{batch}=await reviewFiles(env,[photoFile()]);assert.equal(env.store.value,null);
  const restarted=new LifeRepository(env.store);await restarted.initialize({legacyStorage:null});assert.notEqual(restarted.getDataset().id,env.repository.getDataset().id);
  const resumed=new PhotoHistoryService(restarted,{manifest:env.manifest});await resumed.recover();const preview=await resumed.preview(batch.id);assert.equal(env.store.value,null);
  await resumed.commit(batch.id,preview);assert.equal(restarted.getDataset().memories.length,1);assert.equal(restarted.getDataset().trips.length,1);
});
