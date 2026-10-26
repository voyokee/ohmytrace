import assert from 'node:assert/strict';
import {worldBiome,steppeWeight,WORLD_BIOMES} from '../src/scenery/world-biomes.js';
import {makeWorldForest,forestSpecies,urbanCore} from '../src/scenery/world-data.js';
import {makeCanopyContact} from '../src/scenery/canopy-contact.js';
import {visualBenchmark} from '../src/performance/visual-benchmark.js';
const map=(r,g,b)=>({width:1,height:1,data:new Uint8ClampedArray([r,g,b,255])});
assert.equal(worldBiome(119.17,49.32,650).id,'steppe','Hulunbuir lowlands must remain open');
assert.equal(worldBiome(122,48,900).id,'birch','The eastern Khingan slopes must keep their forest identity');
assert.equal(worldBiome(84.4,43.2,2200).id,'mountain');
assert.equal(worldBiome(110,19,600).id,'tropical');
assert.equal(worldBiome(-65,-10,600).id,'tropical','Tropical direction must also work beyond Asia');
assert.equal(worldBiome(-110,60,500).id,'boreal');
assert.ok(worldBiome(119.17,49.32,650).density<WORLD_BIOMES.birch.density*.12);
assert.ok(steppeWeight(119,49,2100)<.01,'High mountain slopes must escape the lowland steppe envelope');
for(let lon=85;lon<132;lon+=.1)
 assert.ok(Math.abs(steppeWeight(lon,49,650)-steppeWeight(lon+.1,49,650))<.05,'Region edges must be feathered');
assert.equal(forestSpecies(110,30,[25/255,60/255,48/255],350),null,'Green lake water must not grow trees');
assert.equal(forestSpecies(110,30,[.70,.52,.26],350),null,'Desert cores must stay bare');
assert.equal(forestSpecies(90,30,[.95,.95,.97],5200),null,'Permanent snow must stay bare');
const green=map(30,90,20),height=map(30,30,30);
assert.equal(urbanCore(map(220,160,75),121,31),true);
assert.equal(urbanCore(map(25,15,5),121,31),false,'Rural lights must not erase whole regions');
assert.equal(makeWorldForest(green,height,{nightMap:map(220,160,75)}).count,0,'Bright city cores must exclude trees');
const forest=makeWorldForest(green,height,{maxInstances:120});
for(const constrained of [false,true]) {
 const empty=makeCanopyContact({chunks:[]},{constrained});
 assert.equal(empty.data.byteLength,constrained?512*256*4:1024*512*4);
 assert.ok(empty.data.every((v,i)=>v===(i%4===3?255:0)),'No trees must mean no contact shadow');
 const atlas=makeCanopyContact(forest,{constrained});
 assert.ok(atlas.data.some((v,i)=>i%4===0&&v>0),'Actual crowns must leave contact shading');
 assert.ok(atlas.data.every((v,i)=>i%4!==1||v===0),'Contact baking alone must not recolour biome ground');
}
// A footprint crossing the antimeridian must shade both sides, without bleeding into a pole.
const seam=makeCanopyContact({chunks:[{plants:[{lon:179.98,lat:0,height:150000,width:1,species:'spruce'}]}]});
const red=(x,y)=>seam.data[(y*seam.width+x)*4];
assert.ok(red(0,256)>0&&red(1023,256)>0);
assert.equal(red(0,0),0);
assert.deepEqual(visualBenchmark('?view=asia').view,null,'Review presets must be opt-in');
assert.deepEqual(visualBenchmark('?benchmark=1&view=asia').view,{lon:105,lat:28});
assert.equal(visualBenchmark('?quality=mobile').mobile,true);
assert.equal(visualBenchmark('?benchmark=1&view=__proto__').view,null);
console.log('PASS: regional biome edges, steppe/forest contrast, non-Asian habitats, urban/water/snow exclusions, bounded canopy atlas and repeatable review cameras');

const {makeWorldSurface,surfaceGround,worldSurfacePlan}=await import('../src/scenery/world-surface.js');
const {geographicPosition,WORLD_BASE}=await import('../src/scenery/world-elevation.js');
const surface=await makeWorldSurface(height,{constrained:true});
const {rows,columns}=worldSurfacePlan(true);
assert.equal(surface.positions.length,(rows+1)*(columns+1)*3);
assert.equal(surface.indices.length,rows*columns*6);
assert.ok(surface.indices.every(i=>i<surface.positions.length/3));
for(let j=0;j<rows;j+=19)for(let i=0;i<columns;i+=29) {
 const k=j*(columns+1)+i,lon=(i+.27)/columns*360-180,lat=90-(j+.31)/rows*180;
 const p=geographicPosition(lon,lat,surfaceGround(height,lon,lat,true));
 const point=n=>surface.positions.slice(n*3,n*3+3),a=point(k),b=point(k+1),c=point(k+columns+1);
 const v=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-a[i]);
 const normal=[v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]];
 const distance=Math.abs(normal.reduce((n,x,i)=>n+x*(p[i]-a[i]),0))/Math.hypot(...normal);
 assert.ok(distance<1e-6,'Tree roots must meet the actual triangle plane, including Earth curvature');
}
// Sloping height map, second half of a quad, and seam wrapping.
const hill={width:4,height:2,data:new Uint8ClampedArray([10,10,10,255,180,180,180,255,40,40,40,255,90,90,90,255,
  20,20,20,255,90,90,90,255,50,50,50,255,200,200,200,255])};
assert.ok(Number.isFinite(surfaceGround(hill,121.6,31.25)));
assert.ok(Math.abs(surfaceGround(hill,-180,30)-surfaceGround(hill,180,30))<1e-7);
assert.ok(surfaceGround(map(0,0,0),0,0)<=WORLD_BASE+1e-6);
console.log('PASS: shared global surface topology, finite buffers, exact plane contact and antimeridian roots');
const {worldHeight,WORLD_RELIEF}=await import('../src/scenery/world-elevation.js');
assert.equal(worldHeight(map(100,100,100),0,40),WORLD_BASE+100/255*6400*WORLD_RELIEF,
 'Ridge enhancement must leave a flat plateau unchanged');
assert.equal(worldHeight(map(0,0,0),0,0),WORLD_BASE,'Sea-level displacement must stay unchanged');
assert.ok(worldHeight(hill,-45,45)>=WORLD_BASE,'Shaped relief must remain above its base');
assert.equal(worldBiome(10,46,2400).treeline,2200,'Alpine peaks must not be covered by large lowland crowns');
await assert.rejects(makeWorldSurface(height,{constrained:true,checkpoint:async()=>{
 throw new DOMException('Cancelled','AbortError');
}}),error=>error.name==='AbortError','Leaving during a fallback surface build must cancel cooperatively');
