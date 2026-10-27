import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDataset,validateDataset,addEvidence,newId} from '../../src/life/schema.js';
import {applyAutoImport,nameCells,normalizeObservation,removeAutoImportData,autoImportOutdated} from '../../src/life/media/auto-import.js';
import {importCSVInto,reconcileRows,datasetRows} from '../../src/life/legacy.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {AndroidAutoImport} from '../../src/platform/android-auto-import.js';
const cities={home:{latitude:1.3,longitude:103.85,country:'新加坡',countryCode:'SG',city:'新加坡'},away:{latitude:35,longitude:135.76,country:'日本',countryCode:'JP',admin1:'京都府',city:'京都'},other:{latitude:25.6,longitude:100.2,country:'中国',countryCode:'CN',admin1:'云南省',city:'大理'}};
const geonames={async reverse(p){return Object.values(cities).find(c=>Math.abs(c.latitude-p.latitude)<.1&&Math.abs(c.longitude-p.longitude)<.1)||null;}};
let id=0;
const photo=(day,city='home',hour=12)=>({uri:`android-media:external_primary/${++id}`,...cities[city],local:`${day}T${hour}:00:00`,offsetMinutes:480});
const span=(from,days,city='home')=>Array.from({length:days},(_,i)=>photo(new Date(Date.parse(from+'T00:00:00Z')+i*86400000).toISOString().slice(0,10),city));
const apply=async(data,photos)=>applyAutoImport(data,photos,await nameCells(photos.map(normalizeObservation),geonames),{now:new Date('2026-10-27T12:00:00+08:00')});
const names=data=>data.trips.map(t=>t.visitIds.map(id=>data.places.find(p=>p.id===data.visits.find(v=>v.id===id).placeId).name));

