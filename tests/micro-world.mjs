import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {forestSpecies,makeWorldForest,worldHeight,elevationAt,WORLD_BASE,WORLD_RELIEF,geographicPosition} from '../src/scenery/world-data.js';
import {SPECIES,decodeGlb,makeVegetationLibrary,instantiateVegetation} from '../src/scenery/vegetation-assets.js';
import {SCENE_TEMPLATES,sceneTemplateFor} from '../src/scenery/scene-templates.js';
import {CameraDirector} from '../src/rendering/camera-director.js';
import {vegetationDistanceBands} from '../src/scenery/instanced-vegetation.js';
import {sampleVegetation} from '../src/scenery/vegetation-sampling.js';
import {SCENE_DEMOS,demoCsv} from '../src/scenery/scene-demos.js';
import {filterSteepPlants} from '../src/scenery/terrain-placement.js';

assert.equal(forestSpecies(121,31,[.1,.2,.7],100),null,'Ocean pixels must not seed forest');
assert.equal(forestSpecies(121,31,[.15,.35,.12],0),null,'Sea-level DEM must exclude water/ambiguous coasts');
assert.equal(forestSpecies(90,31,[.2,.3,.15],5000),null,'Alpine terrain must stay above the treeline');
assert.equal(forestSpecies(110,60,[.15,.35,.12],300),'spruce');
assert.equal(forestSpecies(130,46,[.15,.35,.12],300),'birch');
assert.equal(forestSpecies(110,10,[.15,.35,.12],300),'tropical');
const map=(r,g,b)=>({width:1,height:1,data:new Uint8ClampedArray([r,g,b,255])});
const green=map(30,90,20),height=map(30,30,30);
assert.equal(worldHeight(map(0,0,0),121,31),WORLD_BASE);
assert.equal(worldHeight(map(255,255,255),121,31),WORLD_BASE+6400*WORLD_RELIEF);
const forest=makeWorldForest(green,height,{maxInstances:200});
assert.equal(forest.count,200,'Global population must obey its memory budget');
assert.deepEqual(forest,makeWorldForest(green,height,{maxInstances:200}),'Global placement must be deterministic');
assert.equal(makeWorldForest(map(20,30,150),height).count,0);
assert.ok(forest.chunks.every(c=>c.plants.every(p=>p.ground>WORLD_BASE&&p.height>0)));
assert.ok(Math.abs(geographicPosition(0,0)[0]-6378137)<.001);
assert.ok(Math.abs(geographicPosition(0,90)[2]-6356752.314245)<.001);
for(const [name,id] of [['阿尔山','birch_forest'],['呼伦贝尔','grassland'],['稻城亚丁','alpine_snow'],['京都','sakura'],['上海','coastal_city'],['新疆天山','mountain_forest']])
  assert.equal(sceneTemplateFor({name,month:4}).id,id);
assert.equal(sceneTemplateFor({name:'京都',month:11}).particles,'pollen','Cherry petals must follow the trip season');
assert.equal(sceneTemplateFor({name:'敦煌戈壁'}).id,'desert');
assert.equal(sceneTemplateFor({name:'呼伦贝尔草原'}).treeSpecies,undefined,'Open steppe must keep grass and scrub');
assert.ok(sceneTemplateFor({name:'那拉提'}).treeSpecies.spruce,'Nalati mountain forests must retain conifers');
assert.equal(sceneTemplateFor({name:'阿尔山',lat:47,month:10}).autumn,1);
assert.equal(sceneTemplateFor({name:'阿尔山',lat:47,month:1}).particles,'snow');
assert.equal(sceneTemplateFor({template:'birch_forest',lat:-47,month:4}).autumn,1,'Seasonal foliage must follow the hemisphere');
assert.equal(sceneTemplateFor({template:'__proto__'}).id,'mountain_forest','Unknown template keys must use the normal habitat fallback');
for(const [id,demo]of Object.entries(SCENE_DEMOS)) {
  assert.equal(sceneTemplateFor({...demo,template:id}).id,id);
  assert.ok(demoCsv(demo).includes('虚构景观演示'));
}
assert.equal(elevationAt({width:2,height:1,data:new Uint8ClampedArray([0,0,0,255,255,255,255,255])},0,0),3200,'Relief must interpolate between source heights');
const dryOptions={width:256,data:new Uint8ClampedArray(256*256*4),darkV:.4,cpx:128,cpy:128,
  mPerPx:10,radius:3000,x0:0,y0:0,n:16384,treeCap:100,flowerCap:0,seed:934};
