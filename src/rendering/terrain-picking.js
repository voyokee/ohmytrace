// Cesium 1.120 scans every terrain triangle for every height ray. Keep its geometry and triangle
// intersection test, but prune candidates with conservative 3D bounds over texture-coordinate bins.
const yieldTask=()=>globalThis.scheduler?.yield?.()||new Promise(resolve=>setTimeout(resolve,0));
function abortIfChanged(mesh,stamp,signal) {
  signal?.throwIfAborted();
  if(mesh.vertices!==stamp.vertices||mesh.indices!==stamp.indices||mesh.encoding!==stamp.encoding||
    mesh.encoding.exaggeration!==stamp.exaggeration||mesh.encoding.exaggerationRelativeHeight!==stamp.relative)
    throw new DOMException('Terrain mesh changed','AbortError');
}
export function terrainStamp(mesh) {
  return {vertices:mesh.vertices,indices:mesh.indices,encoding:mesh.encoding,
    exaggeration:mesh.encoding.exaggeration,relative:mesh.encoding.exaggerationRelativeHeight};
}
export function sameTerrainStamp(mesh,stamp) {
  return mesh.vertices===stamp.vertices&&mesh.indices===stamp.indices&&mesh.encoding===stamp.encoding&&
    mesh.encoding.exaggeration===stamp.exaggeration&&mesh.encoding.exaggerationRelativeHeight===stamp.relative;
}
export async function buildTerrainPickIndex(mesh,{signal,checkpoint=yieldTask}={}) {
  const C=Cesium,stamp=terrainStamp(mesh),encoding=stamp.encoding;
  const count=mesh.vertices.length/encoding.stride;
  const positions=new Float64Array(count*3),uv=new Float32Array(count*2),center=C.Cartesian3.clone(mesh.center);
  const inverse=C.Matrix4.inverseTransformation(C.Transforms.eastNorthUpToFixedFrame(center),new C.Matrix4());
  const point=new C.Cartesian3(),tex=new C.Cartesian2();
  for(let i=0;i<count;i++) {
    if(i%2048===0){await checkpoint();abortIfChanged(mesh,stamp,signal);}
    encoding.getExaggeratedPosition(mesh.vertices,i,point);
    if(![point.x,point.y,point.z].every(Number.isFinite))throw new Error('Invalid terrain position');
    C.Cartesian3.subtract(point,center,point);C.Matrix4.multiplyByPointAsVector(inverse,point,point);
    positions.set([point.x,point.y,point.z],i*3);
    encoding.decodeTextureCoordinates(mesh.vertices,i,tex);uv[i*2]=tex.x;uv[i*2+1]=tex.y;
    if(!Number.isFinite(tex.x)||!Number.isFinite(tex.y))throw new Error('Invalid terrain coordinates');
  }
  const size=Math.min(16,Math.max(4,Math.ceil(Math.sqrt(mesh.indices.length/3/96))));
  const buckets=Array.from({length:size*size+1},()=>[]),bounds=new Float64Array(buckets.length*6);
  for(let i=0;i<bounds.length;i++)bounds[i]=i%6<3?Infinity:-Infinity;
  const bin=v=>Math.max(0,Math.min(size-1,Math.floor(v*size)));
  const insert=(bucket,offset,a,b,c)=>{
    buckets[bucket].push(offset);const start=bucket*6;
    for(const vertex of [a,b,c])for(let axis=0;axis<3;axis++) {
      const value=positions[vertex*3+axis];
      bounds[start+axis]=Math.min(bounds[start+axis],value);
      bounds[start+axis+3]=Math.max(bounds[start+axis+3],value);
    }
  };
  for(let i=0;i<mesh.indices.length;i+=3) {
    if(i%6144===0){await checkpoint();abortIfChanged(mesh,stamp,signal);}
    const a=mesh.indices[i],b=mesh.indices[i+1],c=mesh.indices[i+2];
    const x0=bin(Math.min(uv[a*2],uv[b*2],uv[c*2])),x1=bin(Math.max(uv[a*2],uv[b*2],uv[c*2]));
    const y0=bin(Math.min(uv[a*2+1],uv[b*2+1],uv[c*2+1])),y1=bin(Math.max(uv[a*2+1],uv[b*2+1],uv[c*2+1]));
    // Irregular/fill triangles can span many bins. An overflow bucket keeps construction bounded.
    if((x1-x0+1)*(y1-y0+1)>16)insert(size*size,i,a,b,c);
    else for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)insert(y*size+x,i,a,b,c);
  }
  abortIfChanged(mesh,stamp,signal);
  const packed=buckets.map(a=>new Uint32Array(a));
  return {center,inverse,positions,indices:mesh.indices,buckets:packed,bounds,stamp,
    bytes:positions.byteLength+bounds.byteLength+128+packed.reduce((n,a)=>n+a.byteLength,0),
    scratch:{ray:new C.Ray(),a:new C.Cartesian3(),b:new C.Cartesian3(),c:new C.Cartesian3()},lastTests:0};
}
function intersectsBox(ray,bounds,offset,best) {
  let near=0,far=best;
  for(let axis=0;axis<3;axis++) {
    const key=axis===0?'x':axis===1?'y':'z',origin=ray.origin[key],direction=ray.direction[key];
    const lo=bounds[offset+axis]-.001,hi=bounds[offset+axis+3]+.001;
    if(lo>hi)return false;
    if(direction===0){if(origin<lo||origin>hi)return false;continue;}
    let a=(lo-origin)/direction,b=(hi-origin)/direction;if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
  }
  return far>=0;
}
export function pickTerrainIndex(index,ray,cullBackFaces=false,result) {
  const C=Cesium,{positions,indices,scratch}=index,local=scratch.ray;
  C.Cartesian3.subtract(ray.origin,index.center,local.origin);
  C.Matrix4.multiplyByPointAsVector(index.inverse,local.origin,local.origin);
  C.Matrix4.multiplyByPointAsVector(index.inverse,ray.direction,local.direction);
  let closest=Infinity;index.lastTests=0;
  for(let bin=0;bin<index.buckets.length;bin++) {
    const bucket=index.buckets[bin];if(!bucket.length||!intersectsBox(local,index.bounds,bin*6,closest))continue;
    for(const offset of bucket) {
      C.Cartesian3.fromArray(positions,indices[offset]*3,scratch.a);
      C.Cartesian3.fromArray(positions,indices[offset+1]*3,scratch.b);
      C.Cartesian3.fromArray(positions,indices[offset+2]*3,scratch.c);index.lastTests++;
      const t=C.IntersectionTests.rayTriangleParametric(local,scratch.a,scratch.b,scratch.c,cullBackFaces);
      if(t!==undefined&&t>=0&&t<closest)closest=t;
    }
  }
  return closest<Infinity?C.Ray.getPoint(ray,closest,result):undefined;
}

