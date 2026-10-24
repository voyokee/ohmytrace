import { makeVegetationModel, vegetationShader, preloadVegetation } from './instanced-vegetation.js?v=20261025-scenic';
export function createWorldForest(viewer,forest,{constrained=false}={}) {
  const shader=vegetationShader({world:true}),live=new Map(),pending=new Map(),retries=new Map();
  const controller=new AbortController();
  let lastCheck=-Infinity,disposed=false,currentMix=1,failures=0,settled=false;
  const maxChunks=constrained?12:28;
  const direction=new Cesium.Cartesian3();
  const chunks=forest.chunks.map(c=>({...c,up:Cesium.Cartesian3.normalize(Cesium.Cartesian3.fromDegrees(c.lon,c.lat),new Cesium.Cartesian3())}));
  preloadVegetation(constrained).catch(()=>{});
  function add(chunk,low) {
    const task=makeVegetationModel(viewer,chunk,{low,shader,signal:controller.signal})
      .then(model=>{if(disposed||currentMix<.01){model.destroy();return;}
        retries.delete(chunk.key);
        model.show=currentMix>0.01;model.color=Cesium.Color.WHITE.withAlpha(currentMix);
        let probe;
        if(new URLSearchParams(location.search).has('probe')) {
          probe=viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
          chunk.plants.filter((p,i)=>i%12===0).forEach(p=>probe.add({position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.ground),
            pixelSize:4,color:Cesium.Color.RED,disableDepthTestDistance:Infinity}));
        }
        live.set(chunk.key,{model,chunk,probe,lastSeen:performance.now(),low});viewer.scene.primitives.add(model);viewer.scene.requestRender();})
      .catch(error=>{if(error.name!=='AbortError'){failures++;const n=(retries.get(chunk.key)?.count||0)+1;
        retries.set(chunk.key,{count:n,after:performance.now()+Math.min(60000,2000*2**n)});
        console.warn('World forest:',error.stack||error.message);}})
      .finally(()=>pending.delete(chunk.key));
    pending.set(chunk.key,task);
  }
  return {
    update({mix,day,now=performance.now(),altitude}) {
      if(disposed)return;currentMix=mix;shader.setUniform('u_day',day);
      for(const entry of live.values()) {entry.model.show=mix>0.01;
        if(Math.abs(entry.model.color.alpha-mix)>0.01)entry.model.color=Cesium.Color.WHITE.withAlpha(mix);}
      if(now-lastCheck<550)return;lastCheck=now;
      if(mix<0.01) {settled=false;for(const [key,e]of live) {viewer.scene.primitives.remove(e.model);if(e.probe)viewer.scene.primitives.remove(e.probe);live.delete(key);}return;}
      Cesium.Cartesian3.normalize(viewer.camera.positionWC,direction);
      const wanted=chunks.map(chunk=>({chunk,dot:Cesium.Cartesian3.dot(chunk.up,direction)}))
        .filter(x=>x.dot>0.28).sort((a,b)=>b.dot-a.dot).slice(0,maxChunks);
      const keys=new Set(wanted.map(x=>x.chunk.key)),low=constrained||altitude>5000000;
      settled=wanted.every(({chunk})=>live.get(chunk.key)?.model.ready&&live.get(chunk.key).low===low)&&pending.size===0;
      for(const [key,e]of live) {
        if(!keys.has(key)&&now-e.lastSeen>1800 || e.low!==low) {viewer.scene.primitives.remove(e.model);if(e.probe)viewer.scene.primitives.remove(e.probe);live.delete(key);}
        else if(keys.has(key))e.lastSeen=now;
      }
      for(const {chunk} of wanted) {
        if(pending.size>=2)break;
        const retry=retries.get(chunk.key);
        if(!live.has(chunk.key)&&!pending.has(chunk.key)&&(!retry||retry.count<4&&now>retry.after))add(chunk,low);
      }
    },
    details:()=>({worldTrees:[...live.values()].reduce((n,e)=>n+(e.model.ready?e.chunk.plants.length:0),0),
      worldReady:settled,worldChunks:live.size,worldPending:pending.size,worldCandidates:forest.count,worldBiomes:forest.biomes,worldFailures:failures}),
    dispose(){disposed=true;controller.abort();for(const e of live.values()){viewer.scene.primitives.remove(e.model);if(e.probe)viewer.scene.primitives.remove(e.probe);}live.clear();shader.destroy();},
  };
}
