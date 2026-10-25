import {elevationAt} from './world-elevation.js?v=20261025-ridges';
export const worldSurfacePlan=constrained=>constrained?{rows:128,columns:256}:{rows:320,columns:640};

// Spend vertices on DEM relief rather than uniformly subdividing oceans and flat plateaus.
// The global cap bounds worst-case input maps. Selection is independent of camera/order.
export function mountainRefinements(map,constrained=false) {
  const {rows,columns}=worldSurfacePlan(constrained),flags=new Uint8Array(rows*columns),candidates=[];
  for(let j=0;j<rows;j++) {
    const north=90-j/rows*180,south=90-(j+1)/rows*180;
    if(north>80||south< -65)continue;
    for(let i=0;i<columns;i++) {
      const west=i/columns*360-180,east=(i+1)/columns*360-180;
      const values=[elevationAt(map,west,north),elevationAt(map,east,north),
        elevationAt(map,west,south),elevationAt(map,east,south),elevationAt(map,(west+east)/2,(north+south)/2)];
      const high=Math.max(...values),range=high-Math.min(...values);
      if(high>600&&(range>180||high>2800&&range>80))candidates.push({key:j*columns+i,score:range*(.5+high/6400)});
    }
  }
  candidates.sort((a,b)=>b.score-a.score||a.key-b.key);
  for(const {key} of candidates.slice(0,Math.floor(rows*columns*(constrained ? .05 : .07))))flags[key]=1;
  return flags;
}

// Shared edge midpoints give both sides the same boundary, including coarse/fine transitions
// and the antimeridian. Keys address the half-step lattice: no skirts or T junctions.
export function visitSurfaceTriangles(i,j,flags,{rows,columns},emit) {
  const stride=columns*2+1,key=(x,y)=>y*stride+x;
  const refined=(x,y)=>y>=0&&y<rows&&flags[y*columns+(x+columns)%columns]===1;
  const x=i*2,y=j*2;
  if(refined(i,j)) {
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++) {
      const a=key(x+dx,y+dy),b=a+1,c=a+stride,d=c+1;emit(a,c,b);emit(b,c,d);
    }
    return;
  }
  const north=refined(i,j-1),south=refined(i,j+1),west=refined(i-1,j),east=refined(i+1,j);
  const a=key(x,y),b=key(x+2,y),c=key(x,y+2),d=key(x+2,y+2);
  if(!north&&!south&&!west&&!east){emit(a,c,b);emit(b,c,d);return;}
  const ring=[a,...(west?[key(x,y+1)]:[]),c,...(south?[key(x+1,y+2)]:[]),
    d,...(east?[key(x+2,y+1)]:[]),b,...(north?[key(x+1,y)]:[])],center=key(x+1,y+1);
  for(let n=0;n<ring.length;n++)emit(center,ring[n],ring[(n+1)%ring.length]);
}
