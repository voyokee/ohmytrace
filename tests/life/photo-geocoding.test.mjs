import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {OfflineAdminResolver,containsPoint} from '../../src/life/geocoding/offline-admin-resolver.js';
import {GeoNameProvider} from '../../src/life/geocoding/provider.js';import {PlaceNameCache} from '../../src/life/geocoding/place-name-cache.js';import {OnlineGeocoderAdapter} from '../../src/life/geocoding/online-geocoder-adapter.js';
const load=async path=>JSON.parse(await readFile(new URL('../../src/life/geocoding/data/'+path,import.meta.url),'utf8'));
test('actual offline packs locate Hangzhou in Zhejiang and label city match as nearby, never observed',async()=>{
 const loads=[],resolver=new OfflineAdminResolver({load:async p=>{loads.push(p);return load(p);}});
 const r=await resolver.reverse({latitude:30.2741,longitude:120.1551});assert.match(r.country,/中国|中华人民共和国/);assert.match(r.admin1,/浙江/);assert.equal(r.city,'杭州');assert.equal(r.precision,'nearby-city');assert.equal(r.cityMatch,'nearest-centre-not-boundary');assert.equal(r.state,'inferred');assert.equal(r.crs,'WGS84');assert.ok(r.distanceKm<5);
 assert.ok(loads.includes('CHN.json'));assert.ok(!loads.includes('USA.json'));await assert.rejects(resolver.reverse({latitude:30,longitude:120,crs:'GCJ-02'}));assert.equal(await resolver.reverse({latitude:0,longitude:-140}),null);
});
test('polygon holes, multipolygons and exact borders do not become false city containment',()=>{
 const geometry={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[2,2],[8,2],[8,8],[2,8],[2,2]]]};
 assert.equal(containsPoint(geometry,{latitude:1,longitude:1}),true);assert.equal(containsPoint(geometry,{latitude:4,longitude:4}),false);assert.equal(containsPoint(geometry,{latitude:0,longitude:5}),false);
 assert.equal(containsPoint({type:'MultiPolygon',coordinates:[geometry.coordinates]},{latitude:1,longitude:1}),true);
});
test('offline is default, online consent applies even to cached labels, errors fall back, exact keys avoid boundary bleed',async()=>{
 let calls=0;const provider=new GeoNameProvider({offline:{id:'offline',reverse:async p=>({source:'offline',displayName:String(p.latitude)})},online:{id:'online',reverse:async()=>{calls++;throw new Error('offline');}},cache:new PlaceNameCache({storage:null})});
 const p={latitude:1,longitude:2};assert.equal((await provider.reverse(p)).source,'offline');assert.equal(calls,0);
 await assert.rejects(provider.reverse(p,{online:true}),/确认/);assert.equal((await provider.reverse(p,{online:true,consent:true})).onlineFailed,true);assert.equal(calls,1);
 assert.notEqual((await provider.reverse({...p,latitude:1.000001})).displayName,(await provider.reverse(p)).displayName);
});
test('online requests serialize, cache search and preserve source without uploading photo data',async()=>{
 let active=0,max=0,calls=0;const adapter=new OnlineGeocoderAdapter({intervalMs:0,fetcher:async url=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;assert.equal(url.origin,'https://nominatim.openstreetmap.org');return {ok:true,json:async()=>[]};}});
 await Promise.all([adapter.search('one',{consent:true}),adapter.search('two',{consent:true})]);assert.equal(max,1);
 const provider=new GeoNameProvider({online:adapter,cache:new PlaceNameCache({storage:null})});await provider.search('same',{online:true,consent:true});await provider.search('same',{online:true,consent:true});assert.equal(calls,3);
 await assert.rejects(provider.search('same',{online:true}),/确认/);
 await assert.rejects(adapter.reverse({latitude:1,longitude:2}),/同意/);
});
