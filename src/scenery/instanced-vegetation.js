import {worldCanopyVertexShader} from './canopy-shader.js';
import { instantiateVegetation } from './vegetation-assets.js?v=20261025-canopy';
import { SUN_EC } from '../rendering/earth-materials.js?v=20261025-canopy';
const libraries = new Map();
export function preloadVegetation(low=false) {
  const key=low?'vegetation-low.glb':'vegetation.glb';
  if(!libraries.has(key)) libraries.set(key,fetch(new URL('../../assets/models/'+key+'?v=20261025-canopy',import.meta.url))
    .then(r=>{if(!r.ok)throw new Error('Vegetation asset HTTP '+r.status);return r.arrayBuffer();})
    .then(buffer=>new Uint8Array(buffer)).catch(error=>{libraries.delete(key);throw error;}));
  return libraries.get(key);
}
export function vegetationShader({wind=false,world=false}={}) {
  const shapeVariation=world&&Cesium.VERSION==='1.120';
  const direction=new Cesium.Cartesian3(...SUN_EC);Cesium.Cartesian3.normalize(direction,direction);
  return new Cesium.CustomShader({lightingModel:Cesium.LightingModel.UNLIT,
    uniforms:{u_sun:{type:Cesium.UniformType.VEC3,value:direction},u_day:{type:Cesium.UniformType.FLOAT,value:1},
      u_autumn:{type:Cesium.UniformType.FLOAT,value:0},u_snow:{type:Cesium.UniformType.FLOAT,value:0},
      u_time:{type:Cesium.UniformType.FLOAT,value:0}},
    ...(shapeVariation?{varyings:{v_canopySeed:Cesium.VaryingType.FLOAT},vertexShaderText:worldCanopyVertexShader}:wind?{vertexShaderText:`void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
      float h=clamp(vsInput.attributes.texCoord_0.x,0.0,1.0);
      float phase=dot(vsInput.attributes.positionMC.xy,vec2(0.001,0.0015));
      vsOutput.positionMC.xy += vec2(0.35,0.18)*h*h*sin(u_time*0.8+phase);
    }`}:{}),
    fragmentShaderText:`void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      if(u_autumn>0.0) {
        float leaf=fsInput.attributes.texCoord_0.y*fsInput.attributes.texCoord_1.y;
        vec3 amber=vec3(0.55,0.23,0.025)*(0.70+0.30*fsInput.attributes.texCoord_0.x);
        material.diffuse=mix(material.diffuse,amber,u_autumn*leaf*0.75);
      }
      if(u_snow>0.0)material.diffuse=mix(material.diffuse,vec3(0.70,0.75,0.78),
        smoothstep(0.45,0.95,fsInput.attributes.texCoord_0.x)*u_snow*0.65);
      ${world?`// Low-frequency regional colour variation uses real world positions, never screen noise.
      vec3 p=normalize(fsInput.attributes.positionWC);
      float canopyVariation=sin(p.x*47.0+p.y*29.0)*sin(p.z*63.0-p.x*17.0);
      float deciduous=fsInput.attributes.texCoord_0.y*fsInput.attributes.texCoord_1.y;
      ${shapeVariation?`float leafMask=fsInput.attributes.texCoord_1.y;
      vec3 leafTone=mix(vec3(0.82,0.94,0.90),vec3(1.15,1.05,0.78),v_canopySeed);
      material.diffuse*=mix(vec3(1.0),leafTone,leafMask);`:''}
      float north=smoothstep(0.59,0.75,p.z);
      float autumn=smoothstep(0.15,0.72,canopyVariation)*north*deciduous;
      material.diffuse=mix(material.diffuse,vec3(0.46,0.29,0.035),autumn*0.68);
      material.diffuse*=0.90+0.17*(canopyVariation*.5+.5);`:''}
      float sun=max(0.0,dot(normalize(fsInput.attributes.normalEC),u_sun));
      float light=0.40+sun*0.90;
      material.diffuse *= vec3(1.04,1.0,0.91)*light*mix(0.12,1.0,u_day);
      material.emissive=vec3(0.0);
    }`});
}
export const vegetationDistanceBands=constrained=>constrained?[{low:true,near:0,far:9000}]:
  [{low:false,near:0,far:2800},{low:true,near:2800,far:9000}];
