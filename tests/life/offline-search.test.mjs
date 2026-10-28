import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {OfflineAdminResolver} from '../../src/life/geocoding/offline-admin-resolver.js';
import {GeoNameProvider} from '../../src/life/geocoding/provider.js';
import {OnlineGeocoderAdapter} from '../../src/life/geocoding/online-geocoder-adapter.js';
import {emptyDataset} from '../../src/life/schema.js';import {importCSVInto,updatePlace} from '../../src/life/legacy.js';
const load=async p=>JSON.parse(await readFile(new URL('../../src/life/geocoding/data/'+p,import.meta.url),'utf8'));
test('default and bulk search never contact the online boundary; cached online lookup still needs consent',async()=>{
 let calls=0;const g=new GeoNameProvider({offline:{id:'offline',search:async()=>[]},online:{id:'online',search:async()=>{calls++;return [];}},cache:{get(){},set(){}}});
 for(let i=0;i<20;i++)await g.search('地点'+i);assert.equal(calls,0);
 await assert.rejects(g.search('九寨沟',{online:true}),/确认|同意/);assert.equal(calls,0);
 await g.search('九寨沟',{online:true,consent:true});assert.equal(calls,1);
});
test('bundled city/admin/country search supplies inferred compatible coordinates and regional labels',async()=>{
 const r=new OfflineAdminResolver({load});
 for(const name of ['北京','成都','大理','京都','清迈']){const rows=await r.search(name);assert.ok(rows.length,name);assert.equal(rows[0].name,name);assert.ok(Number.isFinite(+rows[0].lat)&&Number.isFinite(+rows[0].lon),name);assert.equal(rows[0].state,'inferred');assert.equal(rows[0].source,'离线');}
 assert.equal((await r.search('九寨沟')).length,0);
 assert.equal((await r.search('中国台湾'))[0].sovereignCode,'CHN');
 assert.ok((await r.search('云南省',{countrycodes:'cn',featureType:'state'})).some(r=>r.name==='云南省'));
 assert.ok((await r.search('北京市')).some(r=>r.name==='北京'));
 assert.equal((await r.search('京都',{countrycodes:'cn'})).length,0);
 assert.equal((await r.search('')).length,0);
});
test('direct online search also requires consent and sends only one name',async()=>{
 const queries=[],adapter=new OnlineGeocoderAdapter({intervalMs:0,fetcher:async url=>{queries.push(url);return {ok:true,json:async()=>[]};}});
 await assert.rejects(async()=>adapter.search('九寨沟'),/同意/);assert.equal(queries.length,0);
 await adapter.search('九寨沟',{consent:true,limit:6});assert.equal(queries.length,1);assert.equal(queries[0].searchParams.get('q'),'九寨沟');assert.ok(!queries[0].searchParams.has('consent'));assert.ok(!queries[0].searchParams.has('online'));
});
test('persisted automatic locations retain the actual offline source',()=>{
 const d=emptyDataset();importCSVInto(d,'日期,行程,地点,类型\n2026,测试,成都,旅行');
 updatePlace(d,d.places[0].id,{lat:30.67,lon:104.06,status:'auto',source:'离线',state:'inferred'},{manual:false});
 assert.equal(d.evidence.at(-1).source.provider,'离线');assert.equal(d.places[0].location.source,'离线');
});
test('online lookup retains the Window receiver required by browser-native fetch',async()=>{
 const adapter=new OnlineGeocoderAdapter({intervalMs:0,fetcher:async function(){assert.equal(this,globalThis,'Browser-native fetch must receive Window');return {ok:true,json:async()=>[]};}});
 await adapter.search('九寨沟',{consent:true});
});
