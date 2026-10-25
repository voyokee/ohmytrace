import {forestSpecies,urbanCore,random,elevationAt,mapPixel} from './world-data.js?v=20261025-ridges';
import {worldBiome,habitatNoise} from './world-biomes.js?v=20261025-ridges';
import {smoothstep} from '../rendering/presentation-state.js';
const METRES=111320;
export const REGIONAL_MAX_HEIGHT=24000;
// Shrink orbital crowns before regional trees enter. Tying this only to the surface
// opacity leaves 150–400 km trees filling the view at a 2,000 km camera height.
export const regionalWorldScale=altitude=>.08+.20*smoothstep(650000,2400000,altitude)+.72*smoothstep(2400000,6000000,altitude);
export function regionalState(altitude,{localReady=false,ground=0}={}) {
  const height=Math.max(0,altitude-ground);
  // Keep a readable angular silhouette through the regional bands. Only collapse toward
  // physical trees in the same 1.2–14 km overlap where ready local scenery takes over.
  // Authored bounds use the ceiling; the shader only contracts around each sampled root.
  return {active:altitude<4000000&&height>800,
    opacity:(1-smoothstep(500000,2400000,altitude))*(localReady?smoothstep(1200,14000,height):smoothstep(800,1800,height)),
    radius:height>800000?1024000:height>200000?256000:height>50000?64000:height>10000?16000:4000,
    treeHeight:22+(Math.max(22,Math.min(REGIONAL_MAX_HEIGHT,height*.05))-22)*smoothstep(1200,14000,height)};
}
export function regionalAnchor(lon,lat,radius) {
  const dy=radius/4/METRES,row=Math.round(lat/dy)*dy;
  // Keep a fixed longitude grid within each latitude row. Using the unsnapped latitude
  // slides every anchor east/west with tiny terrain-height or camera changes.
  const dx=dy/Math.max(.3,Math.cos(row*Math.PI/180));
  return {lon:Math.round(lon/dx)*dx,lat:row};
}
export function regionalPlants(maps,center,radius,{limit=900}={}) {
  const lat=Math.max(-71,Math.min(71,center.lat)),cos=Math.max(.3,Math.cos(lat*Math.PI/180));
  const cells=Math.ceil(Math.sqrt(limit*8)),result=[];let eligible=0;
  const rnd=random(Math.round(center.lon*1000)^Math.round(lat*1000)^radius);
  for(let j=0;j<cells;j++)for(let i=0;i<cells;i++) {
    const east=((i+.15+rnd()*.7)/cells*2-1)*radius,north=((j+.15+rnd()*.7)/cells*2-1)*radius;
    if(east*east+north*north>radius*radius)continue;
    const lon=((center.lon+east/(METRES*cos)+180)%360+360)%360-180,y=lat+north/METRES;
    if(Math.abs(y)>72)continue;
    const h=elevationAt(maps.height,lon,y),biome=worldBiome(lon,y,h);
    const species=forestSpecies(lon,y,mapPixel(maps.day,lon,y),h);
    if(!species||urbanCore(maps.night,lon,y))continue;
    if(rnd()>biome.density*(.25+.75*habitatNoise(lon,y,.4)))continue;
    const plant={lon,lat:y,height:h,biome:biome.id,species,treeline:biome.treeline,variation:.7+rnd()*.6};
    // Reservoir sampling keeps the whole disk represented even when a dense forest hits its cap.
    eligible++;
    if(result.length<limit)result.push(plant);
    else {const slot=Math.floor(rnd()*eligible);if(slot<limit)result[slot]=plant;}
  }
  return result;
}