export async function makeVegetationModel(viewer,chunk,{low=false,shader,signal,near=0,far}={}) {
  const library=await preloadVegetation(low);signal?.throwIfAborted();
  const origin=Cesium.Cartesian3.fromDegrees(chunk.lon,chunk.lat,chunk.height||0);
  const matrix=Cesium.Transforms.eastNorthUpToFixedFrame(origin),inverse=Cesium.Matrix4.inverseTransformation(matrix,new Cesium.Matrix4());
  const inverseRotation=Cesium.Matrix4.getMatrix3(inverse,new Cesium.Matrix3());
  const species=new Map(),point=new Cesium.Cartesian3(),local=new Cesium.Cartesian3(),rotation=new Cesium.Matrix3();
  const enu=new Cesium.Matrix4(),frame=new Cesium.Matrix3(),heading=new Cesium.Matrix3(),quaternion=new Cesium.Quaternion();
  for(const p of chunk.plants) {
    Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.ground,Cesium.Ellipsoid.WGS84,point);Cesium.Matrix4.multiplyByPoint(inverse,point,local);
    Cesium.Transforms.eastNorthUpToFixedFrame(point,undefined,enu);Cesium.Matrix4.getMatrix3(enu,frame);
    Cesium.Matrix3.fromRotationZ(p.angle||0,heading);Cesium.Matrix3.multiply(inverseRotation,frame,rotation);
    Cesium.Matrix3.multiply(rotation,heading,rotation);Cesium.Quaternion.fromRotationMatrix(rotation,quaternion);
    if(!species.has(p.species))species.set(p.species,{species:p.species,t:[],r:[],s:[]});
    const group=species.get(p.species),width=p.width||1;
    group.t.push(local.x,local.y,local.z);group.r.push(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
    const aspect=p.aspect||1;
    group.s.push(p.height*width*aspect,p.height*width/aspect,p.height);
  }
  const groups=[...species.values()].map(g=>({species:g.species,translations:new Float32Array(g.t),
    rotations:new Float32Array(g.r),scales:new Float32Array(g.s)}));
  // A unique resource identity is essential: Cesium caches buffer views by resource URL. Passing
  // different in-memory GLBs with the same empty basePath can reuse another chunk's instance buffers.
  const url=URL.createObjectURL(new Blob([instantiateVegetation(library,groups)],{type:'model/gltf-binary'}));
  let model;
  try {model=await Cesium.Model.fromGltfAsync({url,modelMatrix:matrix,
    upAxis:Cesium.Axis.Z,forwardAxis:Cesium.Axis.X,customShader:shader,allowPicking:false,
    incrementallyLoadTextures:false,shadows:Cesium.ShadowMode.DISABLED});}
  catch(error){URL.revokeObjectURL(url);throw error;}
  model.readyEvent.addEventListener(()=>URL.revokeObjectURL(url));
  model.errorEvent.addEventListener(()=>URL.revokeObjectURL(url));
  const destroyModel=model.destroy.bind(model);
  model.destroy=()=>{URL.revokeObjectURL(url);return destroyModel();};
  model.distanceDisplayCondition=new Cesium.DistanceDisplayCondition(near,far??(chunk.plants[0]?.height>10000?100000000:9000));
  if(signal?.aborted){URL.revokeObjectURL(url);model.destroy();signal.throwIfAborted();}
  model.errorEvent.addEventListener(error=>console.warn('3D vegetation:',error.message));
  if(new URLSearchParams(location.search).has('perf'))model.readyEvent.addEventListener(()=>{
    const expected=Cesium.BoundingSphere.fromPoints(chunk.plants.map(p=>Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.ground))).center;
    const actual=Cesium.Cartographic.fromCartesian(model.boundingSphere.center),target=Cesium.Cartographic.fromCartesian(expected);
    viewer.canvas.dataset.instanceCheck=JSON.stringify({chunk:[chunk.lon,chunk.lat],actual:[Cesium.Math.toDegrees(actual.longitude),Cesium.Math.toDegrees(actual.latitude)],
      expected:[Cesium.Math.toDegrees(target.longitude),Cesium.Math.toDegrees(target.latitude)]});
  });
  return model;
}
