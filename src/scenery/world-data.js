export const WORLD_RELIEF = 30;
export const WORLD_BASE = 12000;
const RAD = Math.PI / 180, R = 6378137, E2 = 0.00669437999014;
export function random(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function geographicPosition(lon, lat, height = 0) {
  const a = lon * RAD, b = lat * RAD, c = Math.cos(b), s = Math.sin(b);
  const n = R / Math.sqrt(1 - E2 * s * s);
  return [(n + height) * c * Math.cos(a), (n + height) * c * Math.sin(a), (n * (1 - E2) + height) * s];
}
export function mapPixel(map, lon, lat) {
  const x = Math.min(map.width - 1, Math.floor((((lon + 180) / 360 % 1 + 1) % 1) * map.width));
  const y = Math.max(0, Math.min(map.height - 1, Math.floor((90 - lat) / 180 * map.height)));
  const p = (y * map.width + x) * 4;
  return [map.data[p] / 255, map.data[p + 1] / 255, map.data[p + 2] / 255];
}
export function elevationAt(map,lon,lat) {
  const x=((lon+180)/360%1+1)%1*map.width-.5,y=Math.max(0,Math.min(map.height-1,(90-lat)/180*map.height-.5));
  const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy;
  const sample=(a,b)=>map.data[(Math.min(map.height-1,b)*map.width+(a%map.width+map.width)%map.width)*4]/255;
  return ((sample(ix,iy)*(1-tx)+sample(ix+1,iy)*tx)*(1-ty)+(sample(ix,iy+1)*(1-tx)+sample(ix+1,iy+1)*tx)*ty)*6400;
}
export function worldHeight(map, lon, lat) { return WORLD_BASE + elevationAt(map,lon,lat) * WORLD_RELIEF; }
function habitatNoise(lon,lat) {
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const x=lon/3,y=lat/3,a=Math.floor(x),b=Math.floor(y),sx=x-a,sy=y-b;
  const u=sx*sx*(3-2*sx),v=sy*sy*(3-2*sy);
  return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;
}
export function forestSpecies(lon, lat, rgb, elevation) {
  const [r, g, b] = rgb, a = Math.abs(lat);
  if (a > 72 || elevation < 35 || elevation > (a < 30 ? 3800 : 2400) || b > Math.max(r, g) + 0.015 ||
      g < 0.12 || g < r * 1.01 || g < b * 1.06 || Math.min(r, g, b) > 0.72) return null;
  if (a < 23) return 'tropical';
  if (a > 49 || (lat > 33 && lon > 65 && lon < 105 && elevation > 1000)) return 'spruce';
  if (lat > 43 && lon > 105 && lon < 140) return 'birch';
  return 'broadleaf';
}
export function makeWorldForest(dayMap, heightMap, { constrained = false, maxInstances = constrained ? 6000 : 20000 } = {}) {
  const rnd = random(47193), chunks = new Map();
  const step = constrained ? 1.05 : 0.52;
  let count = 0;
  for (let lat = -58; lat < 73; lat += step) {
    const lonStep = step / Math.max(0.4, Math.cos(lat * RAD));
    for (let lon = -180; lon < 180; lon += lonStep) {
      const x = lon + rnd() * lonStep, y = lat + rnd() * step;
      const h = elevationAt(heightMap, x, y);
      let species = forestSpecies(x, y, mapPixel(dayMap, x, y), h);
      if (!species || rnd() > .42+habitatNoise(x,y)*.56 || count >= maxInstances) continue;
      if(species==='broadleaf'&&y>26&&h>250&&rnd()<.42)species='spruce';
      const cx = Math.floor((x + 180) / 24) * 24 - 168, cy = Math.floor((y + 90) / 18) * 18 - 81;
      const key = `${cx}:${cy}`;
      if (!chunks.has(key)) chunks.set(key, { key, lon: cx, lat: cy, plants: [] });
      chunks.get(key).plants.push({ lon: x, lat: y, ground: WORLD_BASE + h * WORLD_RELIEF,
        species, height: (species === 'spruce' ? 145000 : 115000) * (0.65 + rnd() * 0.65),
        width: 0.75 + rnd() * 0.40, angle: rnd() * Math.PI * 2 });
      count++;
    }
  }
  return { chunks: [...chunks.values()], count };
}
