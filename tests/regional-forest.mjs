import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {regionalState,regionalPlants} from '../src/scenery/regional-forest-data.js';
import {RegionalForest} from '../src/scenery/regional-forest.js';
import {presentationState} from '../src/rendering/presentation-state.js';
import {decodeGlb,instantiateVegetation} from '../src/scenery/vegetation-assets.js';
const flat=(r,g=r,b=r)=>({width:1,height:1,data:new Uint8ClampedArray([r,g,b,255])});
const maps={day:flat(30,90,20),height:flat(20),night:flat(0)},center={lon:125,lat:47};
for(const limit of [220,900]) {
 const a=regionalPlants(maps,center,256000,{limit});assert.ok(a.length>0&&a.length<=limit);
 assert.deepEqual(a,regionalPlants(maps,center,256000,{limit}));
 assert.ok(a.some(p=>p.lat<center.lat)&&a.some(p=>p.lat>center.lat),'Capping must cover both halves of the field');
 for(const [name,m] of [['water',{...maps,day:flat(20,30,150)}],['city',{...maps,night:flat(220,200,140)}],['snow',{...maps,height:flat(240)}]])
  assert.equal(regionalPlants(m,center,256000,{limit}).length,0,name);
 assert.ok(regionalPlants(maps,{lon:179.99,lat:40},256000,{limit}).every(p=>p.lon>=-180&&p.lon<=180));
}
for(let altitude=14000;altitude<4000000;altitude+=1000) {
 const s=regionalState(altitude,{localReady:true});assert.ok(s.opacity+presentationState(altitude,true).mix>.7);
 assert.ok(s.treeHeight/6000>0&&s.treeHeight/6000<=1,'Contract within authored model bounds');
}
assert.ok(regionalState(2000).opacity>regionalState(2000,{localReady:true}).opacity,'Retain trees until nearby vegetation is ready');
const context={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream};
context.global=context;context.self=context;vm.createContext(context);
vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),context);
const C=globalThis.Cesium=context.Cesium;
const library=readFileSync(new URL('../assets/models/vegetation-low.glb',import.meta.url)),before=decodeGlb(library),alias=decodeGlb(instantiateVegetation(library,[],{sourcePosition:true}));
assert.equal(alias.bin.length,before.bin.length,'Position alias must not allocate another vertex buffer');
for(const mesh of alias.json.meshes)for(const p of mesh.primitives)assert.equal(p.attributes._SOURCE_POSITION,p.attributes.POSITION);
assert.equal(C.ModelUtility.getAttributeInfo({name:'_SOURCE_POSITION',type:'VEC3'}).variableName,'source_position');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const live=new Set(),jobs=[],created=[];let hold=false;
const viewer={canvas:{clientWidth:1000,clientHeight:800},terrainProvider:{},camera:{pickEllipsoid:()=>C.Cartesian3.fromDegrees(125,47)},
 scene:{verticalExaggeration:1,requestRender(){},primitives:{add(m){live.add(m);return m;},remove(m){if(live.delete(m))m.destroy();}}}};
const shader={setUniform(){},destroy(){this.destroyed=true;}};
const forest=new RegionalForest(viewer,maps,{shader,
 survey:(level,points)=>new Promise((resolve,reject)=>jobs.push({level,points,resolve,reject})),
 createModel:async(v,chunk,options)=>{
  assert.ok(options.regional&&options.low&&options.far>1e7);
  const model={chunk,ready:!hold,color:C.Color.WHITE.clone(),readyEvent:new C.Event(),errorEvent:new C.Event(),destroy(){this.destroyed=true;}};
  created.push(model);return model;
 }});
const focus=C.Cartesian3.fromDegrees(125,47),tick=(now,altitude,extra={})=>forest.update({now,altitude,day:1,focus,...extra});
const finish=async()=>{const j=jobs.shift();j.points.forEach((p,i)=>p.height=i%3?700:0);j.resolve(j.points);await flush();return j;};
forest.preload(focus,8,0);tick(100,5000000);assert.equal(jobs.length,1);assert.equal((await finish()).level,8);
tick(1000,300000);tick(2000,300000);assert.ok(forest.details().regionalReady&&forest.details().regionalInstances<=900);
assert.ok(live.size<=4&&live.size>0);
for(const model of live)for(const p of model.chunk.plants)assert.equal(p.ground,700.3,'Reject surveyed sea-level roots');
const old=[...live];hold=true;tick(3000,100000);await finish();
assert.equal(forest.details().regionalStaging,2);assert.ok(old.every(m=>live.has(m)),'Retain old trees during GPU preparation');
for(let pass=0;pass<2;pass++){for(const m of created.filter(m=>!m.ready&&!m.destroyed)){m.ready=true;m.readyEvent.raiseEvent();}await flush();}
tick(3100,100000);assert.equal(forest.details().regionalSets,2);assert.ok(live.size<=8);
tick(4000,100000);assert.equal(forest.details().regionalSets,1);assert.ok(old.every(m=>m.destroyed));
hold=false;viewer.scene.verticalExaggeration=1.65;tick(5000,100000);await finish();tick(6000,100000);
for(const model of forest.sets.at(-1).models)for(const p of model.chunk.plants)assert.ok(Math.abs(p.ground-1155.3)<1e-8,'Exaggerate native roots exactly once');
tick(7000,25000);jobs.shift().reject(new Error('Terrain temporarily unavailable'));await flush();
assert.equal(forest.failures,1);assert.ok(live.size>0,'Retain current trees after a failed survey');
tick(7500,25000);assert.equal(jobs.length,0,'Back off after failure');
tick(12000,25000);assert.equal(jobs.length,1);tick(12100,11000000,{focus:null});assert.equal(live.size,0);
await finish();assert.equal(live.size,0,'Stale terrain must not resurrect models after exit');
forest.dispose();assert.ok(shader.destroyed);
console.log('PASS: regional eligibility/caps/seams/overlap, zero-copy source positions, pinned attributes, native roots, two GPU jobs, retained replacements, backoff and stale disposal');
