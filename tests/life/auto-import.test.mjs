import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDataset,validateDataset} from '../../src/life/schema.js';
import {applyAutoImport,nameCells,cellKey,normalizeObservation} from '../../src/life/media/auto-import.js';

// Fictional offline names by rough region; the ocean resolves to nothing.
const geonames={async reverse({latitude,longitude}){
  if(latitude>22&&latitude<23&&longitude>113&&longitude<115)return {country:'中华人民共和国',countryCode:'CN',admin1:'广东省',city:'Shenzhen'};
  if(latitude<-8&&latitude>-9&&longitude>115&&longitude<115.25)return {country:'印度尼西亚',countryCode:'ID',admin1:'巴厘省',city:'Denpasar'};
  if(latitude<-8&&latitude>-9&&longitude>=115.25&&longitude<116)return {country:'印度尼西亚',countryCode:'ID',admin1:'巴厘省',city:'Ubud'};
  if(latitude>34&&latitude<36&&longitude>135&&longitude<136)return {country:'日本',countryCode:'JP',admin1:'京都府',city:'Kyoto'};
  return null;
}};
let n=0;
const photo=(day,hour,latitude,longitude,extra={})=>({uri:`android-media:external_primary/${++n}`,latitude,longitude,local:`${day}T${String(hour).padStart(2,'0')}:00:00`,offsetMinutes:480,...extra});
function library(){
  const out=[];
  for(let d=1;d<=20;d++)out.push(photo(`2026-03-${String(d).padStart(2,'0')}`,12,22.54+d*0.001,114.05));
  for(let i=0;i<300;i++)out.push(photo(`2026-04-0${5+Math.floor(i/100)}`,8+i%10,-8.65-(i%7)*0.01,i%2?115.22:115.26));
  for(let d=21;d<=25;d++)out.push(photo(`2026-04-${d}`,12,22.54,114.05));
  out.push(photo('2026-05-02',10,35.01,135.76),photo('2026-05-03',10,35.02,135.77));
  out.push(photo('2026-05-04',10,0,0),photo('2026-05-04',11,10,170),{uri:'android-media:external_primary/no-time',latitude:22.5,longitude:114.05});
  return out;
}
async function run(data,input){const names=await nameCells(input.map(normalizeObservation).filter(Boolean),geonames);return applyAutoImport(data,input,names);}

test('one-tap import merges places per city, splits trips at home and keeps pointers only',async()=>{
  const data=emptyDataset('new'),summary=await run(data,library());validateDataset(data);
  assert.equal(summary.photos,327,'null island, ocean and timeless photos are dropped silently');
  assert.deepEqual(data.trips.map(t=>t.title),['印度尼西亚之旅','日本之旅']);
  assert.deepEqual(data.places.map(p=>p.name).sort(),['Denpasar','Kyoto','Shenzhen','Ubud'],'300 Bali photos collapse to two city places');
  const bali=data.trips[0];assert.equal(bali.visitIds.length,2);assert.deepEqual([bali.start.value,bali.end.value],['2026-04-05','2026-04-07']);
  assert.equal(data.residences.length,1);assert.equal(data.places.find(p=>p.id===data.residences[0].placeId).name,'Shenzhen');
  assert.ok(data.memories.every(m=>m.uri.startsWith('android-media:')&&m.kind==='photo'));
  assert.equal(data.memories.filter(m=>!m.tripIds.length).length,25,'home photos are memories of the home place, not a trip');
  assert.equal(summary.latestTripId,data.trips[1].id);
});

test('re-importing is idempotent and new photos extend the overlapping trip',async()=>{
  const data=emptyDataset('new'),input=library();await run(data,input);
  const before=JSON.stringify({trips:data.trips.length,places:data.places.length,memories:data.memories.length});
  const again=await run(data,input);assert.equal(again.photos,0);assert.equal(JSON.stringify({trips:data.trips.length,places:data.places.length,memories:data.memories.length}),before);
  const extra=await run(data,[photo('2026-04-08',9,-8.66,115.22)]);
  assert.equal(extra.newTrips,0);assert.equal(extra.newPlaces,0);assert.equal(data.trips[0].end.value,'2026-04-08');
  validateDataset(data);
});

