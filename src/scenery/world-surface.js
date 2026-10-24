import {geographicPosition,worldHeight} from './world-elevation.js';
export const worldSurfacePlan=constrained=>constrained?{rows:128,columns:256}:{rows:320,columns:640};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function cell(lon,lat,constrained) {
  const {rows,columns}=worldSurfacePlan(constrained),x=(((lon+180)/360%1+1)%1)*columns,
    y=clamp((90-lat)/180*rows,0,rows-1e-9),i=Math.floor(x),j=Math.floor(y);
  return {i,j,x:x-i,y:y-j,rows,columns};
}
function corner(map,i,j,rows,columns) {
  const lon=i/columns*360-180,lat=90-j/rows*180;
  return geographicPosition(lon,lat,worldHeight(map,lon,lat));
}
// Render this globe in scene3DOnly mode: Cesium 1.120's 2D longitude split can break pole/seam fans.
// Intersect the tree's geodetic vertical with the same triangle plane used for the globe. This
// includes ellipsoid chord curvature and avoids floating roots above narrow, downsampled valleys.
export function surfaceGround(map,lon,lat,constrained=false) {
  const c=cell(lon,lat,constrained),{i,j,rows,columns}=c;
  const a=corner(map,i+1,j,rows,columns),b=corner(map,i,j+1,rows,columns),
    d=corner(map,i+(c.x+c.y<=1?0:1),j+(c.x+c.y<=1?0:1),rows,columns);
  const u=b.map((v,k)=>v-a[k]),v=d.map((x,k)=>x-a[k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const p=geographicPosition(lon,lat),r=lon*Math.PI/180,t=lat*Math.PI/180,
    up=[Math.cos(t)*Math.cos(r),Math.cos(t)*Math.sin(r),Math.sin(t)];
  const denominator=n.reduce((sum,x,k)=>sum+x*up[k],0);
  if(Math.abs(denominator)<1e-8)return worldHeight(map,lon,lat);
  return n.reduce((sum,x,k)=>sum+x*(a[k]-p[k]),0)/denominator;
}
export async function makeWorldSurface(map,{constrained=false,checkpoint}={}) {
  const {rows,columns}=worldSurfacePlan(constrained),count=(rows+1)*(columns+1);
  const positions=new Float64Array(count*3),normals=new Float32Array(count*3),st=new Float32Array(count*2);
  const indices=new Uint32Array(rows*columns*6);
  for(let j=0;j<=rows;j++) {
    if(checkpoint&&j%8===0)await checkpoint();
    const lat=90-j/rows*180,t=lat*Math.PI/180;
    for(let i=0;i<=columns;i++) {
      const lon=i/columns*360-180,r=lon*Math.PI/180,k=j*(columns+1)+i;
      positions.set(corner(map,i,j,rows,columns),k*3);
      normals.set([Math.cos(t)*Math.cos(r),Math.cos(t)*Math.sin(r),Math.sin(t)],k*3);
      st.set([i/columns,1-j/rows],k*2);
      if(i<columns&&j<rows){const b=k+1,c=k+columns+1,d=c+1;
        indices.set([k,c,b,b,c,d],(j*columns+i)*6);}
    }
  }
  return {positions,normals,st,indices};
}
