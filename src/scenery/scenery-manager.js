import {preloadVegetation,makeVegetationModel,vegetationShader,vegetationDistanceBands} from './instanced-vegetation.js?v=20261025-ridges';
import {EffectManager} from './effect-manager.js';
import {sceneTemplateFor} from './scene-templates.js';
export class SceneryManager {
  constructor(viewer,{constrained=false,reducedMotion=false}={}) {
    this.viewer=viewer;this.constrained=constrained;this.reducedMotion=reducedMotion;this.generation=0;this.models=[];
    this.effects=new EffectManager(viewer,{constrained,reducedMotion});this.shader=vegetationShader({wind:true});
  }
  preload(){return Promise.all((this.constrained?[true]:[false,true]).map(low=>preloadVegetation(low)));}
  enter(config) {
    this.exit();this.config={...config,template:sceneTemplateFor(config)};this.controller=new AbortController();
    this.preload().catch(()=>{});this.count=0;this.phase='loading';
    const fog=this.viewer.scene.fog,layer=this.viewer.imageryLayers.get(0);
    this.original={fog:fog.density,fogSse:fog.screenSpaceErrorFactor,brightness:layer.brightness,saturation:layer.saturation,contrast:layer.contrast};
    fog.density=this.config.template.fog;
    fog.screenSpaceErrorFactor=this.constrained?16:12;
    [layer.brightness,layer.saturation,layer.contrast]=this.config.template.tone;
    this.effects.enter(this.config);return this.config.template;
  }
  async populate(name,plants) {
    if(this.config?.name!==name)return;
    const generation=this.generation,{signal}=this.controller;this.count=plants.length;
    if(!plants.length){this.phase='empty';return;}
    const cells=new Map();
    for(const p of plants) {
      const key=`${Math.floor(p.lon*60)}:${Math.floor(p.lat*60)}`;
      if(!cells.has(key))cells.set(key,{key,lon:p.lon,lat:p.lat,height:p.ground,plants:[]});cells.get(key).plants.push(p);
    }
    this.chunkCount=cells.size;const bands=vegetationDistanceBands(this.constrained);
    const jobs=[...cells.values()].flatMap(chunk=>bands.map(band=>({chunk,band})));let next=0;
    try {
      await Promise.all(Array.from({length:2},async()=>{while(next<jobs.length) {
        signal.throwIfAborted();const {chunk,band}=jobs[next++];
        const model=await makeVegetationModel(this.viewer,chunk,{...band,shader:this.shader,signal});
        if(generation!==this.generation){model.destroy();return;}
        this.models.push(this.viewer.scene.primitives.add(model));this.viewer.scene.requestRender();
      }}));
      if(generation!==this.generation)return;
      this.effects.enter(this.config,plants);this.phase='ready';
    } catch(error){if(error.name!=='AbortError'){this.phase='unavailable';console.warn('Scenery:',error.message);}}
  }
  update({now=performance.now(),day=1}={}) {
    if(!this.config)return;
    // Cesium 1.120 thins fog using height above the ellipsoid. On a 4 km plateau that leaves
    // hundreds of kilometres of invisible terrain active. Compensate for the location's ground
    // elevation so distant ranges fade naturally while the nearby forest stays clear.
    const ground=Math.max(0,this.config.height||0);
    this.viewer.scene.fog.density=this.config.template.fog*Math.min(10,1+ground/1500);
    this.shader.setUniform('u_day',day);this.shader.setUniform('u_time',this.reducedMotion?0:now/1000*this.config.template.wind);
    this.shader.setUniform('u_autumn',this.config.template.autumn||0);this.shader.setUniform('u_snow',this.config.template.snow||0);
    this.effects.update(now,day);
    this.viewer.canvas.dataset.scenery=JSON.stringify(this.details());
  }
  toggle(){for(const model of this.models)model.show=!model.show;}
  unavailable(name){if(this.config?.name===name)this.phase='unavailable';}
  details(){return {sceneryTemplate:this.config?.template.id||null,sceneryLabel:this.config?.template.label||null,sceneryPhase:this.phase||'idle',
    instances:this.count||0,sceneryChunks:this.chunkCount||0,sceneryModels:this.models.length,
    vegetationVisible:this.models.some(model=>model.show),vegetationLod:this.constrained?'low':'near/far',...this.effects.details()};}
  exit(){this.generation++;this.controller?.abort();for(const model of this.models)this.viewer.scene.primitives.remove(model);
    this.models=[];this.effects.exit();if(this.original){const layer=this.viewer.imageryLayers.get(0);this.viewer.scene.fog.density=this.original.fog;
      layer.brightness=this.original.brightness;layer.saturation=this.original.saturation;layer.contrast=this.original.contrast;}
    if(this.original)this.viewer.scene.fog.screenSpaceErrorFactor=this.original.fogSse;
    this.original=undefined;this.config=undefined;this.count=this.chunkCount=0;this.phase='idle';
    this.viewer.canvas.dataset.scenery=JSON.stringify(this.details());}
  dispose(){this.exit();this.shader.destroy();this.effects.dispose();}
}
