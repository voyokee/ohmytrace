import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {composeStory,setStoryMemories,storyYears} from '../../src/life/story/compose.js';
import {validateStory,visualContext} from '../../src/life/story/schema.js';
import {projectShare,parseArtifact,cleanJPEG,Publisher} from '../../src/life/story/share.js';
import {storyFixture} from './story-fixtures.mjs';

test('CSV + overlapping Chapters compose a layered story without requiring photos',()=>{
  const f=storyFixture(),before=structuredClone(f.data),story=composeStory(f.data,{scope:{type:'chapter',id:f.chapter}});
  assert.equal(story.selectedTripIds.length,2);assert.deepEqual(story.selectedChapterIds,[f.chapter]);
  assert.deepEqual(story.orderedScenes.map(s=>s.kind),['globe','chapter','place','trip','place','place','trip','place','closing']);
  assert.equal(story.orderedScenes.filter(s=>s.kind==='memory').length,0);assert.deepEqual(f.data,before);
  const all=composeStory(f.data);assert.equal(all.orderedScenes.filter(s=>s.kind==='trip'&&s.tripId===f.trip.id).length,2);
  assert.equal(composeStory(f.data,{scope:{type:'year',year:2025}}).selectedTripIds.length,1);
  assert.deepEqual(composeStory(f.data,{scope:{type:'trip',id:f.repeat.id}}).selectedChapterIds,[]);
  const scene=story.orderedScenes.find(s=>s.tripId===f.repeat.id);assert.equal(visualContext(scene).month,null);
  assert.equal(visualContext(story.orderedScenes.find(s=>s.tripId===f.trip.id)).month,5);
  assert.throws(()=>composeStory(f.data,{scope:{type:'chapter',id:'missing'}}));
});
test('share projection removes private records, raw IDs, paths, notes and evidence; city grid is in JSON',()=>{
  const f=storyFixture(),story=composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),a=projectShare(f.data,story),json=JSON.stringify(a);
  assert.equal(a.trips.length,2);assert.equal(a.chapters.length,1);assert.equal(a.memories.length,0);
  for(const value of ['私人旅行','秘密地点','PRIVATE_','123 单元',f.data.id,f.trip.id,f.overlap])assert.equal(json.includes(value),false,value);
  assert.equal(json.includes('39.912345'),false);assert.equal(json.includes('1.312345'),false);
  assert.ok(a.places.some(p=>p.coordinates?.latitude===39.9));assert.ok(a.places.some(p=>p.coordinates===null));
  assert.deepEqual(parseArtifact(JSON.stringify(a)),a);
  story.privacySettings.excludedTripIds=[f.trip.id];const less=projectShare(f.data,story);
  assert.equal(less.trips.length,1);assert.equal(JSON.stringify(less).includes('北京实习'),false);
  story.privacySettings.locationMode='hidden';assert.equal(projectShare(f.data,story).places.every(p=>p.coordinates===null),true);
});
test('sharing a photo requires explicit memory selection and photo permission; metadata is stripped',async()=>{
  const f=storyFixture();let story=setStoryMemories(composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),f.data,[f.photo]);
  assert.equal(projectShare(f.data,story).memories.length,0);
  story.privacySettings.includePhotos=true;assert.equal(projectShare(f.data,story).memories[0].image,null);
  const bytes=await readFile(new URL('./fixtures/photo-base.jpg',import.meta.url)),clean=cleanJPEG(bytes);
  const image='data:image/jpeg;base64,'+Buffer.from(clean).toString('base64');
  const a=projectShare(f.data,story,{images:{[f.photo]:image}});assert.equal(a.memories[0].image,image);
  assert.equal(JSON.stringify(a).includes('PRIVATE_'),false);assert.equal(a.orderedScenes.filter(s=>s.kind==='memory').length,1);
  assert.equal(a.memories.length,1);assert.equal(a.memories[0].tripIds[0],a.trips[0].id);
  assert.throws(()=>projectShare(f.data,story,{images:{[f.photo]:'file:///private.jpg'}}));
  assert.throws(()=>setStoryMemories(story,f.data,['missing']));
});
test('artifact validation rejects unsupported versions, private payloads, malformed references and privacy lies',()=>{
  const f=storyFixture(),a=projectShare(f.data,composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}));
  for(const mutate of [x=>x.schemaVersion=99,x=>x.dataset=f.data,x=>x.places[0].coordinates.latitude=1.312345,x=>x.trips[0].stops[0].placeId='missing',x=>x.memories.push({uri:'file:///private'}),x=>x.trips[0].stops[0].note='private',x=>x.orderedScenes[0].start.device='secret']){
    const bad=structuredClone(a);mutate(bad);assert.throws(()=>parseArtifact(bad));
  }
  const edited=composeStory(f.data);edited.orderedScenes.reverse();edited.orderedScenes[0].title='<img src=x onerror=alert(1)>';assert.equal(validateStory(edited),edited);
  assert.equal(projectShare(f.data,edited).orderedScenes[0].title,edited.orderedScenes[0].title,'User strings remain plain data for safe text rendering');
});
test('hosted publishing is explicitly unavailable until a real Publisher is configured',async()=>{
  await assert.rejects(new Publisher().publish(),/Hosted Sharing/);
});
test('an unknown or hidden Stop cannot be presented as a known connection',()=>{
  const f=storyFixture(),story=composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),a=projectShare(f.data,story);
  assert.equal(a.trips[0].routeKind,'unknown','A route with an unlocated Stop must retain unknown path status');
  assert.equal(a.trips[1].routeKind,'inferred');
  story.privacySettings.locationMode='hidden';assert.ok(projectShare(f.data,story).trips.every(t=>t.routeKind==='unknown'));
});
test('adding another Memory preserves existing edited Memory scenes and their position',()=>{
  const f=storyFixture();let story=setStoryMemories(composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),f.data,[f.photo]);
  const index=story.orderedScenes.findIndex(s=>s.kind==='memory'),scene=story.orderedScenes.splice(index,1)[0];scene.description='手写回忆';story.orderedScenes.unshift(scene);
  story=setStoryMemories(story,f.data,[f.photo,f.privatePhoto]);
  assert.equal(story.orderedScenes[0].id,scene.id);assert.equal(story.orderedScenes[0].description,'手写回忆');
});
test('year selection covers cross-year records and dated observations without inventing Trip boundaries',()=>{
  const f=storyFixture();f.trip.start={precision:'unknown',value:null};f.trip.end={precision:'unknown',value:null};
  assert.deepEqual(storyYears(f.data),[2025,2026]);
  const story=composeStory(f.data,{scope:{type:'year',year:2025}});assert.ok(story.selectedTripIds.includes(f.trip.id));
  assert.equal(story.orderedScenes.find(s=>s.kind==='trip').start.precision,'unknown');
  f.repeat.start={precision:'year',value:'2023'};f.repeat.end={precision:'year',value:'2026'};
  assert.deepEqual(storyYears(f.data),[2023,2024,2025,2026]);
});
test('other Memory summaries preserve their kind without exposing local media, and unplayable artifacts fail validation',()=>{
  const f=storyFixture();f.data.memories.find(m=>m.id===f.photo).kind='video';f.data.memories.find(m=>m.id===f.photo).text='明确选择分享的文字摘要';
  const story=setStoryMemories(composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),f.data,[f.photo]);story.privacySettings.includeNotes=true;
  const a=projectShare(f.data,story);assert.equal(a.memories[0].kind,'video');assert.equal(a.memories[0].text,'明确选择分享的文字摘要');assert.equal(JSON.stringify(a).includes('file:///'),false);
  const empty=structuredClone(a);empty.orderedScenes=[];assert.throws(()=>parseArtifact(empty),/镜头/);
  const invalid=structuredClone(a);invalid.orderedScenes[1].chapterId=null;assert.throws(()=>parseArtifact(invalid),/关联/);
});
test('a Memory at a revisited Place remains inside its associated Trip narrative',()=>{
  const f=storyFixture(),story=setStoryMemories(composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),f.data,[f.photo]);
  const memory=story.orderedScenes.findIndex(s=>s.kind==='memory'),repeat=story.orderedScenes.findIndex(s=>s.kind==='trip'&&s.tripId===f.repeat.id);
  assert.ok(memory<repeat,'The 2025 Trip photo must not be attached to the same-city 2026 revisit');
});

