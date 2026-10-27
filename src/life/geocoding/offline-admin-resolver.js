import {distanceKm} from '../media/reconstruction.js';
const valid=p=>p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
const inBounds=(p,b)=>Array.isArray(b[0])?b.some(box=>inBounds(p,box)):p.longitude>=b[0]&&p.longitude<=b[2]&&p.latitude>=b[1]&&p.latitude<=b[3];
function ringContains(p,ring){
 let inside=false;const x=p.longitude,y=p.latitude;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [a,b]=ring[i],[c,d]=ring[j];
  // Coordinates stored in WGS84. Border points are ambiguous, not confident hits.
  const cross=(x-a)*(d-b)-(y-b)*(c-a);
  if(Math.abs(cross)<1e-10&&x>=Math.min(a,c)&&x<=Math.max(a,c)&&y>=Math.min(b,d)&&y<=Math.max(b,d))return null;
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
 }return inside;
}
export function containsPoint(geometry,point){
 if(!valid(point))return false;
 const polys=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];
 return polys.some(poly=>ringContains(point,poly[0])===true&&poly.slice(1).every(r=>ringContains(point,r)===false));
}
/** Generalized admin polygons are suggestions. Cities have no boundary dataset. */
export class OfflineAdminResolver {
 id='natural-earth-v5.1.2';
 constructor({load=async path=>{const url=new URL('./data/'+path,import.meta.url);let cache=null;try{cache=await globalThis.caches?.open('ohmytrace.geonames-v5.1.2');const saved=await cache?.match(url);if(saved)return saved.json();}catch{/* Cache Storage may be unavailable in private browsing. */}const r=await fetch(url);if(!r.ok)throw new Error('离线地名包读取失败');try{await cache?.put(url,r.clone());}catch{/* Naming remains usable without a cache write. */}return r.json();},maxPacks=8,maxCityKm=80}={}){this.load=load;this.maxPacks=maxPacks;this.maxCityKm=maxCityKm;this.packs=new Map();}
 async pack(code){if(!this.packs.has(code)){if(this.packs.size>=this.maxPacks)this.packs.delete(this.packs.keys().next().value);this.packs.set(code,this.load(code+'.json').catch(e=>{this.packs.delete(code);throw e;}));}return this.packs.get(code);}
 async reverse(point){
  if(!valid(point)||point.crs&&point.crs!=='WGS84')throw new Error('只接受有效 WGS84 坐标');
  this.index??=await this.load('index.json');
  const candidates=this.index.countries.filter(c=>(Array.isArray(c.bounds[0])?c.bounds.some(b=>inBounds(point,b)):inBounds(point,c.bounds))),hits=[];
  for(const c of candidates){const pack=await this.pack(c.code);if(containsPoint(pack.country.geometry,point))hits.push(pack);}
  if(hits.length!==1)return null;
  const pack=hits[0],admins=pack.admins.filter(a=>(!a.bounds||inBounds(point,a.bounds))&&containsPoint(a.geometry,point));
  const nearest=pack.cities.map(c=>({...c,distanceKm:distanceKm(point,c.coordinates)})).sort((a,b)=>a.distanceKm-b.distanceKm)[0];
  const city=nearest&&nearest.distanceKm<=this.maxCityKm?nearest:null;
  return {country:pack.country.name,countryCode:pack.country.code,admin1:admins.length===1?admins[0].name:null,
   city:city?.name||null,displayName:[pack.country.name,admins.length===1?admins[0].name:null,city?`附近城市：${city.name}`:null].filter(Boolean).join(' / '),
   precision:city?'nearby-city':'admin-area',countryMatch:'generalized-polygon',admin1Match:admins.length===1?'generalized-polygon':null,
   cityMatch:city?'nearest-centre-not-boundary':null,distanceKm:city?.distanceKm??null,source:this.id,license:'Public Domain',crs:'WGS84',state:'inferred'};
 }
 async search(query,{limit=6}={}){this.index??=await this.load('index.json');return this.index.countries.filter(c=>c.name.includes(query)||c.code.toLowerCase()===query.toLowerCase()).slice(0,limit);}
}
