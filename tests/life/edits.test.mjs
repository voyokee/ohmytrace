import test from 'node:test';
import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {validateDataset,upsertChapter} from '../../src/life/schema.js';
import {importCSVInto} from '../../src/life/legacy.js';
import {EditHistory,sourceSummary} from '../../src/life/edits.js';
import {applyAutoImport,nameCells,normalizeObservation,placeRenames,applyPlaceRenames,savedPhotoObservations} from '../../src/life/media/auto-import.js';

const csv=['日期,行程,地点,类型,备注,坐标',
  '2024-03-01~2024-03-02,春游,京都,旅行,,"35.01,135.76"',
  '2024-03-01~2024-03-02,春游,大阪,旅行,,"34.69,135.50"',
  '2024-04-01,再出发,京都,旅行,,"35.01,135.76"',
  '2024~至今,,深圳,现居地,,"22.54,114.05"'].join('\n');
async function setup(store=new MemoryStore()){
  const repository=new LifeRepository(store);await repository.initialize({legacyStorage:null});
  await repository.update(d=>importCSVInto(d,csv,'replace'));
  return {repository,store,history:new EditHistory(repository)};
}
const edit=(kind,id,extra)=>({type:'rename',target:{kind,id},name:'新的名字',...extra});
const entities=d=>Object.fromEntries(['places','visits','trips','residences','chapters','memories'].map(k=>[k,d[k]]));

test('renaming a city updates its derived labels, writes manual provenance and undo/redo retain identities',async()=>{
  const {repository,history}=await setup(),before=repository.getDataset(),p=before.places.find(p=>p.name==='京都');
  await history.execute(edit('place',p.id));
  let d=repository.getDataset();assert.equal(d.places.find(x=>x.id===p.id).name,'新的名字');
  assert.ok(d.visits.filter(v=>v.placeId===p.id).every(v=>v.legacy.place==='新的名字'));
  assert.equal(sourceSummary(d,d.places.find(x=>x.id===p.id)).label,'人工');
  assert.equal(history.status().canUndo,true);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
  assert.ok(repository.getDataset().evidence.some(e=>e.source?.action==='undo'),'Undo keeps an audit trail');
  await history.redo();d=repository.getDataset();assert.equal(d.places.find(x=>x.id===p.id).name,'新的名字');validateDataset(d);
  assert.deepEqual(d.places.map(p=>p.id),before.places.map(p=>p.id));
});

test('trip merge and split preserve photo/chapter relationships and each operation can be undone',async()=>{
  const {repository,history}=await setup();
  await repository.update(d=>upsertChapter(d,{title:'旅行的春天',start:'2024',end:'2024',relatedTripIds:d.trips.map(t=>t.id)}));
  const before=repository.getDataset(),[a,b]=before.trips;
  await history.execute({type:'merge',kind:'trip',ids:[a.id,b.id]});
  let d=repository.getDataset();assert.equal(d.trips.length,1);assert.equal(d.trips[0].id,a.id);
  assert.deepEqual(d.chapters[0].relatedTripIds,[a.id]);assert.ok(d.visits.filter(v=>v.tripId).every(v=>v.tripId===a.id));validateDataset(d);
  const merged=entities(d),visitId=d.trips[0].visitIds.at(-1);
  const result=await history.execute({type:'split',kind:'trip',id:a.id,visitIds:[visitId],title:'单独的旅程'});
  d=repository.getDataset();assert.equal(d.trips.length,2);assert.ok(d.chapters[0].relatedTripIds.includes(result.id));validateDataset(d);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),merged);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
  await history.redo();await history.redo();assert.equal(repository.getDataset().trips.find(t=>t.title==='单独的旅程').id,result.id);
});

test('city merge rewires every relationship and undo restores both cities without losing IDs',async()=>{
  const {repository,history}=await setup();
  await repository.update(d=>upsertChapter(d,{title:'一段人生',homeAnchors:d.places.slice(0,2).map(p=>p.id)}));
  const before=repository.getDataset(),[a,b]=before.places;
  await history.execute({type:'merge',kind:'place',ids:[a.id,b.id]});
  const d=repository.getDataset();assert.equal(d.places.length,before.places.length-1);
  assert.ok(d.visits.every(v=>v.placeId!==b.id));assert.deepEqual(d.chapters[0].homeAnchors,[a.id]);validateDataset(d);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
});

test('pass-through and transfer classifications are explicit user decisions and reversible',async()=>{
  const {repository,history}=await setup(),id=repository.getDataset().places[0].id,before=entities(repository.getDataset());
  for(const value of ['pass-through','transit']){
    await history.execute({type:'classify',target:{kind:'place',id},value});
    const d=repository.getDataset(),p=d.places.find(p=>p.id===id);
    assert.equal(p.visitType,value);assert.equal(sourceSummary(d,p).state,'manual');
    assert.ok(d.visits.filter(v=>v.placeId===id).every(v=>['路过','转机'].includes(v.legacy.type)));
    await history.undo();assert.deepEqual(entities(repository.getDataset()),before);
  }
});

