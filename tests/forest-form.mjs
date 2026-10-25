import assert from 'node:assert/strict';
import {shapeWorldPlant} from '../src/scenery/forest-form.js';
import {worldBiome} from '../src/scenery/world-biomes.js';
import {makeWorldForest} from '../src/scenery/world-data.js';
import {worldHeight,elevationAt,WORLD_BASE,WORLD_RELIEF,WORLD_RIDGE_MAX} from '../src/scenery/world-elevation.js';
const flat=value=>({width:1,height:1,data:new Uint8ClampedArray([value,value,value,255])});
const heights=flat(40),plants=[],layers=new Set();let clearings=0;
for(let lat=26;lat<52;lat+=.35)for(let lon=90;lon<135;lon+=.35) {
 const biome=worldBiome(lon,lat,1000),p={lon,lat,ground:12345,height:160000,width:1.1,aspect:1,angle:.5,species:biome.species},
  result=shapeWorldPlant(p,biome,heights);
 assert.deepEqual(result,shapeWorldPlant(p,biome,heights),'Architecture must not depend on camera/time or previous candidates');
 assert.equal(p.height,160000,'Input candidates must remain immutable');
 if(!result.plant){clearings++;continue;}
 const q=result.plant;layers.add(result.layer);plants.push(q);
 assert.equal(q.lon,p.lon);assert.equal(q.lat,p.lat);assert.equal(q.ground,p.ground,'Canopy shaping must not move tree roots');
 assert.equal(q.angle,p.angle);assert.equal(q.aspect,p.aspect);
 assert.ok(q.height>10000&&q.height<=420000&&q.width>0&&q.width<2,'GPU bounds and orbital distance classification must remain valid');
}
assert.ok(clearings>20&&clearings<plants.length*.40,'Openings must form a minority rather than erase most forests');
assert.deepEqual([...layers].sort(),['lower','upper']);
assert.ok(Math.max(...plants.map(p=>p.height))/Math.min(...plants.map(p=>p.height))>2,'A forest must contain distinct canopy levels');
for(let lat=-50;lat<65;lat+=5) {
 const build=lon=>shapeWorldPlant({lon,lat,ground:12345,height:160000,width:1,aspect:1,angle:0,species:'broadleaf'},worldBiome(lon,lat,1000),heights);
 const a=build(-180),b=build(180);assert.equal(a.layer,b.layer,'Canopy openings must wrap across longitude');
 if(a.plant){assert.ok(Math.abs(a.plant.height-b.plant.height)<1e-4);assert.ok(Math.abs(a.plant.width-b.plant.width)<1e-8);}
}
const p={lon:40.25,lat:30.25,ground:12345,height:230000,width:1.2,aspect:1.1,angle:.5,species:'broadleaf'},biome=worldBiome(p.lon,p.lat,1000);
const island={width:720,height:360,data:new Uint8ClampedArray(720*360*4)};
const x=Math.floor((p.lon+180)/360*island.width),y=Math.floor((90-p.lat)/180*island.height);
island.data.set([40,40,40,255],(y*island.width+x)*4);
const inland=shapeWorldPlant(p,biome,heights),coast=shapeWorldPlant(p,biome,island),exposed=shapeWorldPlant(p,biome,flat(130));
assert.ok(inland.plant&&coast.plant&&exposed.plant);
assert.ok(coast.coastal&&coast.plant.height<inland.plant.height&&coast.plant.width<inland.plant.width,'Exposed island crowns must contract rather than cover surrounding sea');
assert.ok(exposed.plant.height<inland.plant.height,'High exposed slopes must carry a lower canopy');
const alpineBiome={...biome,id:'mountain',treeline:2200};let previous;
for(let value=30;value<=86;value++) {
 const result=shapeWorldPlant(p,alpineBiome,flat(value)).plant;
 assert.ok(result&&result.ground===p.ground);
 if(previous)assert.ok(result.height<=previous.height&&result.height>previous.height*.94,
  'The upper mountain canopy must lower continuously rather than jump to a flat cap');
 previous=result;
}
assert.ok(previous.height<shapeWorldPlant(p,alpineBiome,flat(30)).plant.height*.60,
 'Mountaintops must emerge above the nearby upper forest instead of being hidden by giant crowns');
