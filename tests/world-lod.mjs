import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createWorldForest} from '../src/scenery/world-forest.js';
const context={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream};
context.global=context;context.self=context;vm.createContext(context);vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),context);
const C=globalThis.Cesium=context.Cesium;globalThis.location={search:''};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture(constrained=false) {
 const items=new Set(),created=[];let requests=0;
 const viewer={camera:{positionWC:C.Cartesian3.fromDegrees(0,0,10000000)},scene:{requestRender(){requests++;},
  primitives:{add(model){items.add(model);return model;},remove(model){if(!items.delete(model))return false;model.destroy();return true;}}}};
 const forest={count:40,chunks:Array.from({length:40},(_,i)=>({key:String(i),lon:-50+i*2.5,lat:0,plants:[{species:'spruce',height:5000}]}))};
 const manager=createWorldForest(viewer,forest,{constrained,loadAssets:async()=>{},createModel:async(_viewer,chunk,options)=>{
  assert.equal(options.far,100000000,'Short mountain crowns must retain the global distance band through LOD replacements');
  const model={key:chunk.key,low:options.low,ready:false,readyEvent:new C.Event(),errorEvent:new C.Event(),destroyed:false,
   destroy(){assert.equal(this.destroyed,false,'Each model must be destroyed once');this.destroyed=true;}};
  created.push(model);return model;
 }});
 let now=0;
 const update=async(altitude=10000000,mix=1,elapsed=600)=>{now+=elapsed;manager.update({altitude,mix,day:1,now});await flush();};
 const readyAll=()=>{for(const m of created)if(!m.destroyed&&!m.ready){m.ready=true;m.readyEvent.raiseEvent();}};
 const settle=async(altitude=10000000)=>{for(let i=0;i<22;i++){readyAll();await update(altitude);}readyAll();await update(altitude);};
 return {viewer,manager,items,created,update,readyAll,settle};
}
const f=fixture();await f.settle();
assert.equal(f.manager.details().worldChunks,28);assert.equal(f.manager.details().worldTrees,28);
const originals=new Set(f.items);
await f.update(4500000);
assert.ok([...originals].every(m=>!m.destroyed),'Crossing the old LOD boundary must retain the ready forest');
assert.equal(f.manager.details().worldStaging,2,'Only two replacements may prepare GPU resources together');
assert.equal(f.manager.details().worldTrees,28,'An unready LOD must never empty the visible forest');
assert.ok(f.items.size<=30);
f.readyAll();await f.update(4500000,1,16);
assert.equal(f.manager.details().worldTrees,28);
assert.equal([...originals].filter(m=>m.destroyed).length,2,'Ready replacements may retire only their own old models');
await f.settle(4500000);
assert.equal(f.manager.details().worldDetailed,4,'Orbital detail must obey its four-chunk budget');
// Start a reverse replacement, then change direction before its GPU resources become ready.
await f.update(6000000);const incoming=f.created.filter(m=>!m.destroyed&&!m.ready);
assert.ok(incoming.length>0);await f.update(4500000,1,16);
assert.ok(incoming.every(m=>m.destroyed),'A reversed flight must discard stale replacements');
assert.equal(f.manager.details().worldTrees,28);assert.equal(f.manager.details().worldDetailed,4);
// A failed replacement must preserve the usable model, while retaining retry/backoff diagnostics.
await f.update(6000000);const failing=f.created.find(m=>!m.destroyed&&!m.ready);
assert.ok(failing);const warn=console.warn;console.warn=()=>{};
failing.errorEvent.raiseEvent(new Error('GPU fixture failure'));console.warn=warn;
assert.equal(f.manager.details().worldTrees,28);assert.equal(f.manager.details().worldFailures,1);
await f.update(10000000,0,16);
assert.equal(f.items.size,0);assert.equal(f.manager.details().worldChunks,0);assert.equal(f.manager.details().worldStaging,0);
f.manager.dispose();
const phone=fixture(true);await phone.settle(4500000);phone.manager.toggleDetail();await phone.settle(4500000);
assert.equal(phone.manager.details().worldChunks,12);assert.equal(phone.manager.details().worldDetailed,0);
assert.ok(phone.created.every(m=>m.low),'Phone quality must never fetch detailed orbital models');phone.manager.dispose();
console.log('PASS: atomic orbital LOD replacement, visible-tree continuity, staging/detail/memory budgets, reversal, failure retention and exit cleanup');