export function installTerrainPicking(viewer,{constrained=false}={}) {
  const C=Cesium,prototype=C.GlobeSurfaceTile?.prototype;
  if(C.VERSION!=='1.120'||!prototype?.pick)return {details:()=>({terrainPickEnabled:false}),clear(){},dispose(){}};
  const original=prototype.pick,cache=new Map(),active=new Set();
  const maxEntries=constrained?8:16,maxBytes=(constrained?8:24)*1024*1024;
  let disposed=false,bytes=0,hits=0,fallbacks=0,failures=0;
  const drop=(mesh,entry)=>{cache.delete(mesh);entry.controller?.abort();bytes-=entry.index?.bytes||0;};
  const clear=()=>{for(const [mesh,entry]of cache)drop(mesh,entry);};
  function touch(mesh,entry){cache.delete(mesh);cache.set(mesh,entry);}
  function start(mesh) {
    if(active.size>=2||mesh.vertices.byteLength*3>maxBytes)return;
    while(cache.size>=maxEntries){const [old,value]=cache.entries().next().value;drop(old,value);}
    const entry={stamp:terrainStamp(mesh),controller:new AbortController()};cache.set(mesh,entry);active.add(entry);
    buildTerrainPickIndex(mesh,{signal:entry.controller.signal}).then(index=>{
      if(disposed||cache.get(mesh)!==entry||!sameTerrainStamp(mesh,entry.stamp))return;
      entry.index=index;bytes+=index.bytes;touch(mesh,entry);
      while(cache.size>maxEntries||bytes>maxBytes){const [old,value]=cache.entries().next().value;drop(old,value);}
      if(!viewer.isDestroyed?.())viewer.scene.requestRender();
    }).catch(error=>{if(error.name!=='AbortError'){failures++;entry.failed=true;console.warn('Terrain pick index:',error.message);}})
      .finally(()=>active.delete(entry));
  }
  function accelerated(ray,mode,projection,cullBackFaces,result) {
    const mesh=this.renderedMesh;
    if(disposed||mode!==undefined&&mode!==C.SceneMode.SCENE3D||!mesh||mesh!==this.mesh||
      !(this.terrainData instanceof C.HeightmapTerrainData)||!mesh.center||
      viewer.camera.positionCartographic.height>1000000)
      return original.call(this,ray,mode,projection,cullBackFaces,result);
    let entry=cache.get(mesh);
    if(entry&&!sameTerrainStamp(mesh,entry.stamp)){drop(mesh,entry);entry=undefined;}
    if(entry?.index){touch(mesh,entry);hits++;return pickTerrainIndex(entry.index,ray,cullBackFaces,result);}
    fallbacks++;if(!entry)start(mesh);
    return original.call(this,ray,mode,projection,cullBackFaces,result);
  }
  prototype.pick=accelerated;
  const remove=viewer.scene.preUpdate.addEventListener(()=>{
    if(viewer.camera.positionCartographic.height>1000000&&cache.size)clear();
  });
  return {
    clear,
    details:()=>({terrainPickEnabled:true,terrainPickHits:hits,terrainPickFallbacks:fallbacks,
      terrainPickMeshes:cache.size,terrainPickPending:active.size,terrainPickMiB:+(bytes/1048576).toFixed(2),terrainPickFailures:failures}),
    dispose(){disposed=true;remove();clear();if(prototype.pick===accelerated)prototype.pick=original;},
  };
}
