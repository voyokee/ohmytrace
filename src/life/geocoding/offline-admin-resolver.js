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
 // "-zh": city packs carry NAME_ZH; the new id/cache name retires English labels cached on devices.
 id='natural-earth-v5.1.2-zh-city-v2';
 constructor({load=async path=>{const url=new URL('./data/'+path,import.meta.url);let cache=null;try{cache=await globalThis.caches?.open('ohmytrace.geonames-v5.1.2-zh-city-v2');const saved=await cache?.match(url);if(saved)return saved.json();}catch{/* Cache Storage may be unavailable in private browsing. */}const r=await fetch(url);if(!r.ok)throw new Error('离线地名包读取失败');try{await cache?.put(url,r.clone());}catch{/* Naming remains usable without a cache write. */}return r.json();},maxPacks=8,maxCityKm=80}={}){this.load=load;this.maxPacks=maxPacks;this.maxCityKm=maxCityKm;this.packs=new Map();}
 async pack(code){if(!this.packs.has(code)){if(this.packs.size>=this.maxPacks)this.packs.delete(this.packs.keys().next().value);this.packs.set(code,this.load(code+'.json').catch(e=>{this.packs.delete(code);throw e;}));}return this.packs.get(code);}
 async reverse(point){
  if(!valid(point)||point.crs&&point.crs!=='WGS84')throw new Error('只接受有效 WGS84 坐标');
  // A global city point index avoids loading every neighbouring country's large
  // polygons. Share initialization across concurrent photo-name workers.
  this.ready??=Promise.all(['index.json','city-index.json','city-regions.json'].map(p=>this.load(p))).catch(e=>{this.ready=null;throw e;});
  const [index,cities,regions]=await this.ready;this.index=index;
  const detailed=Object.entries(regions).find(([,g])=>containsPoint(g,point))?.[0];
  const candidates=index.countries.filter(c=>inBounds(point,c.bounds)),hits=[];
  for(const c of candidates){const p=await this.pack(c.code);if(containsPoint(regions[c.code]||p.country.geometry,point))hits.push(p);}
  let pack=detailed?await this.pack(detailed):hits.length===1?hits[0]:null;
  const nearby=cities.map(([code,name,latitude,longitude,admin])=>({code,name,admin,distanceKm:distanceKm(point,{latitude,longitude})})).filter(c=>c.distanceKm<=this.maxCityKm).sort((a,b)=>a.distanceKm-b.distanceKm||a.code.localeCompare(b.code)||a.name.localeCompare(b.name));
  const local=pack?nearby.find(c=>c.code===pack.country.code):null,nearest=nearby[0];
  let city=local,match=detailed?'detailed-city-region':'generalized-polygon';
  if(!pack){
   if(!nearest||nearest.distanceKm>30)return null;
   city=nearest;pack=await this.pack(city.code);match='coastal-nearby-city';
  }else if(!detailed&&nearest&&nearest.code!==pack.country.code&&nearest.distanceKm<=30&&(!local||nearest.distanceKm+5<local.distanceKm&&nearest.distanceKm<local.distanceKm*0.65)){
   city=nearest;pack=await this.pack(city.code);match='closer-cross-border-city';
  }
  // Hong Kong, Macau and Singapore are each one city, including districts.
  const cityRegion=regions[pack.country.code];
  if(cityRegion)city={name:pack.country.name,distanceKm:local?.distanceKm??city?.distanceKm??null};
  const admins=cityRegion?[]:pack.admins.filter(a=>(!a.bounds||inBounds(point,a.bounds))&&containsPoint(a.geometry,point));
  return {country:pack.country.name,countryCode:pack.country.code,admin1:admins.length===1?admins[0].name:null,
   city:city?.name||null,displayName:[pack.country.name,admins.length===1?admins[0].name:null,city?`附近城市：${city.name}`:null].filter(Boolean).join(' / '),
   precision:city?'nearby-city':'admin-area',countryMatch:match,admin1Match:admins.length===1?'generalized-polygon':null,
   cityMatch:city?'nearest-centre-not-boundary':null,distanceKm:city?.distanceKm??null,source:this.id,license:'Public Domain',crs:'WGS84',state:'inferred'};
 }
 async search(query,{limit=6}={}){this.index??=await this.load('index.json');return this.index.countries.filter(c=>c.name.includes(query)||c.code.toLowerCase()===query.toLowerCase()).slice(0,limit);}
}
