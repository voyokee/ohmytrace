import test from 'node:test';import assert from 'node:assert/strict';
import {emptyDataset} from '../../src/life/schema.js';import {importCSVInto} from '../../src/life/legacy.js';
import {analyzePhotoFile} from '../../src/life/media/exif.js';
import {distanceKm,reconstructPhotos,mergeCandidates,splitCandidate,editCandidate} from '../../src/life/media/reconstruction.js';
import {RECONSTRUCTION_RULES} from '../../src/life/media/config.js';import {photoFile} from './photo-fixtures.mjs';
const assets=async options=>Promise.all(options.map((o,i)=>analyzePhotoFile(photoFile({...o,nonce:i},`${i}.jpg`))));
test('antimeridian and exact temporal boundaries use centralized rules',async()=>{
  assert.ok(distanceKm({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<23);
  assert.equal(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
  const a=await assets([{time:'2025:01:01 00:00:00'},{time:'2025:01:01 18:00:00'}]);
  assert.equal(reconstructPhotos(a,emptyDataset()).candidates[0].visits.length,1);
  a[1].extractedTime.utcEpochMs+=1;a[1].extractedTime.wallClockOrdinal+=1;
  assert.equal(reconstructPhotos(a,emptyDataset()).candidates[0].visits.length,2);
  const b=await assets([{time:'2025:01:01 00:00:00'},{time:'2025:01:04 00:00:00',lat:30,lon:120}]);
  assert.equal(reconstructPhotos(b,emptyDataset()).candidates.length,1);
  b[1].extractedTime.utcEpochMs+=1;b[1].extractedTime.wallClockOrdinal+=1;
  assert.equal(reconstructPhotos(b,emptyDataset()).candidates.length,2);assert.equal(RECONSTRUCTION_RULES.tripGapHours,72);
});
test('multi-city, same-day stops and A-B-A returns retain separate visits',async()=>{
  const a=await assets([{time:'2025:05:01 08:00:00'},{time:'2025:05:01 10:00:00',lat:30,lon:120},{time:'2025:05:01 15:00:00'}]);
  const r=reconstructPhotos(a,emptyDataset());assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].visits.length,3);
  assert.equal(r.candidates[0].start,'');assert.equal(r.candidates[0].transport,'unknown');assert.equal(r.candidates[0].visits[0].arrival,'unknown');
  assert.equal(r.candidates[0].visits[0].arrivalWindow.after,null);assert.equal(r.candidates[0].visits[1].arrivalWindow.state,'inferred');assert.equal(r.candidates[0].visits[1].arrivalWindow.after.localDateTime,'2025-05-01T08:00:00');assert.equal(r.candidates[0].visits[2].departureWindow.before,null);
});
test('timezone offsets order instants across New Year, while unzoned dates never acquire UTC',async()=>{
  const a=await assets([{time:'2026:01:01 00:30:00',offset:'+09:00',lat:35,lon:139},{time:'2025:12:31 08:00:00',offset:'-08:00',lat:37,lon:-122}]);
  const r=reconstructPhotos(a,emptyDataset());assert.equal(r.timeOrderBasis,'offset-instant');assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].visits[0].assetIds[0],a[0].assetId);
  const unzoned=await assets([{offset:null},{offset:null,time:'2025:05:02 01:00:00'}]);
  assert.equal(reconstructPhotos(unzoned,emptyDataset()).timeOrderBasis,'local-order-uncertain');assert.ok(unzoned.every(a=>a.extractedTime.utcEpochMs===null));
});
test('dated residences identify daily photos and return-home travel boundaries; names do not override GPS',async()=>{
  const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型,坐标\n2025~2026,,北京,现居地,"39.9,116.4"\n2025-05-02,旧旅行,同名地点,旅行,"30,120"');
  const a=await assets([{time:'2025:05:01 10:00:00'},{time:'2025:05:02 10:00:00',lat:30,lon:120},{time:'2025:05:03 10:00:00'}]);
  const r=reconstructPhotos(a,d);assert.equal(r.candidates.length,3);assert.equal(r.candidates[0].action,'memory');
  assert.equal(r.candidates[1].action,'link');assert.equal(r.candidates[1].relatedTripId,d.trips[0].id);assert.equal(r.candidates[2].action,'memory');
  const distant=await assets([{lat:1,lon:103}]);const v=reconstructPhotos(distant,d).candidates[0].visits[0];assert.equal(v.placeId,null);assert.match(v.placeName,/城市未知/);
});
test('missing GPS stays unlocated, missing time remains unknown and sparse evidence is explainable',async()=>{
  const a=await assets([{lat:null,lon:null},{time:null,offset:null},{time:'2025:05:01 09:00:00',lat:1,lon:103}]);
  const r=reconstructPhotos(a,emptyDataset());assert.deepEqual(r.unlocatedAssetIds,[a[0].assetId]);
  assert.equal(r.candidates.length,2);const unknown=r.candidates.find(c=>c.visits[0].assetIds.includes(a[1].assetId));assert.equal(unknown.visits[0].observedStart,null);
  assert.ok(r.candidates.every(c=>c.reasons.includes('single-photo-boundaries-unknown')));
});
test('manual merge/split/edit preserves immutable photo evidence and revision history',async()=>{
  const a=await assets([{time:'2025:05:01 10:00:00'},{time:'2025:06:01 10:00:00',lat:30,lon:120}]),original=structuredClone(a);
  const r=reconstructPhotos(a,emptyDataset());mergeCandidates(r,r.candidates.map(c=>c.id));assert.equal(r.candidates.length,1);
  editCandidate(r,r.candidates[0].id,{title:'我的旅行',chapterIds:[]});splitCandidate(r,r.candidates[0].id);assert.equal(r.candidates.length,2);
  assert.deepEqual(a,original);assert.deepEqual(r.manualRevisions.map(v=>v.action),['merge','edit','split']);
});
test('spatial grouping and residence thresholds distinguish exact boundary from just outside',async()=>{
  // Exact 0,0 is rejected as a no-fix GPS value, so the equator boundary starts just east of it.
  const a=await assets([{lat:0,lon:0.001,time:'2025:05:01 08:00:00'},{lat:0,lon:0.011,time:'2025:05:01 09:00:00'}]);
  const distance=distanceKm(a[0].coordinates,a[1].coordinates),d=emptyDataset();
  assert.equal(reconstructPhotos(a,d,{rules:{...RECONSTRUCTION_RULES,placeRadiusKm:distance}}).candidates[0].visits.length,1);
  assert.equal(reconstructPhotos(a,d,{rules:{...RECONSTRUCTION_RULES,placeRadiusKm:distance-1e-6}}).candidates[0].visits.length,2);
  importCSVInto(d,'日期,地点,类型,坐标\n2025,家,现居地,"0,0.001"');
  assert.equal(reconstructPhotos([a[1]],d,{rules:{...RECONSTRUCTION_RULES,homeRadiusKm:distance}}).candidates[0].action,'memory');
  assert.equal(reconstructPhotos([a[1]],d,{rules:{...RECONSTRUCTION_RULES,homeRadiusKm:distance-1e-6}}).candidates[0].action,'create');
});
