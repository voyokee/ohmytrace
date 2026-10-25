import {makeVegetationModel,vegetationShader,preloadVegetation} from './instanced-vegetation.js?v=20261025-landscape';
export function createWorldForest(viewer,forest,{constrained=false,createModel=makeVegetationModel,loadAssets=preloadVegetation}={}) {
  const shader=vegetationShader({world:true}),live=new Map(),staging=new Map(),pending=new Map(),retries=new Map();
  const controller=new AbortController(),maxChunks=constrained?12:28,maxDetailed=constrained?0:4;
  const direction=new Cesium.Cartesian3();
  const chunks=forest.chunks.map(c=>({...c,up:Cesium.Cartesian3.normalize(Cesium.Cartesian3.fromDegrees(c.lon,c.lat),new Cesium.Cartesian3())}));
  let lastCheck=-Infinity,disposed=false,currentMix=1,failures=0,settled=false,lowView=true,inspectDetail=false,currentNow=0;
  let wantedKeys=new Set(),detailKeys=new Set(),wantedOrder=[];
  loadAssets(constrained).catch(()=>{});
  function remove(entry,keepProbe=false) {
    for(const off of entry.listeners||[])off();
    viewer.scene.primitives.remove(entry.model);
    if(entry.probe&&!keepProbe)viewer.scene.primitives.remove(entry.probe);
  }
  function failure(key,error) {
    if(disposed||error.name==='AbortError')return;
    failures++;const count=(retries.get(key)?.count||0)+1;
    retries.set(key,{count,after:currentNow+Math.min(60000,2000*2**count)});
    console.warn('World forest:',error.stack||error.message);
  }
  function add(chunk,low) {
    const task=createModel(viewer,chunk,{low,shader,signal:controller.signal}).then(model=>{
      if(disposed||currentMix<.01||!wantedKeys.has(chunk.key)){model.destroy();return;}
      const previous=live.get(chunk.key),entry={model,chunk,low,lastSeen:currentNow,listeners:[]};
      if(!previous&&live.size>=maxChunks) {
        const evict=[...live].filter(([key])=>!wantedKeys.has(key)).sort((a,b)=>a[1].lastSeen-b[1].lastSeen)[0];
        if(!evict){model.destroy();return;}remove(evict[1]);live.delete(evict[0]);
      }
      // A replacement must enter the scene to finish GPU preparation. Keep its old model until
      // ready; the tiny alpha avoids a flash without suppressing resource preparation.
      model.show=true;model.color=Cesium.Color.WHITE.withAlpha(previous?0.001:currentMix);
      if(previous)staging.set(chunk.key,entry);
      else {
        if(new URLSearchParams(location.search).has('probe')) {
          entry.probe=viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
          chunk.plants.filter((p,i)=>i%12===0).forEach(p=>entry.probe.add({position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.ground),
            pixelSize:4,color:Cesium.Color.RED,disableDepthTestDistance:Infinity}));
        }
        live.set(chunk.key,entry);
      }
      entry.listeners.push(model.readyEvent.addEventListener(()=>{
        if(live.get(chunk.key)===entry)retries.delete(chunk.key);viewer.scene.requestRender();
      }));
      entry.listeners.push(model.errorEvent.addEventListener(error=>{
        if(staging.get(chunk.key)===entry){staging.delete(chunk.key);remove(entry);}
        else if(live.get(chunk.key)===entry){live.delete(chunk.key);remove(entry);}
        failure(chunk.key,error);
      }));
      viewer.scene.primitives.add(model);viewer.scene.requestRender();
    }).catch(error=>failure(chunk.key,error)).finally(()=>pending.delete(chunk.key));
    pending.set(chunk.key,task);
  }
  function clear() {
    for(const entry of staging.values())remove(entry);staging.clear();
    for(const entry of live.values())remove(entry);live.clear();wantedKeys.clear();detailKeys.clear();wantedOrder=[];settled=false;lastCheck=-Infinity;
  }
  return {
    toggleDetail(){inspectDetail=!inspectDetail;lastCheck=-Infinity;viewer.scene.requestRender();},
    update({mix,day,now=performance.now(),altitude}) {
      if(disposed)return;currentMix=mix;currentNow=now;shader.setUniform('u_day',day);
      if(mix<.01){clear();return;}
      if(altitude>5200000)lowView=true;else if(altitude<4800000)lowView=false;
      detailKeys=new Set((!lowView||inspectDetail?wantedOrder.slice(0,maxDetailed):[]).map(x=>x.chunk.key));
      // Commit GPU-ready replacements before the next draw. Never clear every chunk at an LOD boundary.
      for(const [key,entry] of staging) {
        const low=!detailKeys.has(key);
        if(!wantedKeys.has(key)||entry.low!==low){remove(entry);staging.delete(key);continue;}
        if(!entry.model.ready)continue;
        const previous=live.get(key);entry.probe=previous?.probe;
        if(previous)remove(previous,true);
        entry.model.color=Cesium.Color.WHITE.withAlpha(mix);live.set(key,entry);staging.delete(key);retries.delete(key);
      }
      for(const entry of live.values())if(Math.abs(entry.model.color.alpha-mix)>.01)entry.model.color=Cesium.Color.WHITE.withAlpha(mix);
      if(now-lastCheck<550)return;lastCheck=now;
      Cesium.Cartesian3.normalize(viewer.camera.positionWC,direction);
      const wanted=chunks.map(chunk=>({chunk,dot:Cesium.Cartesian3.dot(chunk.up,direction)}))
        .filter(x=>x.dot>.28).sort((a,b)=>b.dot-a.dot).slice(0,maxChunks);
      wantedOrder=wanted;wantedKeys=new Set(wanted.map(x=>x.chunk.key));
      detailKeys=new Set((!lowView||inspectDetail?wanted.slice(0,maxDetailed):[]).map(x=>x.chunk.key));
      for(const [key,entry] of live) {
        if(!wantedKeys.has(key)&&now-entry.lastSeen>1800){remove(entry);live.delete(key);}
        else if(wantedKeys.has(key))entry.lastSeen=now;
      }
      for(const {chunk} of wanted) {
        if(pending.size+staging.size>=2)break;
        const low=!detailKeys.has(chunk.key),retry=retries.get(chunk.key),entry=live.get(chunk.key);
        if((!entry||entry.low!==low)&&!pending.has(chunk.key)&&!staging.has(chunk.key)&&
          (!retry||retry.count<4&&now>retry.after))add(chunk,low);
      }
      settled=wanted.every(({chunk})=>live.get(chunk.key)?.model.ready&&live.get(chunk.key).low===!detailKeys.has(chunk.key))&&
        pending.size===0&&staging.size===0;
    },
    details:()=>({worldTrees:[...live.values()].reduce((n,e)=>n+(e.model.ready?e.chunk.plants.length:0),0),
      worldReady:settled,worldChunks:live.size,worldStaging:staging.size,worldDetailed:[...live.values()].filter(e=>!e.low).length,
      worldPending:pending.size,worldCandidates:forest.count,worldBiomes:forest.biomes,worldFailures:failures}),
    dispose(){disposed=true;controller.abort();clear();shader.destroy();},
  };
}