test('strictly more than three days splits journeys; exactly three days and changing country do not',async()=>{
  const d=emptyDataset();await apply(d,[...span('2026-01-01',10),photo('2026-01-11','away'),photo('2026-01-14','other'),photo('2026-01-18','away')]);
  assert.deepEqual(names(d),[['京都','大理'],['京都']]);validateDataset(d);
});
test('returning home splits two journeys even when their dates overlap',async()=>{
  const d=emptyDataset();await apply(d,[...span('2026-01-01',10),photo('2026-01-11','away','09'),photo('2026-01-11','home','12'),photo('2026-01-11','other','18')]);
  assert.equal(d.trips.length,2,'Time overlap must never rejoin trips separated by a home photo');
});
test('only this year can be current; no minimum photo share or old residence overrides the yearly winner',async()=>{
  const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2019~2020,,上海,曾居地,,"31.23,121.47"');
  await apply(d,[...span('2025-01-01',65),...span('2026-04-01',2,'away'),photo('2026-04-04','other')]);
  const current=d.residences.filter(r=>r.kind==='home');assert.equal(current.length,1);assert.equal(d.places.find(p=>p.id===current[0].placeId).name,'京都');
  assert.ok(d.residences.filter(r=>d.places.find(p=>p.id===r.placeId).name==='新加坡').every(r=>r.kind==='past'));
});
test('a continuous stay over two calendar months becomes former residence even below the annual maximum',async()=>{
  const d=emptyDataset();await apply(d,[...span('2025-01-01',65,'away'),...span('2025-05-01',130)]);
  assert.ok(d.residences.some(r=>r.kind==='past'&&d.places.find(p=>p.id===r.placeId).name==='京都'));
  assert.equal(d.trips.length,0,'Living in a second city must not become a 65-day trip');
  const sparse=emptyDataset();await apply(sparse,[photo('2025-01-01','away'),photo('2025-04-01','away'),...span('2025-05-01',70)]);
  assert.ok(!sparse.residences.some(r=>sparse.places.find(p=>p.id===r.placeId).name==='京都'),'Two distant photos alone do not establish continuous residence');
});
test('incremental batches converge on the same cities, classification and journeys as one import',async()=>{
  const a=span('2026-01-01',6),b=[...span('2026-04-01',8,'away'),photo('2026-04-10','other')],all=emptyDataset(),batched=emptyDataset();
  await apply(all,[...a,...b]);await apply(batched,a);await apply(batched,b);
  const describe=d=>({trips:names(d),homes:d.residences.map(r=>[d.places.find(p=>p.id===r.placeId).name,r.kind,r.start.value,r.end.value])});
  assert.deepEqual(describe(batched),describe(all));
});
test('regroup keeps manually renamed photo journeys and their linked memories',async()=>{
  const d=emptyDataset();await apply(d,[...span('2026-01-01',10),photo('2026-02-01','away')]);
  const trip=d.trips[0],rows=datasetRows(d);rows.filter(r=>r._lifeTripId===trip.id).forEach(r=>r.trip='我手动命名的旅行');reconcileRows(d,rows,{manual:true});
  const memories=d.memories.filter(m=>m.tripIds.includes(trip.id)).map(m=>m.id);
  removeAutoImportData(d);validateDataset(d);
  assert.equal(d.trips.find(t=>t.id===trip.id)?.title,'我手动命名的旅行');assert.ok(memories.every(id=>d.memories.some(m=>m.id===id)));
});
test('regroup preserves a manually changed city classification and explicit journey split',async()=>{
  const d=emptyDataset();await apply(d,[...span('2026-01-01',10),photo('2026-02-01','away'),photo('2026-02-02','other')]);
  const rows=datasetRows(d);rows.find(r=>r.type==='现居地').type='曾居地';reconcileRows(d,rows,{manual:true});
  const first=d.trips[0],visitId=first.visitIds.pop(),visit=d.visits.find(v=>v.id===visitId),second={...structuredClone(first),id:newId('trip'),title:'手动拆分的第二程',visitIds:[visit.id],start:visit.start,end:visit.end};
  const evidence=addEvidence(d,'manual',{kind:'journey-editor'},[{at:new Date().toISOString(),before:'one journey',after:'two journeys'}]);
  first.evidenceIds.push(...evidence);second.evidenceIds.push(...evidence);d.trips.push(second);visit.tripId=second.id;
  for(const m of d.memories)if(m.placeIds.includes(visit.placeId))m.tripIds=[second.id];validateDataset(d);
  const classification=structuredClone(d.residences),journeys=structuredClone(d.trips),links=d.memories.map(m=>[m.id,m.tripIds]);
  applyAutoImport(d,[],new Map(),{force:true,now:new Date('2026-10-27')});validateDataset(d);
  assert.deepEqual(d.residences,classification);assert.deepEqual(d.trips,journeys);assert.deepEqual(d.memories.map(m=>[m.id,m.tripIds]),links);
});
test('Photos regroup uses saved observations without album access, survives reload and preserves Chapter links',async()=>{
  const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
  const input=[...span('2026-01-01',10),photo('2026-02-01','away')],names=await nameCells(input.map(normalizeObservation),geonames);
  await repository.update(d=>{applyAutoImport(d,input,names);d.meta.photoAutoGrouping.version=1;d.chapters.push({id:newId('chapter'),title:'生活阶段',type:'other',start:{precision:'year',value:'2026'},end:{precision:'year',value:'2026'},homeAnchors:[],relatedTripIds:[d.trips[0].id],memoryIds:[d.memories.at(-1).id],evidenceIds:[]});});
  const before=repository.getDataset(),photos=before.memories.map(m=>m.id);
  assert.equal(autoImportOutdated(before),true);
  const importer=new AndroidAutoImport(repository,{ensureLocationAccess(){throw Error('Album permission must not be requested');},locate(){throw Error('Album must not be rescanned');}},{geonames,store:{}});
  const result=await importer.regroup();assert.equal(result.regrouped,true);assert.equal(importer.outdated(),false);
  const after=repository.getDataset();assert.deepEqual(after.memories.map(m=>m.id),photos);assert.deepEqual(after.chapters,before.chapters);
  await repository.restore(JSON.stringify(after));await importer.regroup();assert.deepEqual(repository.getDataset().memories.map(m=>m.id),photos);
  assert.equal(autoImportOutdated(after,new Date('2027-01-01')),true,'New year must invalidate the current-home classification');
});
test('titles use cities ranked by observed days and photos',async()=>{
  const points=[{latitude:25.6,longitude:100.2,country:'中华人民共和国',countryCode:'CN',admin1:'云南省',city:'大理'},
    {latitude:30.6,longitude:104,country:'中华人民共和国',countryCode:'CN',admin1:'四川省',city:'成都'},
    {latitude:22.5,longitude:114,country:'中华人民共和国',countryCode:'CN',admin1:'广东省',city:'深圳'}];
  const g={async reverse(p){return points.find(c=>c.latitude===p.latitude)||geonames.reverse(p);}};
  const make=i=>({...photo(`2026-02-0${i+1}`),...points[i]});
  const d=emptyDataset(),input=[...span('2026-01-01',10),make(0),make(1),make(2)];
  applyAutoImport(d,input.slice(0,-1),await nameCells(input.slice(0,-1).map(normalizeObservation),g));assert.equal(d.trips[0].title,'大理 · 成都');
  applyAutoImport(d,[input.at(-1)],await nameCells([normalizeObservation(input.at(-1))],g));assert.equal(d.trips[0].title,'中国 · 大理等 3 城');
});
