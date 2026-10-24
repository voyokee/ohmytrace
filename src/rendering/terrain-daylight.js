// A daylight terrain pass has no global footprint pools or orbital lighting. Keep only the
// local weather, slope modelling and aerial perspective visible from a low camera.
export function createTerrainDaylight(maxClouds) {
  const uniforms={fpLight:new Cesium.Cartesian3(0,0,1),fpHaze:1,fpTime:0,fpAutumn:0,
    fpFocusEC:new Cesium.Cartesian4(),fpWindEC:new Cesium.Cartesian3(1,0,0),fpAcrossEC:new Cesium.Cartesian3(0,1,0)};
  let shadows='';
  for(let i=0;i<maxClouds;i++) {
    const name='fpC'+String(i).padStart(2,'0');uniforms[name]=new Cesium.Cartesian4();
    shadows+=`shadow=max(shadow,cloudShade(d,${name}));\n`;
  }
  return new Cesium.Material({translucent:false,fabric:{type:'TravelTerrainDaylight',uniforms,source:`
float cloudShade(vec3 p,vec4 c) {
  vec3 offset=p-c.xyz;
  return c.w>0.0?1.0-smoothstep(c.w*0.1225,c.w,dot(offset,offset)):0.0;
}
czm_material czm_getMaterial(czm_materialInput inputData) {
  czm_material m=czm_getDefaultMaterial(inputData);
  vec3 pEC=-inputData.positionToEyeEC;
  vec3 n=normalize(cross(dFdx(pEC),dFdy(pEC)));
  n*=sign(dot(n,inputData.positionToEyeEC));
  float shade=clamp(0.5+0.5*dot(n,fpLight),0.0,1.0);
  float far=smoothstep(12000.0,90000.0,length(pEC))*fpHaze;
  float shadow=0.0,wind=0.0,focus=0.0;
  if(fpFocusEC.w>0.0) {
    vec3 d=pEC-fpFocusEC.xyz;
    focus=1.0-smoothstep(fpFocusEC.w*0.6,fpFocusEC.w,length(d));
    ${shadows}
    float across=dot(d,fpAcrossEC);
    wind=smoothstep(0.55,1.0,sin(dot(d,fpWindEC)/700.0-fpTime*0.6+sin(across/1500.0)*1.5))*focus;
  }
  float keep=(1.0-(1.0-shade)*0.55*(1.0-0.75*far))*(1.0-shadow*0.32);
  float autumn=fpAutumn*focus*0.2,haze=far*0.28,warm=wind*0.07;
  vec3 acc=vec3(0.86,0.62,0.22)*autumn;keep*=1.0-autumn;
  acc=acc*(1.0-haze)+vec3(0.6,0.7,0.82)*haze;keep*=1.0-haze;
  acc=acc*(1.0-warm)+vec3(1.0,0.86,0.6)*warm;keep*=1.0-warm;
  m.alpha=1.0-keep;m.diffuse=acc/max(m.alpha,0.0001);return m;
}`}});
}
let relative,across;
export function syncTerrainDaylight(material,source,view) {
  const C=Cesium,u=material.uniforms;
  relative ||= new C.Cartesian3();across ||= new C.Cartesian3();
  for(const name of ['fpLight','fpHaze','fpTime','fpAutumn'])u[name]=source[name];
  C.Matrix4.multiplyByPoint(view,source.fpFocus,u.fpFocusEC);u.fpFocusEC.w=source.fpFocus.w;
  C.Matrix4.multiplyByPointAsVector(view,source.fpWind,u.fpWindEC);
  C.Cartesian3.cross(source.fpWind,source.fpFocus,across);
  if(C.Cartesian3.magnitudeSquared(across)>0)C.Cartesian3.normalize(across,across);
  C.Matrix4.multiplyByPointAsVector(view,across,u.fpAcrossEC);
  for(const name of Object.keys(u).filter(name=>/^fpC\d/.test(name))) {
    C.Cartesian3.subtract(source[name],source.fpFocus,relative);
    C.Matrix4.multiplyByPointAsVector(view,relative,u[name]);u[name].w=source[name].w**2;
  }
}