const giant={...p,height:2000000},wideCrown=shapeWorldPlant({...giant,species:'broadleaf'},biome,heights).plant,
 needleCrown=shapeWorldPlant({...giant,species:'spruce'},biome,heights).plant;
assert.ok(wideCrown.height<300000&&needleCrown.height>wideCrown.height*1.1,
 'Oversized broad crowns must compress before hiding the surrounding forest; needles retain a taller silhouette');
// A finite forest island keeps the full population below the global hard cap, allowing an
// independent subset comparison with the exact original placement stream.
const day={width:72,height:36,data:new Uint8ClampedArray(72*36*4)};
for(let j=0;j<36;j++)for(let i=0;i<72;i++) {
 const lon=(i+.5)/72*360-180,lat=90-(j+.5)/36*180,green=lon>80&&lon<140&&lat>20&&lat<55;
 day.data.set(green?[30,90,20,255]:[15,25,120,255],(j*72+i)*4);
}
for(const constrained of [false,true]) {
 const before=makeWorldForest(day,heights,{constrained,canopy:false}),after=makeWorldForest(day,heights,{constrained});
 assert.ok(before.count<(constrained?6000:20000));
 const keys=new Set(before.chunks.flatMap(c=>c.plants.map(p=>`${p.lon}:${p.lat}`)));
 assert.ok(after.chunks.flatMap(c=>c.plants).every(p=>keys.has(`${p.lon}:${p.lat}`)),'Clearings must not relocate later candidates into new land/water cells');
 assert.ok(after.count<before.count&&after.count+after.canopy.clearings===before.count);
 const cost=f=>f.chunks.reduce((n,c)=>n+c.plants.reduce((n,p)=>n+({spruce:92,broadleaf:180,birch:124,tropical:180}[p.species]),0),0);
 assert.ok(cost(after)<=cost(before),'Layered forests must not buy detail by adding instance triangles');
}
const peak={width:720,height:360,data:new Uint8ClampedArray(720*360*4)};
peak.data.set([255,255,255,255],(179*720+360)*4);
assert.ok(Math.abs(worldHeight(peak,.25,.25)-(WORLD_BASE+6400*WORLD_RELIEF+WORLD_RIDGE_MAX))<1e-6,'A narrow peak must obey the explicit ridge-height cap');
assert.equal(worldHeight(flat(100),0,40),WORLD_BASE+100/255*6400*WORLD_RELIEF,'Flat plateaus must retain the original base exaggeration');
assert.equal(worldHeight(flat(0),0,0),WORLD_BASE,'Sea level must remain unchanged');
const summit=(base,top)=>{
 const data=new Uint8ClampedArray(720*360*4);for(let i=0;i<data.length;i+=4)data.set([base,base,base,255],i);
 data.set([top,top,top,255],(179*720+360)*4);return {width:720,height:360,data};
};
const foothills=summit(40,80),plateau=summit(160,200),displacement=map=>worldHeight(map,.25,.25)-WORLD_BASE-elevationAt(map,.25,.25)*WORLD_RELIEF;
assert.ok(displacement(foothills)>displacement(plateau)*1.2,
 'The same local height difference must read more strongly above low foothills than as a ripple on a high plateau');
assert.ok(displacement(foothills)<=WORLD_RIDGE_MAX&&displacement(plateau)<=WORLD_RIDGE_MAX);
console.log('PASS: coherent canopy levels/openings, immutable roots, coastal/exposure contraction, original candidate subsets, non-increasing triangles and bounded ridge relief');
