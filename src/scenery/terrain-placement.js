// Reuse the already sampled elevations to reject cliff faces without another network sampling
// pass. Nearby height differences give a conservative lower bound on local steepness.
export async function filterSteepPlants(plants,{signal,maxSlope=1,checkpoint=()=>new Promise(r=>setTimeout(r,0))}={}) {
  if(!plants.length)return [];
  const lat=plants[0].lat,lon=plants[0].lon,sx=111320*Math.cos(lat*Math.PI/180),sy=111320,cell=120;
  const points=plants.map(p=>({p,x:(p.lon-lon)*sx,y:(p.lat-lat)*sy})),grid=new Map(),out=[];
  for(const point of points){const key=`${Math.floor(point.x/cell)}:${Math.floor(point.y/cell)}`;
    if(!grid.has(key))grid.set(key,[]);grid.get(key).push(point);}
  for(let i=0;i<points.length;i++) {
    if(i%128===0){await checkpoint();signal?.throwIfAborted();}
    const point=points[i],cx=Math.floor(point.x/cell),cy=Math.floor(point.y/cell);let steep=false;
    if(point.p.species!=='grass'&&point.p.species!=='shrub') {
      for(let y=cy-1;y<=cy+1&&!steep;y++)for(let x=cx-1;x<=cx+1&&!steep;x++)
        for(const other of grid.get(`${x}:${y}`)||[]) {
          const d=Math.hypot(point.x-other.x,point.y-other.y);
          if(d>=20&&d<=160&&Math.abs(point.p.ground-other.p.ground)>d*maxSlope){steep=true;break;}
        }
    }
    if(!steep)out.push(point.p);
  }
  return out;
}