for(let i=0;i<dryOptions.data.length;i+=4)dryOptions.data.set([155,125,75,255],i);
assert.equal((await sampleVegetation(dryOptions)).length,0,'Ordinary forest must not spread onto dry bare ground');
const scrub=await sampleVegetation({...dryOptions,arid:true});
assert.ok(scrub.length>0&&scrub.length<=100,'Arid habitats must carry sparse bounded scrub');
const river=dryOptions.data.slice();for(let i=0;i<river.length;i+=4)river.set([25,60,48,255],i);
assert.equal((await sampleVegetation({...dryOptions,data:river,flowerCap:100})).length,0,'Green wetland water must not grow forest or grass');
const hillside=Array.from({length:25},(_,i)=>({lon:100+(i%5)*.0005,lat:30+Math.floor(i/5)*.0005,ground:(i%5)*100,species:'spruce'}));
assert.equal((await filterSteepPlants(hillside,{checkpoint:async()=>{}})).length,0,'Cliff faces must not carry vertical tree clusters');
const flat=hillside.map(p=>({...p,ground:100}));
assert.equal((await filterSteepPlants(flat,{checkpoint:async()=>{}})).length,flat.length,'Flat forest must retain its population');
assert.equal(sceneTemplateFor({height:5000,groundHeight:2000}).id,'mountain_forest','Artistic exaggeration must not move the real treeline');
for(const constrained of [false,true]) {
  const bands=vegetationDistanceBands(constrained);
  assert.equal(bands[0].near,0);assert.ok(bands.at(-1).far<=10000);
  bands.slice(1).forEach((b,i)=>assert.equal(b.near,bands[i].far,'LOD bands must cover distance without overlaps/gaps'));
  if(constrained)assert.ok(bands.every(b=>b.low),'Constrained devices must not load detailed crowns');
}

for(const low of [false,true]) {
  const file=await readFile(new URL(`../assets/models/vegetation${low?'-low':''}.glb`,import.meta.url));
  assert.deepEqual(new Uint8Array(file),makeVegetationLibrary(low),'Bundled 3D models must match the reproducible source');
  const {json,bin}=decodeGlb(file);assert.equal(json.meshes.length,SPECIES.length);
  for(const mesh of json.meshes) {
    const p=mesh.primitives[0],a=json.accessors[p.attributes.POSITION];
    assert.ok(a.max[0]>a.min[0]&&a.max[1]>a.min[1]&&a.max[2]-a.min[2]>.4,'Every plant must have actual 3D volume');
    assert.ok(json.accessors[p.indices].count>=18);
    const aUV=json.accessors[p.attributes.TEXCOORD_0],aNormal=json.accessors[p.attributes.NORMAL];
    assert.equal(aUV.count,a.count,'Wind height coordinates must be present for every instanced vertex');
    const view=json.bufferViews[aNormal.bufferView],values=new Float32Array(bin.buffer,bin.byteOffset+view.byteOffset,aNormal.count*3);
    for(let i=0;i<values.length;i+=3)assert.ok(Math.abs(Math.hypot(...values.subarray(i,i+3))-1)<.0001,'Normals must be finite and normalized');
  }
  const encoded=instantiateVegetation(file,[{species:'birch',translations:new Float32Array([0,0,0,50,0,0]),
    rotations:new Float32Array([0,0,0,1,0,0,0,1]),scales:new Float32Array([20,20,30,25,25,35])}]);
  const instanced=decodeGlb(encoded),attributes=instanced.json.nodes[0].extensions.EXT_mesh_gpu_instancing.attributes;
  assert.deepEqual(instanced.json.extensionsRequired,['EXT_mesh_gpu_instancing']);
  assert.ok(Object.values(attributes).every(i=>instanced.json.accessors[i].count===2));
  for(const view of instanced.json.bufferViews)assert.ok(view.byteOffset+view.byteLength<=instanced.bin.length);
  assert.equal(json.buffers[0].byteLength,bin.length);
}
const viewer={canvas:{dataset:{}}},director=new CameraDirector(viewer);
const old=director.begin('entering'),current=director.begin('leaving');
assert.equal(director.finish(old,'immersive'),false,'A cancelled flight must not finish a newer scene');
assert.equal(director.finish(current,'global'),true);
director.update({altitude:2000,flying:false,scenery:'京都'});assert.equal(viewer.canvas.dataset.cameraPhase,'immersive');
director.update({altitude:10000000,flying:false,scenery:null});assert.equal(viewer.canvas.dataset.cameraPhase,'global');
console.log('PASS: biome/water/elevation rules, bounded deterministic population, geographic relief, themed scenes, reproducible 3D GLBs, GPU instance buffers and camera tickets');
