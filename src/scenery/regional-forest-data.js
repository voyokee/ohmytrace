import {forestSpecies,urbanCore,random,elevationAt,mapPixel} from './world-data.js?v=20261025-ridges';
import {worldBiome,habitatNoise} from './world-biomes.js?v=20261025-ridges';
import {smoothstep} from '../rendering/presentation-state.js';
const METRES=111320;
export function regionalState(altitude,{localReady=false,ground=0}={}) {
  const height=Math.max(0,altitude-ground);
  return {active:altitude<4000000&&height>800,
    opacity:(1-smoothstep(500000,2400000,altitude))*(localReady?smoothstep(1200,14000,height):smoothstep(800,1800,height)),
    radius:height>200000?256000:height>50000?64000:16000,
    treeHeight:Math.max(22,Math.min(6000,height*.014))};
}
export function regionalAnchor(lon,lat,radius) {
  const dy=radius/4/METRES,dx=dy/Math.max(.3,Math.cos(lat*Math.PI/180));
  return {lon:Math.round(lon/dx)*dx,lat:Math.round(lat/dy)*dy};
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
