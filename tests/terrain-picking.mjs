import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildTerrainPickIndex,pickTerrainIndex,terrainStamp,sameTerrainStamp,installTerrainPicking} from '../src/rendering/terrain-picking.js';
import {random} from '../src/scenery/world-data.js';

// Load the exact bundled engine as a math library, without a browser, GPU, DOM or network.
const context={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,
  TransformStream,ReadableStream,WritableStream};context.global=context;context.self=context;
try{vm.createContext(context);vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),context);}
catch(error){throw new Error('Bundled engine: '+error.message);}
const C=globalThis.Cesium=context.Cesium,nativePick=C.GlobeSurfaceTile.prototype.pick;
const scheme=new C.WebMercatorTilingScheme(),projection=new C.WebMercatorProjection();
function fixture({width=33,exaggeration=1.65,x=14370,y=6486,relative=0}={}) {
  const buffer=new Float32Array(width*width);
  for(let j=0;j<width;j++)for(let i=0;i<width;i++)buffer[j*width+i]=500+800*Math.sin(i*.41)*Math.cos(j*.33);
  const data=new C.HeightmapTerrainData({buffer,width,height:width});
  const mesh=data._createMeshSync({tilingScheme:scheme,x,y,level:14,exaggeration,exaggerationRelativeHeight:relative});
  const tile=new C.GlobeSurfaceTile();tile.mesh=mesh;tile.terrainData=data;tile.vertexArray={};
  return {mesh,tile,rectangle:scheme.tileXYToRectangle(x,y,14)};
}
function rayAt(rectangle,u,v,{upward=false,angle=0}={}) {
  const lon=rectangle.west+(rectangle.east-rectangle.west)*u,lat=rectangle.south+(rectangle.north-rectangle.south)*v;
  const origin=C.Cartesian3.fromRadians(lon,lat,upward?-20000:30000);
  const direction=C.Ellipsoid.WGS84.geodeticSurfaceNormal(origin,new C.Cartesian3());
  C.Cartesian3.multiplyByScalar(direction,upward?1:-1,direction);direction.x+=angle;
  C.Cartesian3.normalize(direction,direction);return new C.Ray(origin,direction);
}
let comparisons=0,maxError=0;
function compare(tile,index,ray,cull=false) {
  const expected=nativePick.call(tile,ray,C.SceneMode.SCENE3D,projection,cull,new C.Cartesian3());
  const output=new C.Cartesian3(),actual=pickTerrainIndex(index,ray,cull,output);comparisons++;
  assert.equal(!!actual,!!expected,'Accelerated and native triangle intersection must agree on hit/miss');
  if(expected){const error=C.Cartesian3.distance(actual,expected);maxError=Math.max(maxError,error);
    assert.ok(error<.002,`Terrain position must agree within 2 mm, error=${error}`);assert.equal(actual,output);}
}
try {
  const rnd=random(6817);
  for(const exaggeration of [1,1.65,2.4]) {
    const f=fixture({exaggeration,relative:exaggeration===2.4?300:0});
    const index=await buildTerrainPickIndex(f.mesh,{checkpoint:async()=>{}});
    assert.ok(f.mesh.indices.length>f.mesh.indexCountWithoutSkirts,'Fixtures must include terrain skirts');
    for(let i=0;i<60;i++) {
      const u=i<5?[0,.000001,.5,.999999,1][i]:rnd(),v=rnd();
      compare(f.tile,index,rayAt(f.rectangle,u,v));
      compare(f.tile,index,rayAt(f.rectangle,u,v,{upward:true}),i%2===0);
      compare(f.tile,index,rayAt(f.rectangle,u,v,{angle:(rnd()-.5)*.15}));
    }
    // Rays normal to skirt triangles exercise vertical edges and off-grid intersections.
    for(let i=f.mesh.indexCountWithoutSkirts;i<f.mesh.indices.length;i+=Math.max(3,Math.floor((f.mesh.indices.length-f.mesh.indexCountWithoutSkirts)/24/3)*3)) {
      const points=[0,1,2].map(k=>f.mesh.encoding.getExaggeratedPosition(f.mesh.vertices,f.mesh.indices[i+k],new C.Cartesian3()));
      const center=C.Cartesian3.multiplyByScalar(C.Cartesian3.add(C.Cartesian3.add(points[0],points[1],new C.Cartesian3()),points[2],new C.Cartesian3()),1/3,new C.Cartesian3());
      const normal=C.Cartesian3.cross(C.Cartesian3.subtract(points[1],points[0],new C.Cartesian3()),C.Cartesian3.subtract(points[2],points[0],new C.Cartesian3()),new C.Cartesian3());
      if(C.Cartesian3.magnitude(normal)<.0001)continue;C.Cartesian3.normalize(normal,normal);
      const origin=C.Cartesian3.add(center,C.Cartesian3.multiplyByScalar(normal,100,new C.Cartesian3()),new C.Cartesian3());
      compare(f.tile,index,new C.Ray(origin,C.Cartesian3.negate(normal,new C.Cartesian3())));
    }
    const stamp=terrainStamp(f.mesh);assert.equal(sameTerrainStamp(f.mesh,stamp),true);
    f.mesh.encoding.exaggeration+=.1;assert.equal(sameTerrainStamp(f.mesh,stamp),false);f.mesh.encoding.exaggeration-=.1;
  }
  const large=fixture({width:129}),largeIndex=await buildTerrainPickIndex(large.mesh,{checkpoint:async()=>{}});
  const centerRay=rayAt(large.rectangle,.5,.5);compare(large.tile,largeIndex,centerRay);
  assert.ok(largeIndex.lastTests<large.mesh.indices.length/3*.05,'Index must avoid at least 95% of triangle tests on a height ray');
  const before=performance.now();for(let i=0;i<3;i++)nativePick.call(large.tile,centerRay,C.SceneMode.SCENE3D,projection,false,new C.Cartesian3());
  const nativeMs=(performance.now()-before)/3,fastStart=performance.now();
  for(let i=0;i<30;i++)pickTerrainIndex(largeIndex,centerRay,false,new C.Cartesian3());
  const fastMs=(performance.now()-fastStart)/30;

  const cancellation=new AbortController();let checkpoints=0;
  await assert.rejects(buildTerrainPickIndex(large.mesh,{signal:cancellation.signal,checkpoint:async()=>{if(++checkpoints===2)cancellation.abort();}}),e=>e.name==='AbortError');
  const changed=fixture();let steps=0;
  await assert.rejects(buildTerrainPickIndex(changed.mesh,{checkpoint:async()=>{if(++steps===2)changed.mesh.encoding.exaggeration=3;}}),e=>e.name==='AbortError');
  const invalid=fixture();invalid.mesh.encoding.getExaggeratedPosition=(_vertices,_i,result)=>{result.x=NaN;return result;};
  await assert.rejects(buildTerrainPickIndex(invalid.mesh,{checkpoint:async()=>{}}),/Invalid terrain position/,'Invalid geometry must fall back to the engine, never create an unsafe spatial bound');

  const viewer={camera:{positionCartographic:{height:1000}},scene:{preUpdate:new C.Event(),requestRender(){}},isDestroyed:()=>false};
  const cache=installTerrainPicking(viewer);
  const idle=async()=>{const until=performance.now()+5000;while(cache.details().terrainPickPending){assert.ok(performance.now()<until,'Index build must terminate');await new Promise(r=>setTimeout(r,5));}};
  const f=fixture(),ray=rayAt(f.rectangle,.42,.62);
  f.tile.pick(ray,C.SceneMode.SCENE3D,projection,false,new C.Cartesian3());await idle();
  f.tile.pick(ray,C.SceneMode.SCENE3D,projection,false,new C.Cartesian3());
  assert.ok(cache.details().terrainPickHits>0);
  for(let i=0;i<18;i++){const other=fixture({x:14380+i});other.tile.pick(rayAt(other.rectangle,.5,.5),C.SceneMode.SCENE3D,projection,false,new C.Cartesian3());await idle();}
  assert.ok(cache.details().terrainPickMeshes<=16);assert.ok(cache.details().terrainPickMiB<=24);
  viewer.camera.positionCartographic.height=2000000;viewer.scene.preUpdate.raiseEvent();
  assert.equal(cache.details().terrainPickMeshes,0);assert.equal(cache.details().terrainPickMiB,0);
  viewer.camera.positionCartographic.height=1000;f.tile.pick(ray,C.SceneMode.SCENE3D,projection,false,new C.Cartesian3());
  cache.dispose();await idle();assert.equal(C.GlobeSurfaceTile.prototype.pick,nativePick);
  globalThis.Cesium={...C,VERSION:'future-version'};
  assert.equal(installTerrainPicking(viewer).details().terrainPickEnabled,false);globalThis.Cesium=C;
  console.log(`PASS: ${comparisons} native-engine ray comparisons (max ${maxError.toExponential(2)} m), skirts, backfaces, exaggeration, cancellation, LRU, release and compatibility; 129² tile native ${nativeMs.toFixed(2)} ms vs indexed ${fastMs.toFixed(3)} ms`);
} catch(error){console.error(error.message);process.exitCode=1;}
