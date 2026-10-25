import {geographicPosition,worldHeight} from './world-elevation.js?v=20261025-horizon';
import {worldSurfacePlan,mountainRefinements,visitSurfaceTriangles} from './surface-topology.js';
export {worldSurfacePlan} from './surface-topology.js';
const samplers=new WeakMap(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function installSurfaceSampling(map,constrained,refinements) {
  const previous=samplers.get(map);
  if(previous?.constrained===constrained&&previous.refinements===refinements)return previous;
  const plan=worldSurfacePlan(constrained),stride=plan.columns*2+1;
  if(refinements.length!==plan.rows*plan.columns)throw new Error('Invalid surface refinement grid');
  const height=new Float64Array((plan.rows*2+1)*stride);height.fill(NaN);
  const sampler={...plan,stride,constrained,refinements,height};samplers.set(map,sampler);return sampler;
}
function sampling(map,constrained) {
  let s=samplers.get(map);
  if(!s||s.constrained!==constrained)s=installSurfaceSampling(map,constrained,mountainRefinements(map,constrained));
  return s;
}
function point(map,s,key) {
  const i=key%s.stride,j=Math.floor(key/s.stride),lon=i/(s.columns*2)*360-180,lat=90-j/(s.rows*2)*180;
  if(Number.isNaN(s.height[key]))s.height[key]=worldHeight(map,lon,lat);
  return geographicPosition(lon,lat,s.height[key]);
}
// Intersect the geodetic vertical with the exact adaptive triangle, not an interpolated DEM.
// The same sampler is used by tree roots, labels and the geometry builder.
export function surfaceGround(map,lon,lat,constrained=false) {
  const s=sampling(map,constrained),x=(((lon+180)/360%1+1)%1)*s.columns,
    y=clamp((90-lat)/180*s.rows,0,s.rows-1e-9),i=Math.floor(x),j=Math.floor(y);
  let triangle;
  visitSurfaceTriangles(i,j,s.refinements,s,(a,b,c)=>{
    if(triangle)return;
    const ax=a%s.stride,ay=Math.floor(a/s.stride),bx=b%s.stride,by=Math.floor(b/s.stride),
      cx=c%s.stride,cy=Math.floor(c/s.stride),px=x*2-ax,py=y*2-ay;
    const den=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),u=(px*(cy-ay)-py*(cx-ax))/den,
      v=((bx-ax)*py-(by-ay)*px)/den;
    if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)triangle=[a,b,c];
  });
  if(!triangle)return worldHeight(map,lon,lat);
  const [a,b,c]=triangle.map(k=>point(map,s,k)),u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],
    p=geographicPosition(lon,lat),r=lon*Math.PI/180,t=lat*Math.PI/180,up=[Math.cos(t)*Math.cos(r),Math.cos(t)*Math.sin(r),Math.sin(t)];
  const denominator=n.reduce((sum,x,k)=>sum+x*up[k],0);
  if(Math.abs(denominator)<1e-8)return worldHeight(map,lon,lat);
  return n.reduce((sum,x,k)=>sum+x*(a[k]-p[k]),0)/denominator;
}

export async function makeWorldSurface(map,{constrained=false,checkpoint}={}) {
  const s=sampling(map,constrained),ids=new Int32Array(s.height.length);ids.fill(-1);
  const keys=[],triangles=[];
  // Retain the original base-grid ordering; only adaptive vertices are appended.
  for(let j=0;j<=s.rows;j++)for(let i=0;i<=s.columns;i++) {
    const key=j*2*s.stride+i*2;ids[key]=keys.length;keys.push(key);
  }
  const vertex=k=>{if(ids[k]<0){ids[k]=keys.length;keys.push(k);}return ids[k];};
  for(let j=0;j<s.rows;j++) {
    if(checkpoint&&j%8===0)await checkpoint();
    for(let i=0;i<s.columns;i++)visitSurfaceTriangles(i,j,s.refinements,s,(a,b,c)=>triangles.push(vertex(a),vertex(b),vertex(c)));
  }
  const positions=new Float64Array(keys.length*3),normals=new Float32Array(keys.length*3),st=new Float32Array(keys.length*2),
    indices=new Uint32Array(triangles);
  for(let k=0;k<keys.length;k++) {
    if(checkpoint&&k%8192===0)await checkpoint();
    positions.set(point(map,s,keys[k]),k*3);
    st.set([(keys[k]%s.stride)/(s.columns*2),1-Math.floor(keys[k]/s.stride)/(s.rows*2)],k*2);
  }
  // Area-weighted geometry normals keep broad slopes smooth while preserving actual ridges.
  for(let i=0;i<indices.length;i+=3) {
    if(checkpoint&&i%24576===0)await checkpoint();
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,
      ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],
      vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],
      nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    for(const k of [a,b,c]){normals[k]+=nx;normals[k+1]+=ny;normals[k+2]+=nz;}
  }
  // Longitude has duplicated UV vertices. Join their one-sided area sums before normalizing,
  // otherwise smooth terrain lighting would reveal a vertical seam across the Pacific.
  for(let j=0;j<=s.rows*2;j++) {
    const a=ids[j*s.stride],b=ids[j*s.stride+s.columns*2];
    if(a<0||b<0)continue;
    for(let c=0;c<3;c++){const sum=normals[a*3+c]+normals[b*3+c];normals[a*3+c]=normals[b*3+c]=sum;}
  }
  for(let k=0;k<keys.length;k++) {
    if(checkpoint&&k%8192===0)await checkpoint();
    const n=k*3,l=Math.hypot(normals[n],normals[n+1],normals[n+2]);
    if(st[k*2+1]===0||st[k*2+1]===1){normals.set([0,0,st[k*2+1]===1?1:-1],n);continue;}
    if(l>1e-8){normals[n]/=l;normals[n+1]/=l;normals[n+2]/=l;}
    else {const r=st[k*2]*Math.PI*2-Math.PI,t=(st[k*2+1]-.5)*Math.PI;
      normals.set([Math.cos(t)*Math.cos(r),Math.cos(t)*Math.sin(r),Math.sin(t)],n);}
  }
  return {positions,normals,st,indices,refinements:s.refinements};
}
