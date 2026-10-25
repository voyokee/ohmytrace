// Pinned to Cesium 1.120's instancing stage. It runs after EXT_mesh_gpu_instancing and can
// recover each root and local up axis without an extra per-instance buffer or draw call.
// Every scale is <= 1: vertices stay inside the original mesh bounds and roots never move.
export const worldCanopyVertexShader=`
void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
  v_canopySeed=0.5;
  #ifdef HAS_INSTANCING
  mat4 instanceFrame=getInstancingTransform();
  vec3 root=instanceFrame[3].xyz;
  float treeHeight=length(instanceFrame[2].xyz);
  vec3 up=instanceFrame[2].xyz/max(treeHeight,0.0001);
  vec3 offset=vsInput.attributes.positionMC-root;
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
  vsOutput.positionMC=root+((offset-up*z)*width+up*z*height)*horizon;
  v_canopySeed=seed;
  #endif
}`;
