export const WORLD_RELIEF = 30;
export const WORLD_BASE = 12000;
export const WORLD_RIDGE_RELIEF = 72;
export const WORLD_RIDGE_MAX = 150000;
const RAD = Math.PI / 180, R = 6378137, E2 = 0.00669437999014;
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
export function worldHeight(map,lon,lat) {
  const h=elevationAt(map,lon,lat),step=.70;
  // Emphasise only DEM ridges above their local neighbourhood. Flat plateaus, coasts and lakes
  // keep the base scale; increasing the whole Earth's exaggeration would also inflate them.
  const mean=(elevationAt(map,lon-step,lat)+elevationAt(map,lon+step,lat)+
    elevationAt(map,lon,lat-step)+elevationAt(map,lon,lat+step))*.25;
  const upland=Math.min(1,Math.max(0,(h-250)/800));
  // Relative prominence separates a narrow range above low foothills from small ripples
  // on an already-high plateau. Both keep the same DEM and absolute displacement cap.
  const prominence=Math.max(0,h-mean),relative=prominence/Math.max(600,h);
  const t=Math.min(1,Math.max(0,(relative-.06)/.34)),gain=.55+1.05*t*t*(3-2*t);
  return WORLD_BASE+h*WORLD_RELIEF+Math.min(WORLD_RIDGE_MAX,prominence*WORLD_RIDGE_RELIEF*upland*gain);
}
