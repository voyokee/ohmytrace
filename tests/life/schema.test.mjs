import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDataset, partialDate, dateBound, validateDataset, validatePeriod, upsertChapter, deleteChapter, exportJSON, importJSON, ongoingDate } from '../../src/life/schema.js';
import { LifeRepository, MemoryStore } from '../../src/life/repository.js';

test('partial dates never acquire fictional precision; unknown and ongoing are distinct',()=>{
  for(const [text,precision] of [['2020','year'],['2020-02','month'],['2020-02-29','day'],['','unknown']])assert.equal(partialDate(text).precision,precision);
  assert.equal(partialDate('').value,null);assert.deepEqual(partialDate('至今',{end:true}),ongoingDate());
  assert.throws(()=>partialDate('2021-02-29'));assert.throws(()=>partialDate('2020-13'));
  assert.equal(new Date(dateBound(partialDate('2020-02'),true)).toISOString().slice(0,10),'2020-02-29');
  assert.throws(()=>validatePeriod(partialDate('2026'),partialDate('2024')));
});
test('overlapping Chapters, ongoing periods and deletion preserve unrelated data',()=>{
  const d=emptyDataset();
  const id=upsertChapter(d,{title:'新加坡硕士',type:'study',start:'2024',end:'2026'});
  upsertChapter(d,{title:'北京实习',type:'work',start:'2025',end:'2025'});
  upsertChapter(d,{title:'深圳工作',type:'work',start:'2026',end:'至今'});
  assert.equal(d.chapters.length,3);assert.equal(validateDataset(d),d);
  const other=d.chapters[1].id;deleteChapter(d,id);assert.equal(d.chapters[0].id,other);
  assert.deepEqual(importJSON(exportJSON(d)),d);
});
test('version and references are checked before restore; failed writes retain committed state',async()=>{
  const store=new MemoryStore(),repo=new LifeRepository(store);await repo.initialize({legacyStorage:null});
  await repo.update(d=>upsertChapter(d,{title:'A',start:'2024',end:''}));
  const before=repo.backup();
  assert.throws(()=>repo.restore('{"schemaVersion":99}'));
  store.write=async()=>{throw new Error('quota');};
  await assert.rejects(repo.update(d=>upsertChapter(d,{title:'B',start:'2025',end:''})),/quota/);
  assert.equal(repo.backup(),before);
  const bad=JSON.parse(before);bad.chapters[0].relatedTripIds=['missing'];assert.throws(()=>validateDataset(bad));
});
test('serialized writers preserve updates and stable IDs across restart',async()=>{
  const store=new MemoryStore(),repo=new LifeRepository(store);await repo.initialize({legacyStorage:null});
  await Promise.all(['A','B'].map(title=>repo.update(d=>upsertChapter(d,{title,start:'2024',end:'2026'}))));
  const restarted=new LifeRepository(store);await restarted.initialize({legacyStorage:null});assert.deepEqual(restarted.getDataset(),repo.getDataset());
  const id=restarted.getDataset().chapters[0].id;
  await restarted.update(d=>upsertChapter(d,{...d.chapters[0],title:'renamed'}));
  assert.equal(restarted.getDataset().chapters[0].id,id);
});
test('readback failure is explicit and prevents unverified subsequent writes',async()=>{
  const store=new MemoryStore(),repo=new LifeRepository(store);await repo.initialize({legacyStorage:null});
  store.read=async()=>{throw new Error('read failure');};
  await assert.rejects(repo.update(d=>upsertChapter(d,{title:'A'})),/校验失败/);
  assert.equal(repo.getDataset().chapters.length,0);
  await assert.rejects(repo.update(d=>upsertChapter(d,{title:'B'})),/刷新/);
  delete store.read;const recovered=new LifeRepository(store);await recovered.initialize({legacyStorage:null});
  assert.equal(recovered.getDataset().chapters[0].title,'A');
});
