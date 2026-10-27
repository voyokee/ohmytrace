import test from 'node:test';
import assert from 'node:assert/strict';
import {cityHistory} from '../../src/ui/map-chooser.js';
import {projectDataset} from '../../src/life/renderer-adapter.js';
import {emptyDataset,addEvidence,partialDate} from '../../src/life/schema.js';
import {importCSVInto} from '../../src/life/legacy.js';
const period=(from,to=from)=>({start:Date.parse(from),end:Date.parse(to),label:from});

test('a city counts distinct journeys and filters by its own stop dates',()=>{
  const info={trips:[{id:'one',title:'跨年旅程',date:period('2025-01-01','2026-01-01'),stops:[{place:'昆明',date:period('2025-01-01')},{place:'大理',date:period('2026-01-01')},{place:'昆明',date:period('2025-02-01')}]},{id:'two',title:'重访',stops:[{place:'昆明',date:period('2026-02-01')}]}]};
  assert.equal(cityHistory(info,'昆明').journeys.length,2,'Two stops in one journey count once');
  assert.deepEqual(cityHistory(info,'昆明',{year:2026}).journeys.map(j=>j.trip.id),['two'],'A journey span must not assign the city to the wrong year');
});
test('former residence and later travel coexist; Chapter anchors do not invent residence',()=>{
  const info={homes:[{place:'成都',kind:'past',date:period('2015-01-01','2020-01-01')}],trips:[{id:'revisit',stops:[{place:'成都',date:period('2025-05-01')}]}]};
  const history=cityHistory(info,'成都');assert.equal(history.category,'曾住');assert.equal(history.past.length,1);assert.equal(history.journeys.length,1);
  assert.equal(cityHistory({homes:[{place:'成都',kind:'home',anchor:true}]},'成都').category,'阶段地点');
});
test('photo-only places remain visible without fabricating a residence or journey',()=>{
  const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2025-01-01,待整理,昆明,旅行,,"25.04,102.71"');
  const place=d.places[0];d.visits=[];d.trips=[];d.memories=[{id:'memory_photo',kind:'photo',uri:'android-media:external_primary/1',start:partialDate('2025-01-01'),end:partialDate('2025-01-01'),placeIds:[place.id],tripIds:[],evidenceIds:[]}];
  const snapshot=projectDataset(d);assert.deepEqual(snapshot.photoPlaces[0].years,[2025]);assert.equal(snapshot.rows[0].place,'昆明');assert.equal(snapshot.homes.length,0);assert.equal(snapshot.trips.length,0);
});
test('this year automatic home supersedes older unedited home labels while explicit manual classifications remain',()=>{
  const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型,备注,坐标\n2019~至今,,上海,现居地,,"31.23,121.47"\n2026~至今,,新加坡,现居地,,"1.3,103.85"');
  d.meta.photoAutoGrouping={version:3,year:String(new Date().getFullYear()),currentHomePlaceId:d.places[1].id};
  assert.equal(projectDataset(d).homes.find(h=>h.place==='上海').kind,'past');
  d.residences[0].evidenceIds.push(...addEvidence(d,'manual',{kind:'city-editor'},[{at:new Date().toISOString(),before:'past',after:'home'}]));
  assert.equal(projectDataset(d).homes.find(h=>h.place==='上海').kind,'home','Regroup must not overwrite manual classification');
});