test('observations without usable time or position are rejected before naming',()=>{
  assert.equal(normalizeObservation({uri:'a',latitude:0,longitude:0,local:'2026-01-01T00:00:00'}),null);
  assert.equal(normalizeObservation({uri:'a',latitude:91,longitude:0,local:'2026-01-01T00:00:00'}),null);
  assert.equal(normalizeObservation({uri:'a',latitude:1,longitude:1}),null);
  assert.equal(normalizeObservation({uri:'a',latitude:1,longitude:1,local:'2026-01-01T08:00:00',offsetMinutes:480}).instant,Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(cellKey({latitude:-8.651,longitude:115.221}),cellKey({latitude:-8.66,longitude:115.215}));
});

test('demo data is replaced and existing CSV trips absorb overlapping photos',async()=>{
  const demo=emptyDataset('demo');demo.meta.origin='demo';const s=await run(demo,[photo('2026-05-02',10,35.01,135.76)]);
  assert.equal(demo.meta.origin,'user');assert.equal(s.photos,1);
});

test('the first one-tap run regroups the old review-based photo import but keeps CSV records',async()=>{
  const {importCSVInto}=await import('../../src/life/legacy.js'),{removeLegacyPhotoData}=await import('../../src/life/media/auto-import.js');
  const data=emptyDataset('new');importCSVInto(data,'日期,行程,地点,类型,备注,坐标\n2024-08-10~2024-08-18,独库公路,新疆那拉提,旅行,,"43.229,84.419"','replace');
  const ev=kind=>{const id=`evidence_${kind}`;data.evidence.push({id,state:'inferred',source:{kind},revisions:[]});return id;};
  const place={id:'place_old_photo',name:'城市未知',coordinates:{latitude:-8.65,longitude:115.22},location:{status:'confirmed'},evidenceIds:[ev('photo-exif')]};
  const trip={id:'trip_old_photo',title:'照片记录 · 2026-04-05',type:'照片旅行',start:{precision:'unknown',value:null},end:{precision:'unknown',value:null},visitIds:['visit_old_photo'],evidenceIds:[ev('photo-reconstruction')]};
  const visit={id:'visit_old_photo',placeId:place.id,tripId:trip.id,start:{precision:'day',value:'2026-04-05'},end:{precision:'day',value:'2026-04-05'},legacy:{date:'',trip:'',place:'',type:'',note:''},evidenceIds:[ev('photo-visit')]};
  data.places.push(place);data.trips.push(trip);data.visits.push(visit);
  data.memories.push({id:'memory_old',kind:'photo',title:'IMG_1.HEIC',uri:'media:asset_1',start:visit.start,end:visit.end,placeIds:[place.id],tripIds:[trip.id],evidenceIds:['evidence_photo-exif']});
  data.chapters.push({id:'chapter_1',title:'旅居',type:'other',start:{precision:'year',value:'2026'},end:{precision:'year',value:'2026'},homeAnchors:[],relatedTripIds:[trip.id,data.trips[0].id],memoryIds:['memory_old'],evidenceIds:[]});
  validateDataset(data);
  assert.deepEqual(removeLegacyPhotoData(data),{memories:1,trips:1});
  const summary=await run(data,[photo('2026-04-05',10,-8.65,115.22)]);validateDataset(data);
  assert.deepEqual(data.trips.map(t=>t.title).sort(),['巴厘之旅','独库公路'].sort());
  assert.ok(!data.places.some(p=>p.id==='place_old_photo'));assert.deepEqual(data.chapters[0].memoryIds,[]);assert.equal(data.chapters[0].relatedTripIds.length,1);
  assert.equal(summary.photos,1);assert.equal(removeLegacyPhotoData(data).memories,0,'nothing left to regroup');
});
