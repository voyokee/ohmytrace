import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {groundHandoff,contractedHeight,surfaceHandoffVertexShader} from '../src/rendering/terrain-handoff.js';
import {installHandoffBounds} from '../src/scenery/handoff-bounds.js';
import {createEarthMaterials} from '../src/rendering/earth-materials.js';
import {ROOT_LIFT,exaggeratedRoot} from '../src/scenery/terrain-placement.js';
const ctx={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream,
 HTMLCanvasElement:class{},HTMLImageElement:class{},HTMLVideoElement:class{}};
ctx.global=ctx;ctx.self=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),ctx);
const C=globalThis.Cesium=ctx.Cesium;
// Compare authored roots against the bundled terrain encoding's actual exaggerated
// vertices. Physical sampling/slopes and rendered heights must remain separate units.
for(const physical of [0,1000,4200])for(const exaggeration of [1,1.65,2.4]) {
 const data=new C.HeightmapTerrainData({buffer:new Float32Array(9).fill(physical),width:3,height:3});
 const mesh=data._createMeshSync({tilingScheme:new C.WebMercatorTilingScheme(),x:14370,y:6486,level:14,
  exaggeration,exaggerationRelativeHeight:0});
 const point=mesh.encoding.getExaggeratedPosition(mesh.vertices,4,new C.Cartesian3());
 const terrainHeight=C.Cartographic.fromCartesian(point).height;
 assert.ok(Math.abs(exaggeratedRoot(physical,exaggeration)-terrainHeight-ROOT_LIFT)<1,
  'Rendered vegetation roots must match native exaggerated terrain within its encoding precision');
}
let previous=1;
for(let h=0;h<=8000000;h+=1000){const b=groundHandoff(h);assert.ok(b>=0&&b<=previous&&previous-b<.002);previous=b;}
assert.equal(groundHandoff(2400000),0);assert.equal(groundHandoff(1400000),1);
for(const height of [12000,40000,150000,354000]) {
 let last=height;
 for(let i=0;i<=1000;i++){const h=contractedHeight(height,i/1000);assert.ok(h>=0&&h<=last&&last-h<=height*.00101);last=h;}
 assert.equal(contractedHeight(height,0),height);
 assert.ok(Math.abs(last-Math.max(0,(height-12000)*1.65/30))<1e-8);
}
// Independent native ellipsoid support check for the same root/up construction as GPU instances.
for(const lat of [-70,-45,0,32,68])for(const lon of [-179,0,121,179])for(const height of [12000,80000,354000]) {
 const p=C.Cartesian3.fromDegrees(lon,lat,height),up=C.Ellipsoid.WGS84.geodeticSurfaceNormal(p),r=C.Ellipsoid.WGS84.radii;
 const support=Math.hypot(up.x*r.x,up.y*r.y,up.z*r.z),inferred=C.Cartesian3.dot(p,up)-support;
 assert.ok(Math.abs(inferred-C.Cartographic.fromCartesian(p).height)<1,'Shader height inference must agree with native geodetic height');
}
// Use real Fabric renaming and the bundled native appearance source, not guessed uniform names.
const img=new ctx.HTMLImageElement();img.width=img.height=32;
const mats=createEarthMaterials({day:img,height:img,depth:img,night:img,cloud:img,contact:img});
const vertex=surfaceHandoffVertexShader(mats.surface);assert.ok(vertex);
for(const [,name] of vertex.matchAll(/uniform float (\w+);/g))assert.equal(typeof mats.surface._uniforms[name],'function');
const blendName=vertex.match(/uniform float (groundBlend_\d+);/)[1];
mats.surface.uniforms.groundBlend=.75;assert.equal(mats.surface._uniforms[blendName](),.75);
assert.ok(vertex.includes('czm_modelViewProjectionRelativeToEye * p')&&vertex.includes('czm_normal * adjustedNormal'));
assert.equal((vertex.match(/czm_computePosition\(\)/g)||[]).length,1);
// Real ModelDrawCommand instances verify that original and derived render commands share the
// enlarged sphere. Rebuilds must replace the base bounds, never accumulate another padding.
const model={shadows:C.ShadowMode.DISABLED,_initialRadius:100,_boundingSphere:new C.BoundingSphere(C.Cartesian3.ZERO,100)};
let primitive,builds=0;
const graph=model._sceneGraph={_runtimeNodes:[{runtimePrimitives:[]}],_boundingSphere:new C.BoundingSphere(C.Cartesian3.ZERO,100),
 get boundingSphere(){return this._boundingSphere;},buildDrawCommands(arg){
  builds++;this._boundingSphere=new C.BoundingSphere(C.Cartesian3.ZERO,100);model._initialRadius=100;model._boundingSphere=new C.BoundingSphere(C.Cartesian3.ZERO,100);
  primitive=new C.ModelRuntimePrimitive({primitive:{material:{doubleSided:false}},node:{},model});
  primitive.boundingSphere=new C.BoundingSphere(C.Cartesian3.ZERO,100);
  const command=new C.DrawCommand({modelMatrix:C.Matrix4.IDENTITY,boundingVolume:C.BoundingSphere.clone(primitive.boundingSphere),
   pass:C.Pass.OPAQUE,renderState:{cull:{enabled:true,face:C.CullFace.BACK}},cull:true});
  primitive.drawCommand=new C.ModelDrawCommand({command,primitiveRenderResources:{model,runtimePrimitive:primitive,hasSilhouette:false,hasSkipLevelOfDetail:false}});
  this._runtimeNodes[0].runtimePrimitives=[primitive];return arg;
 }};
graph.buildDrawCommands();const control=installHandoffBounds(model,50);
function verify(radius){
 assert.equal(model._initialRadius,radius);assert.equal(graph.boundingSphere.radius,radius);assert.equal(primitive.boundingSphere.radius,radius);
 assert.equal(primitive.drawCommand.boundingVolume.radius,radius);
 for(const d of primitive.drawCommand._derivedCommands){assert.equal(d.command.boundingVolume.radius,radius);assert.equal(d.command.cull,true);}
}
verify(150);assert.equal(installHandoffBounds(model,50),control);verify(150);
control.setActive(false);verify(100);control.setActive(false);verify(100);control.setActive(true);verify(150);
assert.equal(graph.buildDrawCommands('preserved'),'preserved');verify(150);
assert.equal(graph.buildDrawCommands('again'),'again');verify(150);assert.equal(builds,3);
primitive.drawCommand.modelMatrix=C.Matrix4.fromTranslation(new C.Cartesian3(3,4,5));verify(150);
control.setActive(false);verify(100);graph.buildDrawCommands();verify(100);
console.log('PASS: continuous bounded terrain/root handoff, native ellipsoid heights, real Fabric vertex bindings, native/derived culling spheres, rebuilds, inactive restoration and original render contracts');
