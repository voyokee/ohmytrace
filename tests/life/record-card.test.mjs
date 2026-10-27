import test from 'node:test';
import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {importCSVInto} from '../../src/life/legacy.js';
import {upsertChapter,addMemory} from '../../src/life/schema.js';
import {EditHistory} from '../../src/life/edits.js';
import {recordCardModel} from '../../src/life/record-card.js';
import {tripCountsAsTravel} from '../../src/life/travel-policy.js';
import {projectDataset} from '../../src/life/renderer-adapter.js';
import {composeStory} from '../../src/life/story/compose.js';
import {projectShare} from '../../src/life/story/share.js';
import {applyAutoImport,nameCells,normalizeObservation} from '../../src/life/media/auto-import.js';

const csv=['日期,行程,地点,类型,备注,坐标',
  '2024~至今,,深圳,现居地,,"22.54,114.05"',
  '2024-03-01~2024-03-02,日本之旅,京都,旅行,,"35.01,135.76"',
  '2024-03-01~2024-03-02,日本之旅,大阪,旅行,,"34.69,135.5"',
  '2025-05-01,京都重访,京都,旅行,,"35.01,135.76"'].join('\n');
async function fixture(){
  const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
  await repository.update(d=>{
    importCSVInto(d,csv,'replace');
    upsertChapter(d,{title:'在深圳的日子',start:'2024',end:'至今',homeAnchors:[d.places[0].id],relatedTripIds:d.trips.map(t=>t.id)});
    addMemory(d,{kind:'photo',title:'京都照片',uri:'android-media:external_primary/1',start:'2024-03-01',end:'2024-03-01',placeIds:[d.places[1].id],tripIds:[d.trips[0].id],state:'observed',source:{kind:'photo-exif'}});
    addMemory(d,{kind:'photo',title:'深圳照片',uri:'android-media:external_primary/2',start:'2024-01-01',end:'2024-01-01',placeIds:[d.places[0].id],state:'observed',source:{kind:'photo-exif'}});
  });
  return {repository,edits:new EditHistory(repository)};
}
test('city, journey, residence and chapter use the same actions with scoped photos and links',async()=>{
  const {repository}=await fixture(),d=repository.getDataset();
  for(const [kind,e]of [['place',d.places[1]],['trip',d.trips[0]],['residence',d.residences[0]],['chapter',d.chapters[0]]]){
    const m=recordCardModel(d,{kind,id:e.id});
    assert.deepEqual(m.actions,['回放','照片','分享','不对？']);assert.equal(m.target.kind,kind);assert.ok(m.provenance.label);
    assert.ok(m.photoIds.length);assert.ok(m.title);assert.ok(!m.mergeOptions.some(o=>o.id===e.id));
  }
  const city=recordCardModel(d,{kind:'place',id:d.places[1].id});
  assert.equal(city.journeys.length,2);assert.equal(city.photoIds.length,1);assert.equal(city.scope.type,'place');
  const home=recordCardModel(d,{kind:'residence',id:d.residences[0].id});assert.equal(home.photoIds.length,1);assert.equal(home.scope.type,'residence');
  const chapter=recordCardModel(d,{kind:'chapter',id:d.chapters[0].id});assert.equal(chapter.photoIds.length,2,'Home-anchor photos within the stage period belong to the stage');
});
test('the card keeps canonical IDs and manual provenance after a city is renamed',async()=>{
  const {repository,edits}=await fixture(),id=repository.getDataset().places[1].id;
  await edits.execute({type:'rename',target:{kind:'place',id},name:'我心里的京都'});
  const card=recordCardModel(repository.getDataset(),{kind:'place',id});
  assert.equal(card.title,'我心里的京都');assert.equal(card.provenance.state,'manual');assert.equal(card.journeys.length,2);
  await edits.undo();assert.equal(recordCardModel(repository.getDataset(),{kind:'place',id}).title,'京都');
});
test('transfer and pass-through corrections leave cities discoverable but do not count as journeys',async()=>{
  const {repository,edits}=await fixture(),trip=repository.getDataset().trips[0];
  await edits.execute({type:'classify',target:{kind:'trip',id:trip.id},value:'transit'});
  let d=repository.getDataset();assert.equal(tripCountsAsTravel(d,d.trips[0]),false);
  let snapshot=projectDataset(d);assert.equal(snapshot.trips.find(t=>t.id===trip.id).countsAsTravel,false);
  assert.ok(snapshot.rows.some(r=>r._lifeTripId===trip.id));
  const city=recordCardModel(d,{kind:'place',id:d.places[2].id});assert.equal(city.journeys.length,0);assert.equal(city.connections.length,1);
  await edits.undo();await edits.execute({type:'classify',target:{kind:'place',id:d.places[1].id},value:'pass-through'});
  d=repository.getDataset();assert.equal(tripCountsAsTravel(d,d.trips[0]),true,'Osaka still makes the mixed itinerary a travel journey');
  assert.equal(tripCountsAsTravel(d,d.trips[1]),false,'The Kyoto-only journey no longer counts as travel');
  assert.equal(recordCardModel(d,{kind:'place',id:d.places[1].id}).journeys.length,0);
  assert.equal(composeStory(d).selectedTripIds.length,1,'Automatic all/year/chapter playback excludes pure connections');
});
test('city and residence cards can replay and share even when they have no travel journeys',async()=>{
  const {repository}=await fixture(),d=repository.getDataset(),home=d.residences[0];
  for(const scope of [{type:'place',id:home.placeId},{type:'residence',id:home.id}]){
    const story=composeStory(d,{scope,title:'我的深圳'});
    assert.ok(story.orderedScenes.some(s=>s.kind==='place'&&s.placeId===home.placeId));
    const artifact=projectShare(d,story);assert.ok(artifact.places.length);assert.ok(artifact.orderedScenes.some(s=>s.kind==='place'));
    assert.ok(!JSON.stringify(artifact).includes('android-media:'));assert.ok(!JSON.stringify(artifact).includes(home.id));
  }
  assert.throws(()=>composeStory(d,{scope:{type:'place',id:'missing'}}),/不存在/);
});
test('year-scoped city cards use the stop dates and do not expose other years photos',async()=>{
  const {repository}=await fixture(),d=repository.getDataset(),id=d.places[1].id;
  const c=recordCardModel(d,{kind:'place',id},{year:2025});assert.equal(c.journeys.length,1);assert.equal(c.photoIds.length,0);
  assert.equal(c.journeys[0].title,'京都重访');
});
test('deleting a card is reversible, excludes it from the map and rejects a stale sharing draft',async()=>{
  const {repository,edits}=await fixture(),before=repository.getDataset(),trip=before.trips[0],draft=composeStory(before);
  await edits.execute({type:'delete',target:{kind:'trip',id:trip.id}});
  let d=repository.getDataset();assert.equal(recordCardModel(d,{kind:'trip',id:trip.id}),null);
  assert.equal(projectDataset(d).trips.some(t=>t.id===trip.id),false);assert.throws(()=>projectShare(d,draft),/已改变/);
  assert.deepEqual(d.memories.map(m=>m.id),before.memories.map(m=>m.id));
  await edits.undo();d=repository.getDataset();assert.deepEqual(d.trips,before.trips);assert.ok(recordCardModel(d,{kind:'trip',id:trip.id}));
});
test('hidden automatic journeys stay hidden after regrouping without deleting photo observations',async()=>{
  const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
  const rows=[1,2,3].map(i=>({uri:'android-media:external_primary/'+i,latitude:22.54,longitude:114.05,local:'2026-01-0'+i+'T12:00:00',offsetMinutes:480}));
  rows.push({uri:'android-media:external_primary/4',latitude:35.01,longitude:135.76,local:'2026-05-01T12:00:00',offsetMinutes:540});
  const names=await nameCells(rows.map(normalizeObservation),{reverse:async p=>({country:p.latitude>30?'日本':'中国',countryCode:p.latitude>30?'JP':'CN',city:p.latitude>30?'京都':'深圳'})});
  await repository.update(d=>applyAutoImport(d,rows,names,{now:new Date('2026-10-28')}));
  const before=repository.getDataset(),history=new EditHistory(repository),id=before.trips[0].id;
  await history.execute({type:'delete',target:{kind:'trip',id}});
  await repository.update(d=>applyAutoImport(d,[],names,{force:true,now:new Date('2026-10-28')}));
  const d=repository.getDataset();assert.equal(d.trips.find(t=>t.id===id).hidden,true);assert.equal(projectDataset(d).trips.length,0);
  assert.deepEqual(d.memories.map(m=>m.id),before.memories.map(m=>m.id));await history.undo();assert.ok(projectDataset(repository.getDataset()).trips.some(t=>t.id===id));
});
test('a year-scoped city replay and share include only that city and the matching visit year',async()=>{
  const {repository}=await fixture(),d=repository.getDataset(),id=d.places[1].id;
  const card=recordCardModel(d,{kind:'place',id},{year:2025});assert.deepEqual(card.scope,{type:'place',id,year:2025});
  const story=composeStory(d,{scope:card.scope}),artifact=projectShare(d,story);
  assert.deepEqual(story.selectedTripIds,[d.trips[1].id]);assert.deepEqual(artifact.places.map(p=>p.name),['京都']);assert.equal(artifact.trips.length,1);
  const fullCity=projectShare(d,composeStory(d,{scope:{type:'place',id}}));assert.ok(!fullCity.places.some(p=>p.name==='大阪'),'A city share cannot silently include the rest of a multi-city itinerary');
});
test('a home card can explicitly include its own photo and rejects a stale draft after hiding the city',async()=>{
  const {repository,edits}=await fixture(),d=repository.getDataset(),p=d.places[0];
  const {setStoryMemories}=await import('../../src/life/story/compose.js');let story=composeStory(d,{scope:{type:'place',id:p.id}});
  story=setStoryMemories(story,d,[d.memories[1].id]);story.privacySettings.includePhotos=true;assert.equal(projectShare(d,story).memories.length,1);
  await edits.execute({type:'delete',target:{kind:'place',id:p.id}});assert.throws(()=>projectShare(repository.getDataset(),story),/已改变/);
  assert.ok(!projectDataset(repository.getDataset()).rows.some(r=>r.place===p.name));await edits.undo();assert.ok(projectDataset(repository.getDataset()).rows.some(r=>r.place===p.name));
});
test('standalone home/city share has a visible Viewer map point without inventing a journey or photo',async()=>{
 const {repository}=await fixture(),d=repository.getDataset(),home=d.places[0],artifact=projectShare(d,composeStory(d,{scope:{type:'place',id:home.id}}));
 const {createStoryBridge}=await import('../../src/life/story/viewer-bridge.js');const snapshot=createStoryBridge(artifact).adapter.getRenderSnapshot();assert.equal(snapshot.trips.length,0);assert.equal(snapshot.rows.length,1);assert.equal(snapshot.photoPlaces[0].count,0);assert.equal(snapshot.photoPlaces[0].source,'story-scene');
});
test('city sharing cannot select another stop’s photo from the same journey',async()=>{
 const {repository}=await fixture(),d=repository.getDataset(),kyoto=d.places[1],osaka=d.places[2];addMemory(d,{kind:'photo',title:'大阪照片',uri:'android-media:external_primary/3',start:'2024-03-01',end:'2024-03-01',placeIds:[osaka.id],tripIds:[d.trips[0].id],state:'observed',source:{kind:'photo-exif'}});
 const {setStoryMemories}=await import('../../src/life/story/compose.js');const story=composeStory(d,{scope:{type:'place',id:kyoto.id}});assert.throws(()=>setStoryMemories(story,d,[d.memories.at(-1).id]),/不在所选范围/);
});
