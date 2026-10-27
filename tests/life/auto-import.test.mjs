import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDataset,validateDataset} from '../../src/life/schema.js';
import {applyAutoImport,nameCells,cellKey,normalizeObservation,placeRenames,applyPlaceRenames,autoImportOutdated,removeAutoImportData} from '../../src/life/media/auto-import.js';
import {importCSVInto} from '../../src/life/legacy.js';

// Fictional offline names by rough region; the ocean resolves to nothing.
const geonames={async reverse({latitude,longitude}){
  if(latitude>22&&latitude<23&&longitude>113&&longitude<115)return {country:'中华人民共和国',countryCode:'CN',admin1:'广东省',city:'Shenzhen'};
  if(latitude<-8&&latitude>-9&&longitude>115&&longitude<115.25)return {country:'印度尼西亚',countryCode:'ID',admin1:'巴厘省',city:'Denpasar'};
  if(latitude<-8&&latitude>-9&&longitude>=115.25&&longitude<116)return {country:'印度尼西亚',countryCode:'ID',admin1:'巴厘省',city:'Ubud'};
  if(latitude>34&&latitude<36&&longitude>135&&longitude<136)return {country:'日本',countryCode:'JP',admin1:'京都府',city:'Kyoto'};
  if(latitude>1&&latitude<1.5&&longitude>103.6&&longitude<104.1)return {country:'新加坡',countryCode:'SG',admin1:null,city:'新加坡'};
  if(latitude>25.5&&latitude<26&&longitude>100&&longitude<100.4)return {country:'中华人民共和国',countryCode:'CN',admin1:'云南省',city:'大理'};
  if(latitude>26.7&&latitude<27&&longitude>100.1&&longitude<100.4)return {country:'中华人民共和国',countryCode:'CN',admin1:'云南省',city:'丽江'};
  if(latitude>31&&latitude<31.4&&longitude>121.3&&longitude<121.6)return {country:'中华人民共和国',countryCode:'CN',admin1:'上海市',city:'上海'};
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
async function run(data,input,names=geonames){return applyAutoImport(data,input,await nameCells(input.map(normalizeObservation).filter(Boolean),names));}

test('one-tap import merges places per city, splits trips at home and keeps pointers only',async()=>{
  const data=emptyDataset('new'),summary=await run(data,library());validateDataset(data);
  assert.equal(summary.photos,327,'null island, ocean and timeless photos are dropped silently');
  assert.deepEqual(data.trips.map(t=>t.title),['Ubud · Denpasar','Kyoto'],'titles use cities, never provinces');
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
  assert.notEqual(cellKey({latitude:-8.651,longitude:115.221}),cellKey({latitude:-8.66,longitude:115.215}));
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
  const summary=await run(data,[photo('2026-04-01',10,1.3,103.85),photo('2026-04-02',10,1.3,103.85),photo('2026-04-05',10,-8.65,115.22)]);validateDataset(data);
  assert.deepEqual(data.trips.map(t=>t.title).sort(),['Denpasar','独库公路'].sort());
  assert.ok(!data.places.some(p=>p.id==='place_old_photo'));assert.deepEqual(data.chapters[0].memoryIds,[]);assert.equal(data.chapters[0].relatedTripIds.length,1);
  assert.equal(summary.photos,3);assert.equal(removeLegacyPhotoData(data).memories,0,'nothing left to regroup');
});

test('places imported with English offline names are renamed to Chinese everywhere they show',async()=>{
  const data=emptyDataset('new');await run(data,library());
  const zh={Shenzhen:'深圳',Denpasar:'登巴萨',Ubud:'乌布',Kyoto:'京都'};
  const chinese={async reverse(point){const g=await geonames.reverse(point);return g&&{...g,city:zh[g.city]||g.city};}};
  const renames=await placeRenames(data,chinese);assert.equal(renames.size,4);
  applyPlaceRenames(data,renames);validateDataset(data);
  assert.deepEqual(data.places.map(p=>p.name).sort(),['乌布','京都','深圳','登巴萨'].sort());
  assert.equal(data.residences[0].title,'深圳');
  assert.ok(data.memories.every(m=>/^(深圳|登巴萨|乌布|京都) · /.test(m.title)),'photo titles follow the place name');
  assert.ok(data.visits.every(v=>/^(深圳|登巴萨|乌布|京都)$/.test(v.legacy.place)));
  assert.equal((await placeRenames(data,chinese)).size,0,'renaming is idempotent');
  const more=await run(data,[photo('2026-04-08',9,-8.66,115.22)],chinese);assert.equal(more.newPlaces,0,'later imports reuse the renamed place');
});

// Daily life in Singapore, then Dali and Lijiang straight after; an older CSV home in Shanghai.
function singaporeYear(){
  const out=[];
  for(let d=1;d<=65;d++){const day=new Date(Date.UTC(2025,6,d)).toISOString().slice(0,10);out.push(photo(day,12,1.30+(d%5)*0.01,103.85));}
  out.push(photo('2025-10-12',20,1.29,103.85),photo('2025-10-13',9,25.6,100.2),photo('2025-10-16',9,25.61,100.21),photo('2025-10-19',9,26.85,100.23),photo('2025-10-22',9,26.86,100.22),photo('2025-10-23',20,1.31,103.86));
  return out;
}
test('home is decided per year, so a trip never absorbs the home city even with an older residence on record',async()=>{
  const data=emptyDataset('new');importCSVInto(data,'日期,行程,地点,类型,备注,坐标\n2019-01~至今,,上海,现居地,,"31.23,121.47"','replace');
  await run(data,singaporeYear());validateDataset(data);
  assert.deepEqual(data.trips.map(t=>t.title),['大理 · 丽江'],'Singapore stays home; the trip is only Yunnan');
  const yunnan=data.trips[0];assert.deepEqual(yunnan.visitIds.map(id=>data.places.find(p=>p.id===data.visits.find(v=>v.id===id).placeId).name),['大理','丽江']);
  const singapore=data.residences.find(r=>data.places.find(p=>p.id===r.placeId).name==='新加坡');
  assert.ok(singapore,'the photo home becomes a residence');assert.equal(singapore.kind,'past','last year must not be labelled current');
  assert.equal(data.residences.length,2);
});

test('results grouped by older rules are rebuilt without touching CSV records',async()=>{
  const data=emptyDataset('new');importCSVInto(data,'日期,行程,地点,类型,备注,坐标\n2024-08-10~2024-08-18,独库公路,新疆那拉提,旅行,,"43.229,84.419"','replace');
  const input=singaporeYear();await run(data,input);
  for(const e of data.evidence)if(e.source?.kind==='photo-auto-import')e.source.version=1;
  delete data.meta.photoAutoGrouping; // A real v1 dataset predates this grouping marker.
  assert.equal(autoImportOutdated(data),true);
  removeAutoImportData(data);validateDataset(data);
  assert.deepEqual(data.trips.map(t=>t.title),['独库公路']);assert.equal(data.memories.length,0);assert.equal(data.residences.length,0);
  await run(data,input);validateDataset(data);
  assert.equal(autoImportOutdated(data),false);assert.deepEqual(data.trips.map(t=>t.title).sort(),['大理 · 丽江','独库公路'].sort());
});
