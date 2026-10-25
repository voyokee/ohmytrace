import {surfaceGround} from './world-surface.js?v=20261025-boughs';
import {worldBiome,habitatNoise} from './world-biomes.js?v=20261025-boughs';
import {mapPixel,elevationAt} from './world-elevation.js?v=20261025-boughs';
import {shapeWorldPlant} from './forest-form.js';
export {WORLD_BASE,WORLD_RELIEF,WORLD_RIDGE_RELIEF,WORLD_RIDGE_MAX,mapPixel,elevationAt,worldHeight,geographicPosition} from './world-elevation.js?v=20261025-boughs';
const RAD=Math.PI/180;
export function random(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function forestSpecies(lon, lat, rgb, elevation) {
  const [r,g,b]=rgb, biome=worldBiome(lon,lat,elevation);
  if(Math.abs(lat)>72 || elevation<35 || elevation>biome.treeline ||
    b>Math.max(r,g)+.015 || (b>g*.78&&r<g*.70) || g<.12 || g<r*1.01 || g<b*1.06 || Math.min(r,g,b)>.72)return null;
  return biome.species;
}
export function urbanCore(nightMap,lon,lat) {
  if(!nightMap)return false;
  const [r,g,b]=mapPixel(nightMap,lon,lat);
  // Only the bright cores of the existing city-light map, not every rural light.
  return r>.48 && g>.30 && b>.13;
}
export function makeWorldForest(dayMap, heightMap, { constrained = false, maxInstances = constrained ? 6000 : 20000, nightMap,canopy=true } = {}) {
  const rnd = random(47193), chunks = new Map();
  const step = constrained ? .96 : .48;
  const biomes={};
  const canopyStats={enabled:canopy,clearings:0,upper:0,coastal:0,exposed:0};
  let count = 0;
  for (let lat = -58; lat < 73; lat += step) {
    const lonStep = step / Math.max(0.4, Math.cos(lat * RAD));
    for (let lon = -180; lon < 180; lon += lonStep) {
      const x = lon + rnd() * lonStep, y = lat + rnd() * step;
      const h = elevationAt(heightMap, x, y);
      let species = forestSpecies(x, y, mapPixel(dayMap, x, y), h);
      const biome=worldBiome(x,y,h), patch=habitatNoise(x,y,2.1), grove=habitatNoise(x+37,y-18,.85);
      const coverage=biome.density*(.32+.78*patch);
      if(!species || urbanCore(nightMap,x,y) || rnd()>coverage || count>=maxInstances)continue;
      if(biome.id==='steppe'&&grove<.70)continue;
      if(species==='birch'&&rnd()<.32)species='spruce';
      else if(species==='broadleaf'&&Math.abs(y)>26&&h>450&&rnd()<.30)species='spruce';
      const cx = Math.floor((x + 180) / 24) * 24 - 168, cy = Math.floor((y + 90) / 18) * 18 - 81;
      const key = `${cx}:${cy}`;
      const original={ lon: x, lat: y,
        species, height: biome.height * (.64 + patch*.30 + rnd()*.48),
        width: biome.width * (.82 + rnd()*.36) * (species==='spruce'&&biome.species!=='spruce'?.74:1),
        angle: rnd() * Math.PI * 2, aspect:.80+rnd()*.40 };
      // Consume the same placement randoms even for clearings, so later cells do not relocate.
      const shaped=canopy?shapeWorldPlant(original,biome,heightMap):{plant:original};
      if(!shaped.plant){canopyStats.clearings++;continue;}
      if(shaped.layer==='upper')canopyStats.upper++;
      if(shaped.coastal)canopyStats.coastal++;
      if(shaped.exposed)canopyStats.exposed++;
      if (!chunks.has(key)) chunks.set(key, { key, lon: cx, lat: cy, plants: [] });
      chunks.get(key).plants.push({...shaped.plant,ground:surfaceGround(heightMap,x,y,constrained)});
      count++;biomes[biome.id]=(biomes[biome.id]||0)+1;
    }
  }
  return { chunks: [...chunks.values()], count, biomes,canopy:canopyStats };
}
