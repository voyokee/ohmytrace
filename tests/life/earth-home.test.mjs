import test from 'node:test';import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {importCSVInto} from '../../src/life/legacy.js';
import {recentTrips,tripCities,earthTripTitle,earthScopedSnapshot} from '../../src/ui/earth-home-model.js';
import {projectDataset} from '../../src/life/renderer-adapter.js';
import {recordCardModel} from '../../src/life/record-card.js';
import {composeStory,setStoryMemories} from '../../src/life/story/compose.js';
import {projectShare} from '../../src/life/story/share.js';
import {addMemory,upsertChapter} from '../../src/life/schema.js';

async function fixture(){const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2025-05,新旅行,杭州,旅行,,"30.27,120.15"\n2020-03,旧旅行,苏州,旅行,,"31.3,120.6"\n,无日期,同名,旅行,,"1,2"','replace'));return repo.getDataset();}
test('recent travel uses event time, keeps unknown last, and supports scoped city search',async()=>{const d=await fixture();assert.deepEqual(recentTrips(d).map(t=>t.title),['新旅行','旧旅行','无日期']);assert.equal(recentTrips(d,null,'苏州')[0].title,'旧旅行');assert.equal(recentTrips(d,new Set([d.trips[1].id])).length,1);});
test('city identity unites proven aliases without deleting repeat visits or same-name cities',async()=>{
 const d=await fixture(),a=d.places[0],b=d.places[1];a.location.photoCity={key:'CN-hangzhou',country:'中国',region:'浙江',label:'杭州'};b.location.photoCity={...a.location.photoCity,label:'杭州市'};
 const t=d.trips[0],second={...d.visits[1],id:'visit_alias',tripId:t.id},third={...d.visits[0],id:'visit_return',tripId:t.id};d.visits.push(second,third);t.visitIds=[d.visits[0].id,second.id,third.id];t.autoTitle=t.title;
 assert.equal(tripCities(d,t).length,1);assert.equal(earthTripTitle(d,t),'杭州');
 const snap=projectDataset(d),projected=snap.trips.find(p=>p.id===t.id);assert.equal(projected.stops.length,3);assert.equal(new Set(projected.stops.map(s=>s.place)).size,1);assert.equal(new Set(Object.values(snap.placeIds)).size,2);
 const city=recordCardModel(d,{kind:'place',id:a.id});assert.equal(city.journeys.length,2);assert.equal(recordCardModel(d,{kind:'trip',id:t.id}).places.length,1);assert.equal(t.visitIds.length,3);
 delete b.location.photoCity;b.name=a.name;assert.equal(tripCities(d,t).length,2,'A shared label alone must not merge cities');
 const returned=projectDataset(d).trips.find(p=>p.id===t.id);assert.equal(returned.stops.length,3);assert.notEqual(returned.stops[0].place,returned.stops[1].place);assert.equal(returned.stops[0].place,returned.stops[2].place);
 assert.equal(t.title,'新旅行','Display titles must not rewrite the original record');
});
test('a selected trip retains year scope in photos, playback and exported repeated-city stops',async()=>{
 const repo=new LifeRepository(new MemoryStore());await repo.initialize({legacyStorage:null});await repo.update(d=>{
  importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2024-12-31~2025-01-02,跨年旅行,杭州,旅行,,"30.27,120.15"','replace');
  const t=d.trips[0],v=d.visits[0];v.start={precision:'day',value:'2024-12-31'};v.end={...v.start};const next={...v,id:'visit_2025',start:{precision:'day',value:'2025-01-02'},end:{precision:'day',value:'2025-01-02'}};d.visits.push(next);t.visitIds.push(next.id);
  for(const year of [2024,2025])addMemory(d,{kind:'photo',title:String(year),uri:'media:'+year,start:year+'-12-31',end:year+'-12-31',placeIds:[v.placeId],tripIds:[t.id],state:'observed',source:{kind:'photo-exif'}});
 });const d=repo.getDataset(),t=d.trips[0],card=recordCardModel(d,{kind:'trip',id:t.id},{year:2025});
 assert.equal(card.scope.year,2025);assert.deepEqual(card.photos.map(m=>m.title),['2025']);
 const story=composeStory(d,{scope:card.scope}),artifact=projectShare(d,story);assert.equal(artifact.trips[0].stops.length,1);assert.equal(artifact.trips[0].stops[0].start.value,'2025-01-02');
 assert.throws(()=>setStoryMemories(story,d,[d.memories[0].id]),/不在所选范围/);
});
test('a city inside a stage retains its stage restriction when replaying and sharing',async()=>{
 const d=await fixture(),place=d.places[0];const extra={...d.trips[0],id:'trip_outside',visitIds:['visit_outside']};const visit={...d.visits[0],id:'visit_outside',tripId:extra.id};d.trips.push(extra);d.visits.push(visit);
 const c=upsertChapter(d,{title:'阶段',type:'life',start:'2025',end:'2025',homeAnchors:[place.id],relatedTripIds:[d.trips[0].id]});
 const card=recordCardModel(d,{kind:'place',id:place.id},{scope:{type:'chapter',id:c}}),story=composeStory(d,{scope:card.scope});
 assert.equal(card.scope.chapterId,c);assert.deepEqual(story.selectedTripIds,[d.trips[0].id]);assert.equal(projectShare(d,story).trips.length,1);
});

test('year and stage sharing cannot offer out-of-range unlocated or explicitly linked photos',async()=>{
 const d=await fixture(),place=d.places[0];
 const old=addMemory(d,{kind:'photo',title:'旧照片',uri:'media:old',start:'2020',end:'2020',placeIds:[place.id],state:'observed',source:{kind:'photo-exif'}});
 upsertChapter(d,{title:'多年的阶段',type:'life',start:'2020',end:'2025',homeAnchors:[place.id],relatedTripIds:[d.trips[0].id],memoryIds:[old]});
 assert.throws(()=>setStoryMemories(composeStory(d,{scope:{type:'year',year:2025}}),d,[old]),/不在所选范围/);
 const stage=upsertChapter(d,{title:'这一年',type:'life',start:'2025',end:'2025',homeAnchors:[place.id],relatedTripIds:[d.trips[0].id]});
 assert.throws(()=>setStoryMemories(composeStory(d,{scope:{type:'place',id:place.id,chapterId:stage}}),d,[old]),/不在所选范围/);
 const unlocated=addMemory(d,{kind:'photo',title:'无地点旧照片',uri:'media:unlocated',start:'2020',end:'2020',tripIds:[d.trips[0].id],state:'observed',source:{kind:'photo-exif'}});
 assert.throws(()=>setStoryMemories(composeStory(d,{scope:{type:'trip',id:d.trips[0].id,year:2025}}),d,[unlocated]),/不在所选范围/);
 d.trips[0].start={precision:'unknown',value:null};d.trips[0].end={precision:'unknown',value:null};
 assert.throws(()=>setStoryMemories(composeStory(d,{scope:{type:'trip',id:d.trips[0].id,year:2025}}),d,[unlocated]),/不在所选范围/);
});

test('the earth year projection excludes other-year stops and photos while preserving the complete trip',async()=>{
 const d=await fixture(),t=d.trips[0],first=d.visits.find(v=>v.id===t.visitIds[0]),p=d.places[1];
 t.start={precision:'day',value:'2024-12-31'};t.end={precision:'day',value:'2025-01-02'};first.start={...t.start};first.end={...t.start};
 const next={...first,id:'visit_new_year',placeId:p.id,start:{...t.end},end:{...t.end}};d.visits.push(next);t.visitIds.push(next.id);
 const view=earthScopedSnapshot(projectDataset(d),d,2025),projected=view.trips.find(p=>p.id===t.id);
 assert.deepEqual(projected.stops.map(s=>s.visitId),[next.id]);assert.ok(!view.rows.some(r=>r.place==='杭州'));assert.equal(t.visitIds.length,2);
});

test('a stage keeps explicitly associated unknown-date trips without inventing dates',async()=>{
 const d=await fixture(),t=d.trips.find(t=>t.title==='无日期');
 const id=upsertChapter(d,{title:'记不清日期的一段经历',type:'life',start:'2025',end:'2025',relatedTripIds:[t.id]});
 const view=earthScopedSnapshot(projectDataset(d,{type:'chapter',id}),d);
 assert.equal(view.trips.length,1);assert.equal(view.trips[0].stops.length,1);assert.equal(t.start.precision,'unknown');
});
