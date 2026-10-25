import {regionalState,regionalAnchor,regionalPlants} from './regional-forest-data.js?v=20261025-ridges';
import {makeVegetationModel,vegetationShader} from './instanced-vegetation.js?v=20261025-ridges';
const aborted=()=>new DOMException('Regional forest cancelled','AbortError');
function waitReady(model,signal) {
  if(model.ready)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let offReady,offError;
    const clean=()=>{offReady?.();offError?.();signal.removeEventListener('abort',cancel);};
    const cancel=()=>{clean();reject(aborted());};
    offReady=model.readyEvent.addEventListener(()=>{clean();resolve();});
    offError=model.errorEvent.addEventListener(error=>{clean();reject(error);});
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  });
}
export class RegionalForest {
  constructor(viewer,maps,{constrained=false,survey,createModel=makeVegetationModel,shader}={}) {
    this.viewer=viewer;this.maps=maps;this.limit=constrained?220:900;this.createModel=createModel;
    this.survey=survey||((level,points)=>Cesium.sampleTerrain(viewer.terrainProvider,level,points));
    this.shader=shader||vegetationShader({regional:true});this.generation=0;this.sets=[];this.building=[];
    this.supported=Cesium.VERSION==='1.120';
    this.lastCheck=-Infinity;this.failures=0;
  }
  request(point,radius,month) {
    const center=Cesium.Cartographic.fromCartesian(point),anchor=regionalAnchor(
      Cesium.Math.toDegrees(center.longitude),Cesium.Math.toDegrees(center.latitude),radius);
    const exaggeration=this.viewer.scene.verticalExaggeration||1;
    return {key:`${radius}:${anchor.lon.toFixed(4)}:${anchor.lat.toFixed(4)}:${month}:${exaggeration}`,
      anchor,radius,month,exaggeration};
  }
  preload(point,month=8,now=performance.now()) {
    if(this.disposed||!this.supported)return;this.now=now;this.want(this.request(point,256000,month));this.start();
  }
  want(request){if(this.wanted&&request.key!==this.wanted.key)this.controller?.abort();this.wanted=request;}
  start() {
    if(this.wanted.key!==this.key&&!this.pending&&this.sets.length<2&&this.now>=(this.retryAfter||0))this.build(this.wanted);
  }
  update({altitude,day,now,focus,month=8,localReady=false}) {
    if(this.disposed||!this.supported)return;this.now=now;
    if(altitude>=4000000){
      this.state=regionalState(altitude);this.opacity=0;this.prune(now,true);
      if(focus){this.preload(focus,month,now);for(const set of this.sets)for(const m of set.models)m.show=false;}
      else this.clear();return;
    }
    const cam=this.viewer.camera,picked=focus||cam.pickEllipsoid(new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2));
    if(!picked){this.clear();return;}
    const ground=Math.max(0,Cesium.Cartographic.fromCartesian(picked).height);
    const state=this.state=regionalState(altitude,{localReady,ground});
    if(!state.active){this.clear();return;}
    this.prune(now);
    if(now-this.lastCheck>600){this.lastCheck=now;this.want(this.request(picked,state.radius,month));this.start();}
    const elapsed=Math.max(0,Math.min(1000,now-(this.previousNow??now)));this.previousNow=now;
    this.opacity=(this.opacity||0)+(state.opacity-(this.opacity||0))*(1-Math.exp(-elapsed/180));
    this.shader.setUniform('u_day',day);this.shader.setUniform('u_canopyScale',state.treeHeight/6000);
    this.shader.setUniform('u_autumn',Math.abs(this.wanted.anchor.lat)>40&&(month===9||month===10)?1:0);
    let changed=false;
    for(const set of this.sets) {
      const fade=Math.min(1,Math.max(0,(now-set.since)/650)),alpha=this.opacity*(set.retiring?1-fade:fade);
      for(const model of set.models){
        const show=alpha>.001;if(model.show!==show){model.show=show;changed=true;}
        if(Math.abs(model.color.alpha-alpha)>.002){model.color=Cesium.Color.WHITE.withAlpha(alpha);changed=true;}
      }
    }
    // A stationary manual camera has no flight/orbit requesting frames. Finish the bounded
    // crossfade there as well, then return to the normal on-demand rendering policy.
    if(changed)this.viewer.scene.requestRender();
  }
  remove(set){for(const model of set.models)this.viewer.scene.primitives.remove(model);}
  prune(now,hidden=false) {
    for(const set of this.sets.filter(e=>e.retiring&&(hidden||now-e.since>=650))){this.remove(set);this.sets.splice(this.sets.indexOf(set),1);}
  }
  async build(request) {
    const generation=this.generation,controller=this.controller=new AbortController(),{signal}=controller;
    const models=[];this.building=models;this.pending=true;
    try {
      const candidates=regionalPlants(this.maps,request.anchor,request.radius,{limit:this.limit});
      const points=candidates.map(p=>Cesium.Cartographic.fromDegrees(p.lon,p.lat));
      const level=request.radius>200000?8:request.radius>50000?10:12;
      if(points.length)await this.survey(level,points);
      if(this.disposed||generation!==this.generation||this.wanted?.key!==request.key)throw aborted();
      const plants=candidates.flatMap((p,i)=>Number.isFinite(points[i].height)&&points[i].height>15&&points[i].height<p.treeline?
        [{...p,ground:points[i].height*request.exaggeration+.3,height:6000*p.variation,width:.8,angle:p.variation*19}]:[]);
      const chunks=new Map();
      for(const p of plants) {
        const dx=((p.lon-request.anchor.lon+540)%360)-180,key=`${dx>0}:${p.lat>request.anchor.lat}`;
        if(!chunks.has(key))chunks.set(key,{lon:p.lon,lat:p.lat,height:p.ground,plants:[]});chunks.get(key).plants.push(p);
      }
      const jobs=[...chunks.values()];let next=0;
      const outcomes=await Promise.allSettled(Array.from({length:2},async()=>{try{while(next<jobs.length){
        signal.throwIfAborted();const model=await this.createModel(this.viewer,jobs[next++],{
          low:true,shader:this.shader,signal,regional:true,far:100000000});
        if(signal.aborted||generation!==this.generation){model.destroy();throw aborted();}
        model.show=true;model.color=Cesium.Color.WHITE.withAlpha(.001);
        models.push(this.viewer.scene.primitives.add(model));this.viewer.scene.requestRender();
        await waitReady(model,signal);
      }}catch(error){controller.abort();throw error;}}));
      const rejected=outcomes.find(x=>x.status==='rejected');if(rejected)throw rejected.reason;
      if(this.disposed||generation!==this.generation||this.wanted?.key!==request.key)throw aborted();
      for(const set of this.sets){set.retiring=true;set.since=this.now;}
      this.sets.push({models,plants,since:this.now,radius:request.radius,level});
      this.key=request.key;this.building=[];this.viewer.scene.requestRender();
    } catch(error) {
      controller.abort();for(const model of models)this.viewer.scene.primitives.remove(model);
      if(error.name!=='AbortError'&&generation===this.generation&&this.wanted?.key===request.key){
        this.failures++;this.retryAfter=this.now+Math.min(30000,2000*2**Math.min(4,this.failures));
      }
    } finally {this.pending=false;if(this.controller===controller){this.controller=undefined;this.building=[];}}
  }
  clear() {
    if(!this.sets.length&&!this.key&&!this.wanted)return;
    this.generation++;this.controller?.abort();for(const set of this.sets)this.remove(set);
    for(const model of this.building)this.viewer.scene.primitives.remove(model);
    this.sets=[];this.key=this.wanted=undefined;this.retryAfter=0;
  }
  details(){return {regionalSupported:this.supported,regionalInstances:this.sets.reduce((n,e)=>n+e.plants.length,0),regionalSets:this.sets.length,
    regionalModels:this.sets.reduce((n,e)=>n+e.models.length,0),regionalStaging:this.building.length,
    regionalPending:!!this.pending,regionalReady:!!this.key&&this.key===this.wanted?.key&&!this.pending,
    regionalOpacity:+(this.opacity||0).toFixed(3),regionalRadius:this.wanted?.radius||0,regionalFailures:this.failures,
    regionalLayers:this.sets.map(e=>({radius:e.radius,level:e.level,instances:e.plants.length,retiring:!!e.retiring}))};}
  dispose(){this.disposed=true;this.clear();this.shader.destroy();}
}
