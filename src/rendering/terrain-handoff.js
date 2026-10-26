import {smoothstep} from './presentation-state.js';
export const HANDOFF_START=2400000,HANDOFF_END=1400000;
export const groundHandoff=altitude=>1-smoothstep(HANDOFF_END,HANDOFF_START,altitude);
// Match the global surface and its tree roots before the final opacity fade. The inverse
// art relief is an approximation; native terrain remains authoritative after the fade.
export function contractedHeight(height,blend,nativeRatio=1.65/30) {
  return height+(Math.max(0,(height-12000)*nativeRatio)-height)*blend;
}
export const groundHeightGLSL=`
float handoffHeight(vec3 position,vec3 up) {
  return dot(position,up)-length(vec3(6378137.0,6378137.0,6356752.314245)*up);
}
`;
export function surfaceHandoffVertexShader(material) {
  const source=Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexShaderSource;
  const uniform=name=>material.shaderSource.match(new RegExp('uniform\\s+float\\s+('+name+'_\\d+)\\s*;'))?.[1];
  const blend=uniform('groundBlend'),ratio=uniform('nativeReliefRatio');
  if(Cesium.VERSION!=='1.120'||!blend||!ratio||!source.includes('vec4 p = czm_computePosition();'))return undefined;
  return `uniform float ${blend};\nuniform float ${ratio};\n${groundHeightGLSL}`+source
    .replace('vec4 p = czm_computePosition();',`vec4 p = czm_computePosition();
    vec3 adjustedNormal=normal;
    if(${blend}>0.0) {
      vec3 position=position3DHigh+position3DLow;
      vec3 up=normalize(position/vec3(40680631590769.0,40680631590769.0,40408299984661.45));
      float height=handoffHeight(position,up);
      float target=max(0.0,(height-12000.0)*${ratio});
      p.xyz-=up*(height-target)*${blend};
      adjustedNormal=normalize(mix(normal,up,${blend}));
    }`)
    .replace('czm_normal * normal','czm_normal * adjustedNormal');
}
