import test from 'node:test';
import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {importCSVInto} from '../../src/life/legacy.js';
import {upsertChapter,deleteChapter} from '../../src/life/schema.js';
import {RendererAdapter,renderDate} from '../../src/life/renderer-adapter.js';
const csv='日期,行程,地点,类型,备注,坐标\n2024~2026,,新加坡,现居地,,"1.3,103.8"\n2025-05,北京实习,公园,旅行,第一站,"39,116"\n2025-05,北京实习,公园,旅行,第二站,"40,117"\n2026,重访,公园,旅行,,"39,116"';
test('chapter scope drives map stops, homes, list and timeline while preserving identity',async()=>{
  const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,csv));
  const data=repo.getDataset(),trip=data.trips[0].id,place=data.places[0].id;
  const id=await repo.update(d=>upsertChapter(d,{title:'硕士',start:'2024',end:'2026',relatedTripIds:[trip],homeAnchors:[place]}));
  const adapter=new RendererAdapter(repo);let events=0;const off=adapter.subscribe(()=>events++);
  const all=adapter.getRenderSnapshot();assert.equal(all.trips.length,2);assert.equal(new Set(all.trips[0].stops.map(s=>s.place)).size,2);
  adapter.setScope({type:'chapter',id});const scoped=adapter.getRenderSnapshot();assert.equal(scoped.trips.length,1);assert.equal(scoped.trips[0].id,trip);assert.equal(scoped.homes.length,1);
  adapter.focusTrip(trip);assert.deepEqual(adapter.getRenderSnapshot().focus,{type:'trip',id:trip});adapter.focusPlace(place);assert.equal(events,3);
  assert.equal(scoped.trips[0].date.prec,'month');assert.equal(scoped.trips[0].date.days,null);
  await repo.update(d=>deleteChapter(d,id));assert.equal(adapter.getRenderSnapshot().scope.type,'all');assert.equal(adapter.getRenderSnapshot().trips.length,2);
  off();adapter.dispose();
});
test('year scope and Chapter without trips are valid render views',async()=>{
  const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,csv));
  const id=await repo.update(d=>upsertChapter(d,{title:'学习',start:'2020',end:'2024',homeAnchors:[d.places[1].id]}));
  const adapter=new RendererAdapter(repo);adapter.setScope({type:'chapter',id});const s=adapter.getRenderSnapshot();
  assert.equal(s.trips.length,0);assert.equal(s.homes[0].id,`anchor:${repo.getDataset().places[1].id}`);assert.equal(repo.getDataset().residences.length,1);
  adapter.setScope({type:'year',year:2026});assert.equal(adapter.getRenderSnapshot().trips.length,1);
  assert.throws(()=>adapter.setScope({type:'chapter',id:'missing'}));assert.throws(()=>adapter.focusPlace('missing'));adapter.dispose();
});
test('a Chapter place anchor is not evidence of residence or travel origin',async()=>{
  const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,csv));
  const id=await repo.update(d=>upsertChapter(d,{title:'实习',start:'2024',end:'2026',homeAnchors:[d.places[1].id],relatedTripIds:[d.trips[0].id]}));
  const adapter=new RendererAdapter(repo);adapter.setScope({type:'chapter',id});const snapshot=adapter.getRenderSnapshot();
  assert.equal(snapshot.trips[0].origin,null,'associating a place with a Chapter must not invent a residence-based departure');
  assert.equal(snapshot.homes[0].anchor,true);assert.equal(repo.getDataset().residences.length,1);adapter.dispose();
});
test('city history receives each visit period instead of borrowing the whole journey period',async()=>{
  const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,csv));
  await repo.update(d=>{const trip=d.trips[0];trip.end={precision:'month',value:'2026-01'};d.visits.find(v=>v.id===trip.visitIds[0]).end={precision:'day',value:'2025-05-02'};});
  const adapter=new RendererAdapter(repo),snapshot=adapter.getRenderSnapshot(),stop=snapshot.trips[0].stops[0];
  assert.equal(stop.date?.label,'2025-05 – 2025-05-02','City dates describe this stop, not the journey through 2026');
  assert.equal(snapshot.trips[0].date.label,'2025-05 – 2026-01');adapter.dispose();
});
