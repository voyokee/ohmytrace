import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeGlb} from '../src/scenery/vegetation-assets.js';
const limits={spruce:[92,212],broadleaf:[180,998],birch:[124,800],tropical:[180,908],shrub:[40,98],sakura:[180,998],grass:[38,84]};
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
 }
}
console.log('PASS: unchanged orbital triangle budgets, smaller detailed assets, bounded canopy metadata and conservative root-containing boxes');
