// Pinned to Cesium 1.120's instancing stage. It runs after EXT_mesh_gpu_instancing and can
// recover each root and local up axis without an extra per-instance buffer or draw call.
// Crown scales stay <= 1. Optional terrain handoff translates the whole tree; the loader
// expands model/command bounds by the maximum possible root descent for that chunk.
import {groundHeightGLSL} from '../rendering/terrain-handoff.js';
export const worldCanopyVertexShader=groundHeightGLSL+`
void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
  v_canopySeed=0.5;
  #ifdef HAS_INSTANCING
  mat4 instanceFrame=getInstancingTransform();
  vec3 root=instanceFrame[3].xyz;
  float treeHeight=length(instanceFrame[2].xyz);
  vec3 up=instanceFrame[2].xyz/max(treeHeight,0.0001);
  vec3 original=(instanceFrame*vec4(vsInput.attributes.source_position,1.0)).xyz;
  vec3 offset=original-root;
  float z=dot(offset,up);
  float h=clamp(vsInput.attributes.texCoord_0.x,0.0,1.0);
  float seed=fract(treeHeight*0.000173);
  float flexibility=vsInput.attributes.texCoord_1.x;
  float band=0.5+0.5*sin(h*11.0+seed*6.2831853);
  float width=1.0-(0.10+seed*0.22)*band*flexibility*smoothstep(0.18,0.65,h);
  float height=0.90+seed*0.10;
  // A far-side root can be hidden by Earth while its exaggerated crown pokes into space.
  // Collapse towards that same root near the geodetic horizon; front-facing trees stay full.
  vec3 toEye=czm_inverseModelView[3].xyz-root;
  float horizon=smoothstep(0.02,0.18,dot(up,toEye)/max(length(toEye),0.0001));
  vec3 placedRoot=root;
  if(u_groundBlend>0.0) {
    vec3 worldRoot=(czm_model*vec4(root,1.0)).xyz;
    vec3 worldUp=normalize((czm_model*vec4(up,0.0)).xyz);
    float ground=handoffHeight(worldRoot,worldUp);
    float target=max(0.0,(ground-12000.0)*u_nativeReliefRatio);
    placedRoot-=up*(ground-target)*u_groundBlend;
  }
  vsOutput.positionMC=placedRoot+((offset-up*z)*width+up*z*height)*horizon*u_canopyScale;
  v_canopySeed=seed;
  #endif
}`;

// The alias shares the existing POSITION accessor, so it adds no vertex buffer. Cesium 1.120
// runs its approximate vertical-exaggeration stage before custom shaders. Reconstruct regional
// instances from their original local coordinates; sampled root heights are exaggerated on CPU.
export const regionalCanopyVertexShader=`
void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
  v_canopySeed=0.5;
  #ifdef HAS_INSTANCING
  mat4 frame=getInstancingTransform();
  vec3 root=frame[3].xyz;
  vec3 point=(frame*vec4(vsInput.attributes.source_position,1.0)).xyz;
  vsOutput.positionMC=root+(point-root)*u_canopyScale;
  v_canopySeed=fract(length(frame[2].xyz)*0.000173);
  #endif
}`;

// Near vegetation roots are surveyed, then exaggerated once on the CPU. Reconstruct
// before wind so the engine's camera-curvature approximation cannot exaggerate them twice.
export const localVegetationVertexShader=`
void vertexMain(VertexInput vsInput,inout czm_modelVertexOutput vsOutput) {
  #ifdef HAS_INSTANCING
  mat4 frame=getInstancingTransform();
  vec3 point=(frame*vec4(vsInput.attributes.source_position,1.0)).xyz;
  float h=clamp(vsInput.attributes.texCoord_0.x,0.0,1.0);
  float phase=dot(point.xy,vec2(0.001,0.0015));
  vec3 wind=normalize(frame[0].xyz)*0.35+normalize(frame[1].xyz)*0.18;
  vsOutput.positionMC=point+wind*h*h*sin(u_time*0.8+phase)*u_wind;
  #endif
}`;
