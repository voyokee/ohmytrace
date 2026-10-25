import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mountainRefinements,worldSurfacePlan} from '../src/scenery/surface-topology.js';
import {makeWorldSurface,surfaceGround,installSurfaceSampling} from '../src/scenery/world-surface.js';
const map=(value)=>({width:1,height:1,data:new Uint8ClampedArray([value,value,value,255])});
for(const constrained of [true,false]) {
 const plan=worldSurfacePlan(constrained),cap=Math.floor(plan.rows*plan.columns*(constrained ? .05 : .07));
 for(const value of [0,140,220])assert.ok(mountainRefinements(map(value),constrained).every(x=>x===0),'Flat oceans/plateaus must not consume refinement budget');
 const rugged={width:64,height:32,data:new Uint8ClampedArray(64*32*4)};
 for(let i=0;i<rugged.data.length;i+=4){const value=(i*113%251);rugged.data.set([value,value,value,255],i);}
 const first=mountainRefinements(rugged,constrained),second=mountainRefinements(rugged,constrained);
 assert.deepEqual(first,second);assert.ok(first.reduce((n,x)=>n+x,0)<=cap);
}
// Exercise isolated and adjacent mountains, all transition-edge orientations and seam neighbours.
const constrained=true,plan=worldSurfacePlan(constrained),flags=new Uint8Array(plan.rows*plan.columns),source={width:64,height:32,data:new Uint8ClampedArray(64*32*4)};
for(let y=0;y<32;y++)for(let x=0;x<64;x++){const v=30+(x*17+y*13)%210;source.data.set([v,v,v,255],(y*64+x)*4);}
for(const [i,j] of [[10,20],[11,20],[30,40],[30,41],[0,55],[plan.columns-1,55],[80,90]])flags[j*plan.columns+i]=1;
installSurfaceSampling(source,constrained,flags);
const mesh=await makeWorldSurface(source,{constrained}),edges=new Map();
for(let i=0;i<mesh.indices.length;i+=3) {
 const t=mesh.indices.subarray(i,i+3);
 for(let k=0;k<3;k++) {const a=t[k],b=t[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
}
for(const [edge,count] of edges) {
 assert.ok(count===1||count===2,'No duplicated or nonmanifold triangle edges');
 if(count===1) {
  const [a,b]=edge.split(':').map(Number),ax=mesh.st[a*2],ay=mesh.st[a*2+1],bx=mesh.st[b*2],by=mesh.st[b*2+1];
  assert.ok(ax===0&&bx===0||ax===1&&bx===1||ay===0&&by===0||ay===1&&by===1,'Internal edges must be paired, without coarse/fine cracks');
 }
}
assert.ok(mesh.indices.length/3<=plan.rows*plan.columns*2+18*flags.reduce((n,x)=>n+x,0),'Adaptive triangles must remain within their explicit worst-case budget');
for(let i=0;i<mesh.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...mesh.normals.subarray(i,i+3))-1)<1e-6,'Geometry normals must be finite unit vectors');
const seamNormals=new Map();
for(let i=0;i<mesh.st.length;i+=2) {
 if(mesh.st[i]!==0&&mesh.st[i]!==1)continue;
 const y=mesh.st[i+1],n=Array.from(mesh.normals.subarray(i/2*3,i/2*3+3));
 if(seamNormals.has(y))assert.deepEqual(n,seamNormals.get(y),'Duplicated longitude vertices must share the same smooth normal');
 else seamNormals.set(y,n);
}
const context={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream};
context.global=context;context.self=context;vm.createContext(context);vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),context);
const C=context.Cesium;let comparisons=0;
// Independent actual-geometry contact check: barycentric points on rendered triangles become
// geodetic rays using native Cesium math. Include fine and transition triangles, not just flat quads.
const stride=plan.columns+1;
for(let i=0;i<mesh.indices.length;i+=3) {
 const ids=mesh.indices.subarray(i,i+3);if(!ids.some(k=>k>=stride*(plan.rows+1))&&i%6177!==0)continue;
 const p=new C.Cartesian3();
 for(let n=0;n<3;n++){const k=ids[n]*3,w=[.25,.35,.4][n];p.x+=mesh.positions[k]*w;p.y+=mesh.positions[k+1]*w;p.z+=mesh.positions[k+2]*w;}
 const c=C.Cartographic.fromCartesian(p);if(Math.abs(c.latitude)>1.55)continue;
 const ground=surfaceGround(source,c.longitude*180/Math.PI,c.latitude*180/Math.PI,constrained);
 assert.ok(Math.abs(ground-c.height)<1e-4,'Roots must contact the actual refined or transition triangle');comparisons++;
}
assert.ok(comparisons>100);
console.log(`PASS: deterministic bounded mountain refinement, manifold coarse/fine/seam topology, smooth unit normals and ${comparisons} native-engine root contacts`);