test('JPEG privacy inspection covers metadata after scans, stuffed bytes and restart markers',async()=>{
  const clean=cleanJPEG(await readFile(new URL('./fixtures/photo-base.jpg',import.meta.url)));
  const secret=Buffer.from('Exif\0\0PRIVATE_DEVICE_AFTER_SCAN'),length=secret.length+2;
  const app1=Buffer.concat([Buffer.from([255,225,length>>8,length&255]),secret]);
  const injected=Buffer.concat([clean.subarray(0,-2),app1,clean.subarray(-2)]);
  assert.throws(()=>cleanJPEG(injected,{reject:true}),/元数据/);
  assert.deepEqual(cleanJPEG(injected),clean,'Removing a post-scan APP1 must preserve the original image bytes');
  const comment=Buffer.from([255,254,0,6,116,101,115,116]);
  assert.throws(()=>cleanJPEG(Buffer.concat([clean.subarray(0,-2),comment,clean.subarray(-2)]),{reject:true}),/元数据/);
  const entropy=Buffer.from([23,255,0,225,255,208,42]);
  const stuffed=Buffer.concat([clean.subarray(0,-2),entropy,clean.subarray(-2)]);
  assert.deepEqual(cleanJPEG(stuffed,{reject:true}),new Uint8Array(stuffed),'Stuffed bytes and restart markers are image data, not metadata');
  for(const suffix of [Buffer.from([255,225,0,20,1,255,217]),Buffer.from([255,218,0,1,255,217]),Buffer.from([255,217,1,255,217])])
    assert.throws(()=>cleanJPEG(Buffer.concat([clean.subarray(0,-2),suffix]),{reject:true}));
});
