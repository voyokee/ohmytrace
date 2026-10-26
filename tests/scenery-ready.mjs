import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SceneryManager} from '../src/scenery/scenery-manager.js';
const ctx={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream};
ctx.global=ctx;ctx.self=ctx;vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),ctx);
const C=globalThis.Cesium=ctx.Cesium;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
 const live=new Set(),created=[],effects=[];let maximumPending=0;
 const layer={brightness:1,saturation:1,contrast:1};
 const viewer={canvas:{dataset:{}},scene:{fog:{density:.001,screenSpaceErrorFactor:2},requestRender(){},primitives:{
  add(m){live.add(m);return m;},remove(m){if(live.delete(m))m.destroy();}}},imageryLayers:{get(){return layer;}}};
 const manager=new SceneryManager(viewer,{loadAssets:async()=>{},createModel:async(v,chunk,options)=>{
  const model={chunk,options,ready:false,readyEvent:new C.Event(),errorEvent:new C.Event(),show:true,
   destroy(){assert.equal(this.destroyed,undefined,'Destroy every model once');this.destroyed=true;}};
  created.push(model);maximumPending=Math.max(maximumPending,created.filter(m=>!m.destroyed&&!m.ready).length);return model;
 }});
 manager.effects={enter(config,plants=[]){effects.push(plants);},exit(){},update(){},details(){return {mist:0,particles:0};},dispose(){}};
 const enter=name=>manager.enter({name,lon:120,lat:47,height:1650,groundHeight:1000,exaggeration:1.65,template:'birch_forest',month:10});
 const ready=m=>{m.ready=true;m.readyEvent.raiseEvent();};
 const settle=async()=>{for(let i=0;i<12;i++){for(const m of created)if(!m.destroyed&&!m.ready)ready(m);await flush();}};
 return {manager,created,live,effects,enter,ready,settle,pending:()=>maximumPending};
}
const plants=Object.freeze([0,1,2].map(i=>Object.freeze({lon:120+i*.02,lat:47+i*.02,ground:1000+i*100+.3,species:'birch',height:25,width:1,angle:0})));
const f=fixture();f.enter('first');const loading=f.manager.populate('first',plants);await flush();
assert.equal(f.created.length,2,'Only two models may enter GPU preparation together');
assert.equal(f.manager.details().sceneryPhase,'loading','Parsed glTF is not GPU-ready scenery');
assert.equal(f.effects.at(-1).length,0,'Do not hand off effects before all GPU models are ready');
f.ready(f.created[0]);await flush();assert.equal(f.created.length,3);
assert.ok(f.pending()<=2,'Ready events, rather than loader completion, release a preparation slot');
await f.settle();await loading;
assert.equal(f.manager.details().sceneryPhase,'ready');assert.equal(f.created.length,6);
assert.ok(f.pending()<=2);assert.equal(f.manager.details().sceneryModels,6);
for(const m of f.created)for(const p of m.chunk.plants){
 const source=plants.find(x=>x.lon===p.lon);assert.ok(Math.abs(p.ground-((source.ground-.3)*1.65+.3))<1e-8);
 assert.equal(m.readyEvent.numberOfListeners,0);assert.equal(m.errorEvent.numberOfListeners,0);
}
assert.ok(Math.abs(f.effects.at(-1)[0].ground-1650.3)<1e-8,'Mist and models must share rendered roots, without a second exaggeration');
assert.equal(plants[0].ground,1000.3,'Sampling/slopes must retain original physical roots');
f.manager.exit();assert.equal(f.live.size,0);assert.equal(f.manager.details().sceneryRootHeights,null);
// A stale GPU wait must never abort the controller of a newly selected place.
f.enter('old');const old=f.manager.populate('old',plants);await flush();const retired=f.created.filter(m=>!m.destroyed);
f.enter('new');await old;assert.equal(f.manager.controller.signal.aborted,false);
assert.ok(retired.every(m=>m.destroyed&&m.readyEvent.numberOfListeners===0&&m.errorEvent.numberOfListeners===0));
const current=f.manager.populate('new',plants);await flush();await f.settle();await current;
assert.equal(f.manager.details().sceneryPhase,'ready');f.manager.dispose();assert.equal(f.live.size,0);
// A failed GPU preparation cannot report readiness or let another load keep filling the queue.
const failure=fixture();failure.enter('broken');const p=failure.manager.populate('broken',plants);await flush();
const warn=console.warn;console.warn=()=>{};
failure.created[0].errorEvent.raiseEvent(new Error('GPU fixture failure'));await p;console.warn=warn;
assert.equal(failure.manager.details().sceneryPhase,'unavailable');assert.equal(failure.created.length,2);
assert.equal(failure.manager.controller.signal.aborted,true);failure.manager.dispose();assert.equal(failure.live.size,0);
console.log('PASS: two real GPU-preparation slots, delayed scenery handoff, physical/rendered root separation, effect alignment, abort cleanup, stale-controller isolation and failed-GPU fallback');
