import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {OfflineAdminResolver} from '../../src/life/geocoding/offline-admin-resolver.js';
import {applyAutoImport,nameCells,normalizeObservation,savedPhotoObservations,tripTitle,cellKey} from '../../src/life/media/auto-import.js';
import {emptyDataset,validateDataset} from '../../src/life/schema.js';import {projectDataset} from '../../src/life/renderer-adapter.js';
import {nearbyAirport} from '../../src/life/media/transit.js';import {tripCountsAsTravel,placeCountsAsVisited} from '../../src/life/travel-policy.js';
import {composeStory} from '../../src/life/story/compose.js';import {projectShare} from '../../src/life/story/share.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';import {EditHistory} from '../../src/life/edits.js';
const resolver=()=>new OfflineAdminResolver({load:async p=>JSON.parse(await readFile(new URL('../../src/life/geocoding/data/'+p,import.meta.url),'utf8'))});
const points={深圳:[22.541,114.0596],罗湖:[22.547,114.117],落马洲:[22.514,114.065],南山:[22.533,113.93],龙华:[22.654,114.02],深圳北:[22.609,114.029],蛇口:[22.489,113.918],宝安:[22.555,113.883],深圳机场:[22.639,113.811],香港机场:[22.308,113.918],香港:[22.28,114.16],元朗:[22.444,114.025],珠海:[22.271,113.576],澳门:[22.19,113.54],澳门机场:[22.149,113.591],京都:[35.01,135.76],大阪:[34.69,135.5],神户:[34.69,135.19]};
let id=0;const photo=(day,hour,name)=>({uri:`android-media:external_primary/${++id}`,latitude:points[name][0],longitude:points[name][1],local:`${day}T${String(hour).padStart(2,'0')}:00:00`,offsetMinutes:480});
const home=()=>Array.from({length:12},(_,i)=>photo(`2026-01-${String(i+1).padStart(2,'0')}`,12,'深圳'));
const run=async(d,input,g=resolver(),force=false)=>applyAutoImport(d,input,await nameCells(input.map(normalizeObservation),g),{now:new Date('2026-10-28'),force});
test('actual WGS84 border/coastal fixtures resolve Shenzhen, Hong Kong, Zhuhai and Macau without districts',async()=>{
 const r=resolver();for(const [name,coords] of Object.entries(points)){if(['京都','大阪','神户'].includes(name))continue;const result=await r.reverse({latitude:coords[0],longitude:coords[1]});
 const expected=['落马洲','香港机场','香港','元朗'].includes(name)?'香港':['澳门','澳门机场'].includes(name)?'澳门':name==='珠海'?'珠海':'深圳';assert.equal(result?.city,expected,name);assert.equal(result.state,'inferred');}
 assert.equal((await r.reverse({latitude:1.35,longitude:103.82})).city,'新加坡');assert.equal(await r.reverse({latitude:0,longitude:-140}),null);
});
test('nearby countries compete only when another city is clearly closer; 30 km ocean limit remains',async()=>{
 const square={type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]};
 const r=new OfflineAdminResolver({load:async p=>p==='index.json'?{countries:[{code:'A',bounds:[-1,-1,1,1]}]}:p==='city-index.json'?[['A','A城',0,.25,null],['B','B城',0,.02,null]]:p==='city-regions.json'?{}:{country:{name:p[0],code:p[0],geometry:square},cities:[],admins:[]}});
 assert.equal((await r.reverse({latitude:0,longitude:0})).countryMatch,'closer-cross-border-city');assert.equal((await r.reverse({latitude:0,longitude:0})).city,'B城');
 assert.notEqual(cellKey({latitude:22.514,longitude:114.065}),cellKey({latitude:22.541,longitude:114.0596}));
});
test('regroup repairs an old mixed Hong Kong identity, keeps every observation and converges without duplicate cities',async()=>{
 const d=emptyDataset(),input=[...home(),photo('2026-02-01',10,'香港'),photo('2026-02-02',10,'珠海')],old={reverse:async()=>({country:'香港',countryCode:'HKG',city:'香港'})};await run(d,input,old);assert.equal(d.places.length,1);const memories=d.memories.map(m=>m.id);
 await run(d,savedPhotoObservations(d),resolver(),true);validateDataset(d);assert.deepEqual(d.memories.map(m=>m.id),memories);assert.deepEqual(d.places.map(p=>p.name).sort(),['深圳','珠海','香港'].sort());
 for(const m of d.memories)assert.equal(d.places.find(p=>p.id===m.placeIds[0]).name,m.photoObservation.city.label);
 const ids=d.places.map(p=>p.id);await run(d,savedPhotoObservations(d),resolver(),true);assert.deepEqual(d.places.map(p=>p.id),ids);
});
test('Hong Kong airport departure and return stay on globe/photos, excluded from counts, title, replay and share',async()=>{
 const d=emptyDataset();await run(d,[...home(),photo('2026-03-01',8,'香港机场'),photo('2026-03-01',10,'香港机场'),photo('2026-03-02',12,'京都'),photo('2026-03-03',12,'京都'),photo('2026-03-04',10,'香港机场'),photo('2026-03-04',12,'深圳')]);
 assert.equal(d.trips.length,1);const trip=d.trips[0],hk=d.places.find(p=>p.name==='香港');assert.equal(trip.title,'京都');assert.equal(tripCountsAsTravel(d,trip),true);assert.equal(placeCountsAsVisited(d,hk.id),false);
 assert.equal(d.visits.find(v=>v.tripId===trip.id&&v.placeId===hk.id).legacy.type,'转机');
 const view=projectDataset(d);assert.ok(view.photoPlaces.some(p=>p.placeId===hk.id&&p.countsAsVisited===false));assert.equal(view.trips[0].date.days,2,'only destination dates count');
 const story=composeStory(d),share=projectShare(d,story);assert.ok(!story.orderedScenes.some(s=>s.placeId===hk.id));assert.ok(!share.places.some(p=>p.name==='香港'));assert.equal(d.memories.filter(m=>m.placeIds.includes(hk.id)).length,3);
});
test('only airport photos make a transit record, no travel count; 12h is not transit and airport index includes HKG/SZX',async()=>{
 assert.equal(nearbyAirport({latitude:22.308,longitude:113.918}).code,'HKG');assert.equal(nearbyAirport({latitude:22.639,longitude:113.811}).code,'SZX');
 const d=emptyDataset();await run(d,[...home(),photo('2026-03-01',8,'香港机场'),photo('2026-03-01',10,'香港机场')]);assert.equal(d.trips.length,1);assert.equal(tripCountsAsTravel(d,d.trips[0]),false);assert.equal(composeStory(d).selectedTripIds.length,0);
 const e=emptyDataset();await run(e,[...home(),photo('2026-03-01',8,'香港机场'),photo('2026-03-01',20,'香港机场')]);assert.equal(tripCountsAsTravel(e,e.trips[0]),true);
});
test('near-home endpoints of a distant itinerary are pass-through, but Shenzhen–Hong Kong same-day city visit is short travel',async()=>{
 const d=emptyDataset();await run(d,[...home(),photo('2026-03-01',8,'香港'),photo('2026-03-01',10,'香港'),photo('2026-03-02',12,'京都')]);assert.equal(d.trips[0].title,'京都');assert.equal(d.visits.find(v=>v.tripId&&d.places.find(p=>p.id===v.placeId).name==='香港').legacy.type,'路过');
 const e=emptyDataset();await run(e,[...home(),photo('2026-03-01',8,'深圳'),photo('2026-03-01',10,'香港'),photo('2026-03-01',15,'香港'),photo('2026-03-01',20,'深圳')]);assert.equal(e.trips[0].type,'短途');assert.equal(e.trips[0].title,'香港');assert.equal(tripCountsAsTravel(e,e.trips[0]),true);
});
test('manual transit correction and undo persist and survive regrouping',async()=>{
 const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});await repository.update(async d=>{await run(d,[...home(),photo('2026-03-01',8,'香港'),photo('2026-03-01',15,'香港')]);});
 const edits=new EditHistory(repository),hk=repository.getDataset().places.find(p=>p.name==='香港');await edits.execute({type:'classify',target:{kind:'place',id:hk.id},value:'transit'});assert.equal(tripCountsAsTravel(repository.getDataset(),repository.getDataset().trips[0]),false);await edits.undo();assert.equal(tripCountsAsTravel(repository.getDataset(),repository.getDataset().trips[0]),true);
 await edits.execute({type:'classify',target:{kind:'place',id:hk.id},value:'transit'});await repository.update(async d=>{await run(d,savedPhotoObservations(d),resolver(),true);});assert.equal(repository.getDataset().places.find(p=>p.id===hk.id).visitType,'transit');assert.equal(tripCountsAsTravel(repository.getDataset(),repository.getDataset().trips[0]),false);
});
test('titles rank days then photos, exclude country-only fallback, and name foreign multi-city journeys',()=>{
 const o=(name,day,country='中国',hasCity=true)=>({day,city:{key:country+'|'+name,label:name,country,region:country==='中国'?'广东省':'京都府',hasCity}});
 assert.equal(tripTitle([o('北京','01')]),'北京');assert.equal(tripTitle([o('长沙','01'),o('广州','01'),o('广州','02')]),'广州 · 长沙');
 assert.equal(tripTitle([o('成都','01'),o('重庆','02'),o('昆明','03')]),'成都、重庆等 3 城');
 assert.equal(tripTitle([o('东京','01','日本'),o('京都','02','日本'),o('大阪','03','日本')],{homeCountry:'中国'}),'日本 · 东京等 3 城');
 assert.equal(tripTitle([o('中国','01','中国',false)]),'广东');assert.equal(tripTitle([{day:'01',city:{key:'CN',label:'中国',region:'中国',country:'中国',hasCity:false}}]),'足迹回顾');
});
test('correcting inferred airport transit back to travel updates counts/title and undo restores transit',async()=>{
 const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(async d=>{await run(d,[...home(),photo('2026-03-01',8,'香港机场')]);});
 const edits=new EditHistory(repo),hk=repo.getDataset().places.find(p=>p.name==='香港');await edits.execute({type:'classify',target:{kind:'place',id:hk.id},value:'travel'});
 assert.equal(repo.getDataset().trips[0].title,'香港');assert.equal(tripCountsAsTravel(repo.getDataset(),repo.getDataset().trips[0]),true);await edits.undo();assert.equal(tripCountsAsTravel(repo.getDataset(),repo.getDataset().trips[0]),false);
});
test('upgrade rescans old discarded coastal photos once, even after saved-only regroup, then resumes incremental scans',async()=>{
 const {AndroidAutoImport}=await import('../../src/platform/android-auto-import.js');const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(async d=>{await run(d,home());});
 const record=new Map([['auto-checkpoint',{upper:999}]]),sinceCalls=[],coastal=photo('2026-03-01',12,'蛇口');const capability={async ensureLocationAccess(){},async locate({since}){sinceCalls.push(since);return {located:since?[]:[['external_primary',coastal.uri.split('/').at(-1),coastal.latitude,coastal.longitude,coastal.local,480,null]],scanned:1,cursor:null,checkpoint:{upper:1000}};}};
 const importer=new AndroidAutoImport(repo,capability,{geonames:resolver(),store:{async get(k){return record.get(k);},async put(k,v){record.set(k,v);}}});await importer.regroup();await importer.run();assert.equal(sinceCalls[0],null);assert.ok(repo.getDataset().memories.some(m=>m.uri===coastal.uri));await importer.run();assert.deepEqual(sinceCalls[1],{upper:1000});
});
test('a substantive visit in another year cannot make an airport-only year count as a city visit',async()=>{
 const d=emptyDataset(),older=home().map(o=>({...o,local:o.local.replace('2026','2025')}));await run(d,[...older,...home(),photo('2025-03-01',8,'香港机场'),photo('2026-03-01',10,'香港'),photo('2026-03-01',20,'深圳')]);const hk=d.places.find(p=>p.name==='香港');
 assert.equal(placeCountsAsVisited(d,hk.id),true);assert.equal(placeCountsAsVisited(d,hk.id,{year:2025}),false);assert.equal(placeCountsAsVisited(d,hk.id,{year:2026}),true);const projected=projectDataset(d).photoPlaces.find(p=>p.placeId===hk.id);assert.deepEqual(projected.visitedYears,[2026]);assert.deepEqual(projected.years,[2025,2026]);
});
