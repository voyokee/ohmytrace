import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeGlb} from '../src/scenery/vegetation-assets.js';
const limits={spruce:[92,212],broadleaf:[180,998],birch:[124,800],tropical:[180,908],shrub:[40,98],sakura:[180,998],grass:[38,84]};
const silhouettes=new Map();
for(const low of [true,false]) {
 const bytes=await readFile(new URL(`../assets/models/vegetation${low?'-low':''}.glb`,import.meta.url)),{json,bin}=decodeGlb(bytes);
 assert.ok(bytes.length<(low?160000:575000),'Canopy variation must stay within the asset memory budget');
 const values=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView];return new Float32Array(bin.buffer,bin.byteOffset+v.byteOffset,a.count*({VEC2:2,VEC3:3}[a.type]));};
 for(const mesh of json.meshes) {
  const primitive=mesh.primitives[0],position=json.accessors[primitive.attributes.POSITION];
  assert.ok(json.accessors[primitive.indices].count/3<=limits[mesh.name][low?0:1],`No extra triangles for ${mesh.name}`);
  assert.ok(position.min.every((n,k)=>n<=0&&position.max[k]>=0),'Root must lie in each original AABB for conservative contraction');
  const metadata=values(primitive.attributes.TEXCOORD_1),wind=values(primitive.attributes.TEXCOORD_0);
  assert.equal(metadata.length,position.count*2);assert.equal(wind.length,metadata.length);
  assert.ok(metadata.every((n,i)=>Number.isFinite(n)&&(i%2?n===0||n===1:n>=0&&n<=1)),'Only bounded flexibility and opaque leaf/bark masks are supported');
  if(mesh.name!=='grass'){
   assert.ok(metadata.some((n,i)=>i%2&&n===1),'Tree/shrub foliage must be marked');
   assert.ok(metadata.some((n,i)=>i%2&&n===0),'Wood must not receive the leaf colour variation');
  }
  if(['broadleaf','birch','tropical'].includes(mesh.name)) {
   const positions=values(primitive.attributes.POSITION),normals=values(primitive.attributes.NORMAL);
   assert.ok(positions.every(Number.isFinite));
   assert.ok(position.min[2]===0&&Math.abs(position.max[2]-1)<1e-6,'Branch redesign must preserve root and normalized tree height');
   // A coarse foliage face must still point outwards. Interpolated normals on the lobes
   // must not invert into the closed crown, which creates black faces after instancing.
   for(let i=0;i<positions.length;i+=9) {
    if(!metadata[i/3*2+1])continue;
    const a=positions.subarray(i,i+3),b=positions.subarray(i+3,i+6),c=positions.subarray(i+6,i+9),
     u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),
     n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    assert.ok(length>1e-8,'Leaf surfaces must not contain degenerate triangles');
    for(let j=0;j<3;j++)assert.ok(n.reduce((s,v,k)=>s+v/length*normals[i+j*3+k],0)>0,'Leaf normals must agree with visible face winding');
   }
   const bounds=position.max.map((v,k)=>v-position.min[k]);
   if(low)silhouettes.set(mesh.name,bounds);
   else bounds.forEach((v,k)=>assert.ok(Math.abs(v/silhouettes.get(mesh.name)[k]-1)<.15,'Detailed and orbital crowns must retain a comparable silhouette'));
  }
 }
}
console.log('PASS: unchanged orbital triangle budgets, smaller detailed assets, outward branch faces, comparable LOD silhouettes, bounded metadata and root-containing boxes');
