// Development-only CPU timings around the existing context. No pixels or buffers are read.
export function profileGl(gl,scene) {
  if(!gl||!new URLSearchParams(location.search).has('profile'))return {frame(){},details:()=>({}),dispose(){}};
  const originals=[],totals=new Map();let frames=0;
  const targets=['readPixels','getBufferSubData','getParameter','getQueryParameter','drawElements','drawArrays',
    'drawElementsInstanced','drawArraysInstanced','texImage2D','texSubImage2D','bufferData','bufferSubData',
    'compileShader','linkProgram','copyTexSubImage2D','blitFramebuffer','finish','flush'].map(name=>({target:gl,name,label:name}));
  const surface=scene?.globe?._surface;
  for(const [prefix,target,names] of [
    ['globe',scene?.globe,['update','render','beginFrame','endFrame','updateHeight','getHeight']],
    ['quadtree',surface,['update','render','beginFrame','endFrame']],
    ['cache',surface?._tileReplacementQueue,['trimTiles']],
    ['terrainPick',globalThis.Cesium?.GlobeSurfaceTile?.prototype,['pick']],
    ['provider',surface?._tileProvider,['beginUpdate','endUpdate','showTileThisFrame','loadTile']],
  ])for(const name of names)if(target)targets.push({target,name,label:prefix+'.'+name});
  for(const {target,name,label}of targets) {
    const original=target[name];if(typeof original!=='function')continue;originals.push({target,name,original});
    target[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}
      finally {const entry=totals.get(label)||{ms:0,count:0,max:0},ms=performance.now()-start;
        entry.ms+=ms;entry.count++;entry.max=Math.max(entry.max,ms);totals.set(label,entry);}};
  }
  return {
    frame(){frames++;},
    details(){const n=Math.max(1,frames),entries=[...totals].sort((a,b)=>b[1].ms-a[1].ms);
      const value={cpuMs:Object.fromEntries(entries.slice(0,10).map(([name,e])=>[name,+(e.ms/n).toFixed(2)])),
        terrainTiles:surface?._debug?.tilesVisited,
        cachedTiles:surface?._tileReplacementQueue?.count,
        heightTiles:surface?._tileToUpdateHeights?.length,
        heightRegistrations:totals.get('globe.updateHeight')?.count||0,
        heightCallbacks:surface?._tilesToRender?.reduce((n,t)=>n+(t.customData?.length||0),0),
        readbacks:totals.get('readPixels')?.count||0,maxProfileCallMs:+Math.max(0,...entries.map(([,e])=>e.max)).toFixed(2)};
      totals.clear();frames=0;return value;},
    dispose(){for(const {target,name,original}of originals)target[name]=original;},
  };
}