test('failed writes and invalid edits never enter undo history or invalidate redo',async()=>{
  const {repository,store,history}=await setup(),p=repository.getDataset().places[0];
  await assert.rejects(history.execute(edit('place',p.id,{name:'   '})));assert.equal(history.status().canUndo,false);
  await history.execute(edit('place',p.id));await history.undo();
  const saved=repository.backup(),write=store.write.bind(store);store.write=async()=>{throw new Error('disk full');};
  await assert.rejects(history.execute(edit('place',p.id)),/disk full/);assert.equal(repository.backup(),saved);
  assert.equal(history.status().canRedo,true);store.write=write;await history.redo();
  assert.equal(repository.getDataset().places[0].name,'新的名字');
});

test('undo preserves unrelated later imports, refuses conflicting edits and serializes rapid actions',async()=>{
  const {repository,history}=await setup(),id=repository.getDataset().places[0].id;
  await Promise.all([history.execute(edit('place',id,{name:'第一版'})),history.execute(edit('place',id,{name:'第二版'}))]);
  await repository.update(d=>upsertChapter(d,{title:'后来新增的阶段'}));
  await history.undo();assert.equal(repository.getDataset().places[0].name,'第一版');assert.equal(repository.getDataset().chapters.length,1);
  await repository.update(d=>{d.places[0].name='另一个编辑器的修改';});
  const saved=repository.backup();await assert.rejects(history.undo(),/变化/);assert.equal(repository.backup(),saved);
});

test('fictional previews are read only, history cannot undo into a restored different dataset',async()=>{
  const {repository,history}=await setup(),id=repository.getDataset().places[0].id;
  await history.execute(edit('place',id));await repository.update(d=>{d.id='another_dataset';});
  await assert.rejects(history.undo(),/数据集/);
  await repository.update(d=>{d.meta.origin='demo';});await assert.rejects(history.execute(edit('place',id)),/示例/);
});

const geo={reverse:async({latitude,longitude})=>latitude>30?{country:'日本',countryCode:'JP',city:longitude>138?'东京':latitude>34.9?'京都':'大阪'}:{country:'中国',countryCode:'CN',city:'深圳'}};
async function automatic(){
  const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
  const rows=Array.from({length:8},(_,i)=>({uri:'android-media:external_primary/'+(i+1),latitude:22.54,longitude:114.05,local:'2026-01-0'+(i+1)+'T12:00:00',offsetMinutes:480}));
  rows.push({uri:'android-media:external_primary/10',latitude:35.01,longitude:135.76,local:'2026-03-01T12:00:00',offsetMinutes:540},
    {uri:'android-media:external_primary/11',latitude:34.69,longitude:135.5,local:'2026-03-02T12:00:00',offsetMinutes:540},
    {uri:'android-media:external_primary/12',latitude:35.68,longitude:139.69,local:'2026-03-03T12:00:00',offsetMinutes:540});
  const names=await nameCells(rows.map(normalizeObservation),geo);
  await repository.update(d=>applyAutoImport(d,rows,names,{now:new Date('2026-10-27')}));
  return {repository,history:new EditHistory(repository),names};
}
test('automatic relocalization and regrouping cannot overwrite manual city names or merged cities',async()=>{
  const {repository,history,names}=await automatic(),before=repository.getDataset(),cities=before.places.filter(p=>p.name!=='深圳');
  await history.execute(edit('place',cities[0].id,{name:'我的京都'}));
  assert.equal((await placeRenames(repository.getDataset(),geo)).has(cities[0].id),false);
  await history.execute({type:'merge',kind:'place',ids:cities.map(p=>p.id)});
  const merged=repository.getDataset(),ids=merged.memories.map(m=>m.id);
  await repository.update(d=>applyAutoImport(d,[],names,{force:true,now:new Date('2026-10-27')}));
  let d=repository.getDataset();assert.equal(d.places.length,2);assert.equal(d.places.find(p=>p.id===cities[0].id).name,'我的京都');
  assert.deepEqual(d.memories.map(m=>m.id),ids);assert.ok(d.memories.filter(m=>m.start.value.startsWith('2026-03')).every(m=>m.placeIds[0]===cities[0].id));
  const reopened=new LifeRepository(repository.store);await reopened.initialize({legacyStorage:null});
  assert.deepEqual(entities(reopened.getDataset()),entities(d));assert.equal(savedPhotoObservations(d).length,11);
  await history.undo();d=repository.getDataset();assert.equal(d.places.length,4,'A manual merge remains undoable after regrouping');
  assert.equal(d.places.find(p=>p.id===cities[0].id).name,'我的京都');
});

test('provenance distinguishes observation, inference, manual correction and unknown without inventing certainty',async()=>{
  const {repository}=await automatic(),d=repository.getDataset();
  assert.equal(sourceSummary(d,d.trips[0]).label,'推断');
  assert.match(sourceSummary(d,d.residences[0]).detail,/照片/);
  assert.equal(sourceSummary(d,{evidenceIds:[]}).label,'来源待确认');
  const {repository:manual}=await setup(),m=manual.getDataset();assert.equal(sourceSummary(m,m.trips[0]).label,'记录观测');
});

