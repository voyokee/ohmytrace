import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDataset,upsertChapter,deleteChapter,exportJSON,importJSON,addMemory} from '../../src/life/schema.js';
import {importCSVInto,exportLegacyCSV,migrateLegacy,datasetRows,reconcileRows,updatePlace,parseLegacyPeriod,parseLegacyCSV} from '../../src/life/legacy.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
const CSV='日期,行程,地点,类型,备注,坐标\n2024~2026,,新加坡,现居地,,"1.3,103.8"\n2025-05,北京实习,公园,旅行,第一站,"39,116"\n2025-05,北京实习,公园,旅行,第二站,"40,117"\n2026,重访,公园,旅行,,"39,116"\n,无日期,未知,旅行,,\n';
test('real CSV import removes every fictional demo entity and source',()=>{
  const d=emptyDataset();importCSVInto(d,'日期,行程,地点,坐标\n2020,虚构旅行,虚构地点,"10,20"');d.meta.origin='demo';
  const demoIds=new Set([...d.places,...d.visits,...d.trips,...d.evidence].map(e=>e.id));
  importCSVInto(d,CSV,'append');
  assert.equal(d.places.length,4,'only real CSV places may enter the persisted dataset');
  for(const entities of [d.places,d.visits,d.trips,d.evidence])assert.ok(entities.every(e=>!demoIds.has(e.id)),'fictional entities must not survive real import');
});
test('legacy CSV preserves visits, homonyms, partial and unknown dates and axis convention',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');
  assert.equal(d.trips.length,3);assert.equal(d.residences.length,1);assert.equal(d.visits.length,5);assert.equal(d.places.length,4);
  assert.notEqual(d.visits[1].placeId,d.visits[2].placeId);assert.equal(d.visits[1].placeId,d.visits[3].placeId);
  assert.equal(d.visits[1].start.precision,'month');assert.equal(d.visits[4].start.precision,'unknown');
  assert.deepEqual(d.places[1].coordinates,{latitude:39,longitude:116});
  const parsed=parseLegacyCSV('place,coord\n北京,"116,39"');assert.equal(parsed.swapped,1);assert.deepEqual(parsed.rows[0]._coordinates,{latitude:39,longitude:116});
  assert.throws(()=>parseLegacyCSV('place,lat,lon\n北京,116,39'),/不交换/);
  assert.equal(parseLegacyPeriod('2020-02-01~03').end.value,'2020-02-03');assert.equal(parseLegacyPeriod('2026~至今').end.precision,'ongoing');
});
test('append deduplicates exact rows; CSV extended IDs and JSON roundtrip preserve identity',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');const before=datasetRows(d);
  importCSVInto(d,CSV);assert.deepEqual(datasetRows(d),before);
  const other=emptyDataset();importCSVInto(other,exportLegacyCSV(d),'replace');
  assert.deepEqual(datasetRows(other),before);assert.deepEqual(other.trips.map(t=>t.id),d.trips.map(t=>t.id));
  assert.deepEqual(importJSON(exportJSON(d)),d);
});
test('editing, correction, multi-Chapter relationships and deletion preserve IDs',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');const trip=d.trips[0].id,place=d.places[1].id,visit=d.visits[1].id;
  const a=upsertChapter(d,{title:'硕士',start:'2024',end:'2026',relatedTripIds:[trip],homeAnchors:[d.places[0].id]});
  upsertChapter(d,{title:'实习',start:'2025',end:'2025',relatedTripIds:[trip]});
  const memory=addMemory(d,{kind:'note',tripIds:[trip]});d.chapters[0].memoryIds.push(memory);
  const rows=datasetRows(d);rows[1].note='修订';rows[1].trip='改名';reconcileRows(d,rows,{manual:true});
  updatePlace(d,place,{lat:39.1,lon:116.1,status:'confirmed'});
  assert.equal(d.visits[1].id,visit);assert.equal(d.trips[0].id,trip);assert.equal(d.chapters[1].relatedTripIds[0],trip);
  assert.ok(d.evidence.some(e=>e.state==='manual'&&e.revisions.some(r=>r.before?.note==='第一站')));
  const counts=[d.trips.length,d.places.length,d.visits.length];deleteChapter(d,a);
  assert.deepEqual([d.trips.length,d.places.length,d.visits.length],counts);assert.equal(d.memories[0].id,memory);
  assert.deepEqual(importJSON(exportJSON(d)),d);
});
const legacy={rows:[{date:'2025-05',trip:'北京实习',place:'北京',type:'旅行',note:''}],places:{北京:{lat:39,lon:116,status:'confirmed'}}};
test('migration is idempotent, preserves old storage, and separates empty vs new browsers',async()=>{
  let reads=0;const storage={getItem:()=>{reads++;return JSON.stringify(legacy);},setItem:()=>{throw new Error('must not modify legacy');}};
  const store=new MemoryStore(),repo=new LifeRepository(store);await repo.initialize({legacyStorage:storage,migrateLegacy});
  const first=repo.getDataset();assert.equal(first.meta.migration.status,'complete');
  const restart=new LifeRepository(store);await restart.initialize({legacyStorage:storage,migrateLegacy});assert.deepEqual(restart.getDataset(),first);assert.equal(reads,1);
  const empty=new LifeRepository(new MemoryStore());await empty.initialize({legacyStorage:{getItem:()=>JSON.stringify({rows:[],places:{}})},migrateLegacy});
  assert.equal(empty.getDataset().meta.origin,'legacy');assert.equal(empty.getDataset().visits.length,0);
  const fresh=new LifeRepository(new MemoryStore());await fresh.initialize({legacyStorage:{getItem:()=>null},migrateLegacy});assert.equal(fresh.getDataset().meta.origin,'new');
});
test('interrupted migration resumes validated persisted data without duplicate entities',async()=>{
  const store=new MemoryStore(),write=store.write.bind(store);let writes=0;
  store.write=async(...args)=>{if(++writes===2)throw new Error('quota');return write(...args);};
  const repo=new LifeRepository(store);const opts={legacyStorage:{getItem:()=>JSON.stringify(legacy)},migrateLegacy};
  await assert.rejects(repo.initialize(opts),/quota/);assert.equal(store.value.meta.migration.status,'pending');const ids=store.value.visits.map(v=>v.id);
  delete store.write;const restart=new LifeRepository(store);await restart.initialize(opts);
  assert.equal(restart.getDataset().meta.migration.status,'complete');assert.deepEqual(restart.getDataset().visits.map(v=>v.id),ids);
});
test('legacy access, corrupt data, write and stale-tab errors never become successful empty/demo loads',async()=>{
  for(const storage of [{getItem:()=>{throw new Error('denied');}},{getItem:()=>'{broken'},{getItem:()=>'{"rows":true}'}]){
    const store=new MemoryStore(),repo=new LifeRepository(store);await assert.rejects(repo.initialize({legacyStorage:storage,migrateLegacy}));assert.equal(store.value,null);
  }
  const store=new MemoryStore(),repo=new LifeRepository(store);await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,CSV));
  const stale=new LifeRepository(store);await stale.initialize({legacyStorage:null});await repo.update(d=>upsertChapter(d,{title:'A'}));
  await assert.rejects(stale.update(d=>upsertChapter(d,{title:'B'})),/其他标签页/);assert.equal(store.value.chapters[0].title,'A');
});
test('invalid coordinates abort before migration persistence',async()=>{
  const store=new MemoryStore(),repo=new LifeRepository(store);
  await assert.rejects(repo.initialize({legacyStorage:{getItem:()=>JSON.stringify({...legacy,places:{北京:{lat:116,lon:39}}})},migrateLegacy}),/经纬度/);
  assert.equal(store.value,null);
});
test('legacy geocoder coordinates retain inferred provenance instead of becoming observations',()=>{
  const d=migrateLegacy({...legacy,places:{北京:{lat:39,lon:116,status:'rough',label:'仅省级定位'}}});
  const p=d.places[0],e=d.evidence.find(e=>p.evidenceIds.includes(e.id));
  assert.equal(e.state,'inferred');assert.equal(e.source.legacyCoordinateStatus,'rough');
  assert.equal(p.location.status,'rough');
});
test('editing a visit to a different place never fabricates coordinates from its old place',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');const original=d.visits[1].placeId,rows=datasetRows(d);
  rows[1].place='杭州';reconcileRows(d,rows,{manual:true});
  const changed=d.places.find(p=>p.id===d.visits[1].placeId);
  assert.equal(changed.coordinates,null,'a renamed visit destination needs independent location evidence');
  assert.notEqual(changed.id,original);assert.equal(d.visits[3].placeId,original);
  assert.deepEqual(d.places.find(p=>p.id===original).coordinates,{latitude:39,longitude:116});
});
test('CSV append adds a new Stop to an unambiguous existing legacy trip without changing its ID',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');const id=d.trips[0].id;
  importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2025-05,北京实习,第三站,旅行,,"38,115"');
  assert.equal(d.trips.length,3,'legacy append must not create a second copy of the same trip');
  assert.equal(d.trips[0].id,id);assert.equal(d.trips[0].visitIds.length,3);
});
test('coordinate corrections persist canonical fields without renderer height or identity caches',()=>{
  const d=emptyDataset();importCSVInto(d,CSV,'replace');const id=d.places[1].id;
  updatePlace(d,id,{lat:39.1,lon:116.1,status:'confirmed',label:'手动确认',h:1234,lifePlaceId:id,sourceName:'公园'});
  const place=d.places.find(p=>p.id===id);
  assert.deepEqual(place.coordinates,{latitude:39.1,longitude:116.1});
  assert.deepEqual(place.location,{status:'confirmed',label:'手动确认'});
});
