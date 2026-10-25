import {habitatNoise} from './world-biomes.js?v=20261025-ridges';
import {elevationAt} from './world-elevation.js?v=20261025-ridges';
// Regional crown architecture: a lower canopy, occasional emergents, and coherent openings.
// The eligibility map still owns where a forest may exist. No new candidates or mesh copies.
export const FOREST_FORMS=Object.freeze({
  boreal:{base:.88,spread:.70,width:.84,emergent:.38},
  temperate:{base:.72,spread:.82,width:1.12,emergent:.55},
  birch:{base:.78,spread:.66,width:.98,emergent:.38},
  tropical:{base:.70,spread:.88,width:1.16,emergent:.58},
  mountain:{base:.86,spread:.64,width:.83,emergent:.38},
  steppe:{base:.68,spread:.30,width:1.0,emergent:0},
});
export const CANOPY_CEILINGS=Object.freeze({
  spruce:{knee:230000,tail:70000},wide:{knee:190000,tail:65000},
});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function canopyNoise(lon,lat,scale) {
  const x=((lon+180)%360+360)%360-180,a=habitatNoise(x,lat,scale);
  if(Math.abs(x)<174)return a;
  const b=habitatNoise(x-Math.sign(x)*360,lat,scale),blend=smooth(174,180,Math.abs(x))*.5;
  return a*(1-blend)+b*blend;
}

export function shapeWorldPlant(plant,biome,heightMap) {
  const {lon,lat}=plant,form=FOREST_FORMS[biome.id];
  const grove=canopyNoise(lon+37,lat-18,2.4),story=canopyNoise(lon-19,lat+41,.65);
  if(biome.id!=='steppe'&&grove<.36&&story<.65)return {plant:null,layer:'clearing'};
  const upper=smooth(.57,.83,story)*smooth(.30,.60,grove),h=elevationAt(heightMap,lon,lat);
  const exposed=smooth(.65,1,h/biome.treeline);
  let species=plant.species;
  if(biome.id==='temperate'&&Math.abs(lat)>26&&h>200&&upper>.55)species='spruce';
  // One emergent gain is enough. The old second upper-story multiplier compressed low
  // crowns while driving many high crowns into the ceiling, creating gaps and tall spikes.
  const heightScale=(form.base+smooth(.28,.70,story)*form.spread)*(.62+smooth(.28,.60,grove)*.38)*
    (1+upper*form.emergent)*(1-exposed*.28);
  const rawHeight=plant.height*heightScale;
  // A soft ceiling keeps emergents bounded without giving every tall tree an identical top.
  const {knee,tail}=CANOPY_CEILINGS[species==='spruce'?'spruce':'wide'];
  let height=Math.max(25000,rawHeight<knee?rawHeight:knee+tail*(1-Math.exp(-(rawHeight-knee)/tail)));
  // Keep the lowland miniature forest large, but let ridgelines rise above its upper edge.
  // Blend continuously by each biome's treeline instead of cutting every mountain tree flat.
  const alpine=smooth(.40,.95,h/biome.treeline),ceiling=220000-(biome.id==='mountain'?100000:60000)*alpine;
  height+=(ceiling*(1-Math.exp(-height/ceiling))-height)*alpine;
  // Near the treeline, a giant lowland crown can still exceed the range's art relief.
  // Contract its whole footprint continuously so rock faces remain readable above the forest.
  height*=1-alpine*(biome.id==='mountain'?.55:.30);
  let width=plant.width*(species==='spruce'?1.16:form.width)/Math.pow(Math.max(.72,heightScale),.35);
  // Compact exposed coastal crowns instead of letting an emergent umbrella cover an island's sea.
  // Four height samples are a conservative art adjustment, not a new coastline dataset.
  const radius=height*width*.52*Math.max(plant.aspect,1/plant.aspect),dy=radius/111320,
    dx=dy/Math.max(.3,Math.cos(lat*Math.PI/180));
  const neighbours=[[lon-dx,lat],[lon+dx,lat],[lon,lat-dy],[lon,lat+dy]]
    .map(([x,y])=>elevationAt(heightMap,x,y));
  const land=neighbours.filter(h=>h>=35).length/4;
  height*=.70+land*.30;width*=.46+land*.54;
  // A foothill root may be low even when its exaggerated crown reaches into a high ridge.
  // Reuse the footprint's DEM probes to fit those crowns to nearby mountain mass. Flat
  // lowland forests retain their volume; no roots, candidates or terrain are moved.
  const peak=Math.max(h,...neighbours),relief=smooth(250,900,peak-h)*smooth(900,1800,peak);
  height*=1-relief*.55;width*=1-relief*.20;
  return {plant:{...plant,species,height,width},layer:upper>.55?'upper':'lower',
    coastal:land<1,exposed:exposed>.5,reliefFitted:relief>.05};
}