test('a late offline-name lookup cannot overwrite a city classified by the user',async()=>{
  const {repository,history}=await automatic(),p=repository.getDataset().places[0],stale=new Map([[p.id,{from:p.name,to:'不正确的新名字'}]]);
  await history.execute({type:'classify',target:{kind:'place',id:p.id},value:'transit'});
  await repository.update(d=>applyPlaceRenames(d,stale));
  assert.equal(repository.getDataset().places.find(x=>x.id===p.id).name,p.name);
});

test('residence/travel conversion rewires photos, keeps visits and is fully undoable',async()=>{
  const {repository,history}=await automatic(),before=repository.getDataset(),home=before.residences[0];
  await history.execute({type:'classify',target:{kind:'residence',id:home.id},value:'travel'});
  let d=repository.getDataset();assert.equal(d.residences.length,0);
  const v=d.visits.find(v=>v.id===home.visitId);assert.ok(v.tripId);assert.equal(d.memories.filter(m=>m.placeIds.includes(home.placeId)&&m.tripIds.includes(v.tripId)).length,8);validateDataset(d);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
  const trip=before.trips[0],snapshot=repository.backup();
  await assert.rejects(history.execute({type:'classify',target:{kind:'trip',id:trip.id},value:'home'}),/具体城市/);
  assert.equal(repository.backup(),snapshot);
  const city=before.places.find(p=>p.name==='京都');
  await history.execute({type:'classify',target:{kind:'place',id:city.id},value:'past'});d=repository.getDataset();
  assert.ok(d.residences.some(r=>r.placeId===city.id&&r.kind==='past'));validateDataset(d);
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
});

test('split and rename decisions survive regrouping without inventing home classification',async()=>{
  const {repository,history,names}=await automatic(),t=repository.getDataset().trips[0];
  const result=await history.execute({type:'split',kind:'trip',id:t.id,visitIds:[t.visitIds.at(-1)],title:'我的东京段'});
  await repository.update(d=>applyAutoImport(d,[],names,{force:true,now:new Date('2026-10-27')}));
  const d=repository.getDataset();assert.equal(d.trips.find(t=>t.id===result.id).title,'我的东京段');
  assert.equal(d.trips.length,2);assert.equal(d.residences.length,1);validateDataset(d);
});

test('bounded session history keeps the newest commands and readback failures expose no undo promise',async()=>{
  const {repository}=await setup(),history=new EditHistory(repository,{limit:2}),id=repository.getDataset().places[0].id;
  for(const name of ['一','二','三'])await history.execute(edit('place',id,{name}));
  assert.equal(history.status().undoCount,2);await history.undo();await history.undo();assert.equal(await history.undo(),false);
  assert.equal(repository.getDataset().places[0].name,'一');
  const {repository:other,store}=await setup(),uncertain=new EditHistory(other),read=store.read.bind(store);let calls=0;
  store.read=async()=>{if(++calls===1)throw new Error('readback failed');return read();};
  await assert.rejects(uncertain.execute(edit('trip',other.getDataset().trips[0].id)),/校验失败/);
  assert.equal(uncertain.status().canUndo,false);assert.equal(other.uncertain,true);
});

test('restored classifications and merged-city keys must remain valid canonical data',async()=>{
  const {repository}=await setup(),before=repository.getDataset();
  for(const modify of [
    d=>{d.places[0].visitType='invented';},
    d=>{d.trips[0].visitType='invented';},
    d=>{d.places[0].mergedCityKeys=['JP|京都','JP|京都'];},
    d=>{d.places[0].mergedCityKeys=[null];}
  ]){const d=structuredClone(before);modify(d);assert.throws(()=>validateDataset(d));}
});

test('large corrections keep their latest undo while older history yields to a memory budget',async()=>{
  const {repository}=await setup(),history=new EditHistory(repository,{byteBudget:1}),id=repository.getDataset().places[0].id;
  await history.execute(edit('place',id,{name:'第一版'}));await history.execute(edit('place',id,{name:'第二版'}));
  assert.equal(history.status().undoCount,1);await history.undo();
  assert.equal(repository.getDataset().places[0].name,'第一版');assert.equal(await history.undo(),false);
});

test('a synthetic 5k-photo city correction retains the latest undo and all photo IDs',async t=>{
  const {repository,history}=await automatic();
  await repository.update(d=>{
    const template=d.memories[0];
    for(let i=d.memories.length;i<5000;i++)d.memories.push({...structuredClone(template),id:'scale_photo_'+i,uri:'android-media:external_primary/'+(100+i)});
  });
  const before=repository.getDataset(),city=before.places.find(p=>p.name==='深圳'),started=performance.now();
  await history.execute(edit('place',city.id,{name:'我的常住城市'}));
  assert.ok(repository.getDataset().memories.filter(m=>m.placeIds.includes(city.id)).every(m=>m.title.startsWith('我的常住城市 · ')));
  await history.undo();assert.deepEqual(entities(repository.getDataset()),entities(before));
  t.diagnostic('Synthetic 5k edit + undo '+Math.round(performance.now()-started)+' ms on desktop Node; not Android or real-album evidence.');
});
