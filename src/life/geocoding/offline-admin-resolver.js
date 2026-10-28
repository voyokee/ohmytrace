import {distanceKm} from '../media/reconstruction.js';
import {normalizeRegion,regionOf,iso2Of} from './region-policy.js';
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
 // The policy version retires previously cached display names on installed devices.
 id='natural-earth-v5.1.2-zh-city-cn-v3';
 constructor({load=async path=>{const url=new URL('./data/'+path,import.meta.url);let cache=null;try{cache=await globalThis.caches?.open('ohmytrace.geonames-v5.1.2-zh-city-cn-v3');const saved=await cache?.match(url);if(saved)return saved.json();}catch{/* Cache Storage may be unavailable in private browsing. */}const r=await fetch(url);if(!r.ok)throw new Error('离线地名包读取失败');try{await cache?.put(url,r.clone());}catch{/* Naming remains usable without a cache write. */}return r.json();},maxPacks=8,maxCityKm=80}={}){this.load=load;this.maxPacks=maxPacks;this.maxCityKm=maxCityKm;this.packs=new Map();}
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
  return normalizeRegion({country:pack.country.name,countryCode:pack.country.code,admin1:admins.length===1?admins[0].name:null,
   city:city?.name||null,displayName:[pack.country.name,admins.length===1?admins[0].name:null,city?`附近城市：${city.name}`:null].filter(Boolean).join(' / '),
   precision:city?'nearby-city':'admin-area',countryMatch:match,admin1Match:admins.length===1?'generalized-polygon':null,
   cityMatch:city?'nearest-centre-not-boundary':null,distanceKm:city?.distanceKm??null,source:this.id,license:'Public Domain',crs:'WGS84',state:'inferred'});
 }
 async search(query,{limit=6,countrycodes='',featureType=null}={}){
  const clean=s=>String(s||'').trim().replace(/[臺灣]/g,c=>c==='臺'?'台':'湾'),short=s=>clean(s).replace(/(特别行政区|壮族自治区|维吾尔自治区|回族自治区|自治区|省|市|县|区)$/,'');
  const q=clean(query);if(!q)return [];
  this.searchReady??=Promise.all(['index.json','city-index.json','admin-search-index.json'].map(p=>this.load(p))).catch(e=>{this.searchReady=null;throw e;});
  const [index,cities,extra]=await this.searchReady,allowed=countrycodes.toLowerCase().split(',').filter(Boolean),rows=[];
  const add=(code,name,lat,lon,admin1,type)=>{
   if(allowed.length&&!allowed.includes(iso2Of(code)))return;
   if(featureType==='state'&&type!=='state'||featureType==='city'&&type!=='city'||featureType==='settlement'&&type==='state')return;
   const r=normalizeRegion({countryCode:code,country:regionOf(code).displayName,admin1,city:type==='city'?name:null}),label=type==='country'?r.country:type==='state'?r.admin1:name;
   const display=[r.country,r.admin1,type==='city'?name:null].filter(Boolean).filter((s,i,a)=>a.indexOf(s)===i).join(' / ');
   const rank=clean(label)===q?3:short(label)===short(q)?2:display.includes(q)?1:0;if(!rank)return;
   rows.push({name:label,lat,lon,display_name:display,category:type==='city'?'place':'boundary',type:type==='city'?'city':'administrative',importance:rank+(type==='city'?.1:0),address:{country:r.country,country_code:iso2Of(code),state:r.admin1},countryCode:code,sovereignCode:r.sovereignCode,source:'离线',state:'inferred'});
  };
  cities.forEach(([code,name,lat,lon],i)=>add(code,name,lat,lon,extra.cityAdmins[i],'city'));
  for(const [code,name,lat,lon]of extra.admins)add(code,name,lat,lon,name,'state');
  for(const c of index.countries){const boxes=Array.isArray(c.bounds[0])?c.bounds:[c.bounds],b=[...boxes].sort((a,b)=>(b[2]-b[0])*(b[3]-b[1])-(a[2]-a[0])*(a[3]-a[1]))[0];add(c.code,regionOf(c.code).displayName,(b[1]+b[3])/2,(b[0]+b[2])/2,null,'country');}
  return rows.sort((a,b)=>b.importance-a.importance||a.display_name.localeCompare(b.display_name,'zh-CN')).slice(0,Math.max(0,Math.min(50,limit)));
 }
}
