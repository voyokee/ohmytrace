// Orbital art direction, independent of Cesium/DOM. Regions shape habitats; source imagery and
// elevation still decide whether ground can support a tree. No per-place tree coordinates.
export const WORLD_BIOMES = Object.freeze({
  boreal: { species: 'spruce', density: .91, height: 145000, width: 1.02, treeline: 2200 },
  temperate: { species: 'broadleaf', density: .84, height: 140000, width: 1.05, treeline: 3000 },
  birch: { species: 'birch', density: .87, height: 145000, width: 1.15, treeline: 2350 },
  tropical: { species: 'tropical', density: .97, height: 155000, width: .94, treeline: 3650 },
  mountain: { species: 'spruce', density: .76, height: 128000, width: 1.10, treeline: 3300 },
  steppe: { species: 'birch', density: .10, height: 65000, width: 1.25, treeline: 2300 },
});
const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function habitatNoise(lon,lat,scale=3) {
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const x=lon/scale,y=lat/scale,a=Math.floor(x),b=Math.floor(y),u=smooth(0,1,x-a),v=smooth(0,1,y-b);
  return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;
}
// Feathered Eurasian steppe envelope. The Greater Khingan hills to its east stay forested.
export function steppeWeight(lon,lat,elevation) {
  const d=Math.hypot((lon-109)/14,(lat-46.5)/5.6);
  return (1-smooth(.72,1.16,d))*(1-smooth(1050,1700,elevation));
}
export function worldBiome(lon,lat,elevation) {
  const a=Math.abs(lat);
  let id=a<23.5?'tropical':a>51?'boreal':lat>43&&lon>120&&lon<140?'birch':'temperate';
  if(lat>33&&lat<51&&lon>65&&lon<105&&elevation>1100)id='mountain';
  if(lat>26&&lat<36&&lon>78&&lon<104&&elevation>1800)id='mountain';
  const europeanMountain=lat>42&&lat<49&&lon>-12&&lon<28&&elevation>950;
  if(europeanMountain)id='mountain';
  const steppe=steppeWeight(lon,lat,elevation);
  if(steppe>.55)id='steppe';
  const base=WORLD_BIOMES[id];
  // Treelines taper with latitude, including southern temperate ranges.
  const treeline=Math.min(base.treeline,europeanMountain?2200:4200-a*27);
  return {id,...base,treeline,steppe,density:base.density*(1-steppe*.65)};
}
