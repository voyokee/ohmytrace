// Derived search points keep forward lookup from opening 242 geometry packs per query.
import {readFile,writeFile} from 'node:fs/promises';
import {containsPoint} from '../src/life/geocoding/offline-admin-resolver.js';
const root=new URL('../src/life/geocoding/data/',import.meta.url),load=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const index=await load('index.json'),cities=await load('city-index.json'),admins=[],cityAdmins=Array(cities.length).fill(null);
function centre(g){
 const rings=(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p[0]);
 const boxes=rings.map(r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))]).sort((a,b)=>(b[2]-b[0])*(b[3]-b[1])-(a[2]-a[0])*(a[3]-a[1]));
 const [x,y,X,Y]=boxes[0],mid={latitude:(y+Y)/2,longitude:(x+X)/2};
 if(containsPoint(g,mid))return mid;
 for(let i=1;i<20;i++)for(let j=1;j<20;j++){const p={latitude:y+(Y-y)*i/20,longitude:x+(X-x)*j/20};if(containsPoint(g,p))return p;}
 return {latitude:rings[0][0][1],longitude:rings[0][0][0]};
}
for(const c of index.countries){
 const pack=await load(c.code+'.json');
 for(const a of pack.admins){const p=centre(a.geometry);admins.push([c.code,a.name,+p.latitude.toFixed(5),+p.longitude.toFixed(5)]);}
 for(let i=0;i<cities.length;i++)if(cities[i][0]===c.code){const p={latitude:cities[i][2],longitude:cities[i][3]},hits=pack.admins.filter(a=>containsPoint(a.geometry,p));if(hits.length===1)cityAdmins[i]=hits[0].name;}
}
await writeFile(new URL('admin-search-index.json',root),JSON.stringify({admins,cityAdmins})+'\n');
console.log(`Indexed ${admins.length} administrative search points and ${cityAdmins.length} city region labels`);
