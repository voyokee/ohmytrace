import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OfflineAdminResolver} from '../../src/life/geocoding/offline-admin-resolver.js';
import {GeoNameProvider} from '../../src/life/geocoding/provider.js';
import {emptyDataset,partialDate,addEvidence} from '../../src/life/schema.js';
import {firstUseView} from '../../src/life/first-use.js';
import {recordCardModel} from '../../src/life/record-card.js';
import {tripTitle} from '../../src/life/media/journey-title.js';
import {regionOf,countsAsCountryKey} from '../../src/life/geocoding/region-policy.js';
import {applyAutoImport,nameCells,normalizeObservation,savedPhotoObservations,AUTO_VERSION,autoImportOutdated} from '../../src/life/media/auto-import.js';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {EditHistory} from '../../src/life/edits.js';
import {importCSVInto} from '../../src/life/legacy.js';import {projectDataset} from '../../src/life/renderer-adapter.js';
import {composeStory} from '../../src/life/story/compose.js';import {projectShare} from '../../src/life/story/share.js';
const load=async path=>JSON.parse(await readFile(new URL('../../src/life/geocoding/data/'+path,import.meta.url),'utf8'));
const provider=()=>new GeoNameProvider({offline:new OfflineAdminResolver({load}),cache:{get(){},set(){}}});
test('regional display and sovereign grouping apply at the provider boundary',async()=>{
 const g=provider();
 for(const [name,latitude,longitude,display,sovereign] of [
  ['台北',25.033,121.565,'中国台湾','CHN'],['高雄',22.627,120.301,'中国台湾','CHN'],
  ['金门',24.43,118.32,'中国','CHN'],['香港',22.282,114.158,'中国香港','CHN'],
  ['澳门',22.19,113.54,'中国澳门','CHN'],['深圳',22.541,114.0596,'中国','CHN'],
  ['达旺',27.586,91.859,'中国','CHN'],['首尔',37.566,126.978,'韩国','KOR'],
  ['普里什蒂纳',42.663,21.164,'科索沃地区','SRB'],['北尼科西亚',35.19,33.36,'塞浦路斯','CYP']
 ]){const r=await g.reverse({latitude,longitude});assert.equal(r.country,display,name);assert.equal(r.sovereignCode,sovereign,name);assert.equal(countsAsCountryKey(r.countryCode,r.admin1),sovereign,name);assert.ok(r.displayName.startsWith(display),name);if(name==='达旺')assert.equal(r.admin1,'西藏自治区（藏南地区）');if(name==='普里什蒂纳')assert.equal(r.admin1,'科索沃地区');}
 assert.notEqual((await g.reverse({latitude:25.74,longitude:123.47}))?.country,'日本');
});
test('all 242 bundled region names pass through the resolver policy; disputed defaults stay centralized',async()=>{
 const index=await load('index.json'),square={type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]};assert.equal(index.countries.length,242);
 for(const c of index.countries){
  const r=new OfflineAdminResolver({load:async p=>p==='index.json'?{countries:[{...c,bounds:[-1,-1,1,1]}]}:p==='city-index.json'?[]:p==='city-regions.json'?{}:{country:{...c,geometry:square},admins:[]}});
  const result=await r.reverse({latitude:0,longitude:0});assert.doesNotMatch(result.displayName,/中华民国|中华人民共和国|大韩民国/);assert.equal(regionOf(c.code).displayName,result.country,c.code);
 }
 for(const [code,name,key,kind]of [['KAS','克什米尔地区',null,'disputed'],['KOS','科索沃地区','SRB','disputed'],['CYN','塞浦路斯北部','CYP','disputed'],['SOL','索马里兰地区','SOM','disputed'],['IOA','澳属印度洋领地','IOA','territory']]){assert.equal(regionOf(code).displayName,name);assert.equal(countsAsCountryKey(code),key);assert.equal(regionOf(code).kind,kind);}
 assert.equal(regionOf('in','阿鲁纳恰尔邦').sovereignCode,'CHN');assert.equal(regionOf('in','旁遮普邦').sovereignCode,'IND');
});
test('upgrade persists corrected regions, retains IDs and respects a manually renamed place',async()=>{
 const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
 const photos=[{uri:'android-media:external_primary/1',latitude:25.033,longitude:121.565,local:'2026-01-01T12:00:00',offsetMinutes:480}],old={reverse:async()=>({country:'中华民国',countryCode:'TWN',city:'台北'})};
 await repository.update(async d=>applyAutoImport(d,photos,await nameCells(photos.map(normalizeObservation),old),{now:new Date('2026-10-28')}));
 const edits=new EditHistory(repository),p=repository.getDataset().places[0];await edits.execute({type:'rename',target:{kind:'place',id:p.id},name:'我的台北'});
 await repository.update(async d=>{d.meta.photoAutoGrouping.version=4;assert.ok(autoImportOutdated(d));const input=savedPhotoObservations(d);applyAutoImport(d,input,await nameCells(input.map(normalizeObservation),provider()),{force:true,now:new Date('2026-10-28')});});
 const d=repository.getDataset();assert.equal(d.places[0].id,p.id);assert.equal(d.places[0].name,'我的台北');assert.equal(d.places[0].location.photoCity.country,'中国台湾');assert.equal(d.places[0].location.photoCity.sovereignCode,'CHN');assert.equal(d.meta.photoAutoGrouping.version,AUTO_VERSION);
});
test('online ISO2 results and cached old labels use the same policy',async()=>{
 const old={country:'中华民国',countryCode:'tw',admin1:'台北市',city:'台北',displayName:'中华民国 / 台北市'};
 const g=new GeoNameProvider({online:{id:'online',reverse:async()=>old},cache:{get(){return old;},set(){}}});
 const r=await g.reverse({latitude:25,longitude:121},{online:true,consent:true});
 assert.equal(r.country,'中国台湾');assert.equal(r.countryCode,'tw');assert.equal(r.sovereignCode,'CHN');assert.ok(!r.displayName.includes('中华民国'));
});
test('installed old photoCity data is grouped and displayed correctly without regrouping',()=>{
 const d=emptyDataset();d.meta.firstUse={questions:[],answers:[],draftIds:[],status:'complete'};
 for(const [name,country,countryCode] of [['深圳','中华人民共和国','CHN'],['香港','香港','HKG'],['中华民国','中华民国',null],['东京','日本','JPN']]){
  const id='p'+d.places.length,evidenceIds=addEvidence(d,'inferred',{kind:'photo-auto-import'}),day=partialDate('2026-01-01');
  d.places.push({id,name,location:{photoCity:{country,countryCode,label:name}},evidenceIds});
  d.visits.push({id:'v'+id,placeId:id,tripId:null,start:day,end:day,legacy:{type:'旅行'},evidenceIds});
 }
 assert.equal(firstUseView(d).counts.countries,2);
 assert.equal(recordCardModel(d,{kind:'place',id:'p2'}).title,'中国台湾');
 const o=(label,country,day)=>({day,city:{key:label,label,country,region:country}});
 assert.equal(tripTitle([o('台北','中华民国','01'),o('高雄','中华民国','02'),o('台南','中华民国','03')],{homeCountry:'中华人民共和国'}),'台北、高雄等 3 城');
});
test('old country/admin fallback labels stay normalized in duplicate map keys and card links',()=>{
 const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型\n2026,旧记录,中华民国,旅行');
 const p=d.places[0];p.location.photoCity={country:'中华民国',countryCode:'TWN',label:'中华民国',hasCity:false,region:'中华民国'};d.places.push({...structuredClone(p),id:'duplicate'});
 const view=projectDataset(d);assert.deepEqual(Object.keys(view.places),['中国台湾','中国台湾 · 2']);
 assert.equal(recordCardModel(d,{kind:'trip',id:d.trips[0].id}).places[0].title,'中国台湾');
 p.name='阿鲁纳恰尔邦';p.location.photoCity={country:'印度',countryCode:'IND',label:p.name,hasCity:false,region:p.name};
 assert.equal(recordCardModel(d,{kind:'place',id:p.id}).title,'西藏自治区（藏南地区）');
});
test('persisted automatic journey titles use current regional policy before regrouping, manual titles remain',()=>{
 const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型\n2026-01-01,旧旅程,台北,旅行\n2026-01-02,旧旅程,高雄,旅行\n2026-01-03,旧旅程,台南,旅行');
 const t=d.trips[0];t.title=t.autoTitle='中华民国 · 台北等 3 城';t.visitIds=d.visits.map(v=>v.id);d.trips=[t];for(const v of d.visits)v.tripId=t.id;
 d.places.forEach((p,i)=>{const city={key:p.id,label:p.name,country:'中华民国',countryCode:'TWN',region:'台北市'};p.location.photoCity=city;const day=partialDate('2026-01-0'+(i+1));d.memories.push({id:'old-photo-'+i,kind:'photo',title:p.name,uri:'android-media:external_primary/'+(i+1),start:day,end:day,placeIds:[p.id],tripIds:[t.id],photoObservation:{day:day.value,takenMs:i,city},evidenceIds:[]});});
 d.places.push({id:'home',name:'成都',coordinates:null,location:{photoCity:{country:'中华人民共和国',countryCode:'CHN'}},evidenceIds:[]});d.meta.photoAutoGrouping={currentHomePlaceId:'home',version:4,year:'2026'};
 assert.equal(recordCardModel(d,{kind:'trip',id:t.id}).title,'台北、高雄等 3 城');
 assert.equal(projectShare(d,composeStory(d)).trips[0].title,'台北、高雄等 3 城');
 t.title='我给台湾旅行起的名字';assert.equal(recordCardModel(d,{kind:'trip',id:t.id}).title,t.title);
});
