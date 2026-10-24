export const SUN_EC = [0.72, 0.64, 0.70];
const visitNames = Array.from({ length: 64 }, (_, i) => 'visit' + String(i).padStart(2, '0'));
// All maps share geodetic coordinates, independent of the ellipsoid mesh UV convention.
const coordinates = `
vec3 earthPosition(czm_materialInput inputData) {
  return (czm_inverseView * vec4(-inputData.positionToEyeEC, 1.0)).xyz;
}
vec3 earthUp(vec3 p) { return normalize(p / vec3(1.0, 1.0, 0.99330562)); }
vec2 earthUV(vec3 up) {
  return vec2(atan(up.y, up.x) / czm_twoPi + 0.5, asin(clamp(up.z, -1.0, 1.0)) / czm_pi + 0.5);
}
vec2 wrappedUV(vec2 uv) { return vec2(fract(uv.x), clamp(uv.y, 0.001, 0.999)); }
float cloudCover(float density) { return pow(smoothstep(0.21, 0.94, density), 1.6); }
`;

export function createEarthMaterials(textures) {
  const common = () => ({ sunWC: new Cesium.Cartesian3(1, 0, 0), opacity: 1, day: 1, cloudPhase: 0 });
  const uniforms = { ...common(), dayMap: textures.day, heightMap: textures.height,
    depthMap: textures.depth, nightMap: textures.night, cloudMap: textures.cloud,
    contactMap: textures.contact, canopyMix:0, reliefStrength:8.5,
    texel: new Cesium.Cartesian2(1 / textures.height.width, 1 / textures.height.height), visitRadius: 0.045 };
  let visits = '';
  for (const name of visitNames) {
    uniforms[name] = new Cesium.Cartesian4();
    visits += `if (${name}.w > 0.001) {
      float d = distance(up, ${name}.xyz) / visitRadius;
      footprint = max(footprint, exp(-d*d*2.8) * ${name}.w);
    }\n`;
  }
  const surface = new Cesium.Material({ translucent: true, fabric: { type: 'TravelEarthSurface', uniforms,
    source: coordinates + `
czm_material czm_getMaterial(czm_materialInput inputData) {
  czm_material m = czm_getDefaultMaterial(inputData);
  vec3 pos = earthPosition(inputData), up = earthUp(pos);
  vec2 uv = earthUV(up);
  vec3 albedo = texture(dayMap, uv).rgb;
  float ocean = smoothstep(0.015, 0.075, albedo.b - max(albedo.r, albedo.g));
  float depth = texture(depthMap, uv).r;
  float shelf = pow(clamp(depth, 0.0, 1.0), 20.0);
  vec3 water = mix(vec3(0.012, 0.17, 0.29), vec3(0.045, 0.47, 0.50), shelf);
  water += albedo * 0.16;
  albedo = mix(albedo * 1.34, water, ocean * 0.93);
  float luminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(vec3(luminance), albedo, 1.10);
  vec3 east = normalize(vec3(-up.y, up.x, 0.000001));
  vec3 north = normalize(cross(up, east));
  float hE=texture(heightMap,wrappedUV(uv+vec2(texel.x,0.0))).r;
  float hW=texture(heightMap,wrappedUV(uv-vec2(texel.x,0.0))).r;
  float hN=texture(heightMap,wrappedUV(uv+vec2(0.0,texel.y))).r;
  float hS=texture(heightMap,wrappedUV(uv-vec2(0.0,texel.y))).r;
  float dx=hE-hW,dy=hN-hS;
  float elevation = texture(heightMap, uv).r;
  float snowLine = mix(0.78,0.18,smoothstep(0.45,1.10,abs(asin(up.z))));
  float ridge = smoothstep(0.004, 0.055, length(vec2(dx, dy)));
  float existingSnow=smoothstep(0.36,0.78,luminance)*(1.0-smoothstep(0.04,0.19,abs(albedo.r-albedo.b)));
  vec3 relief = normalize(up - (east * dx + north * dy) * reliefStrength * (1.0 - ocean));
  vec3 face = normalize(cross(dFdx(pos * 0.000001), dFdy(pos * 0.000001)));
  face *= sign(dot(face, up));
  relief = normalize(mix(relief, face, 0.60 * (1.0 - ocean)));
  // Snow rests on high, upward-facing slopes; steep ridges expose cool rock below the cap.
  float resting = smoothstep(0.42, 0.94, dot(relief,up));
  float snow = smoothstep(snowLine-0.035, snowLine+0.14, elevation) *
    (0.08+existingSnow*0.74+ridge*0.54) * (0.40+resting*0.60) * (1.0-ocean);
  float alpine = smoothstep(snowLine-0.16,snowLine,elevation) * ridge * (1.0-ocean);
  albedo=mix(albedo,mix(albedo,vec3(0.40,0.43,0.42),0.52),alpine*(1.0-snow));
  albedo = mix(albedo, vec3(0.91, 0.95, 0.98), clamp(snow,0.0,0.96));
  vec3 L = normalize(sunWC), V = normalize(czm_inverseView[3].xyz - pos);
  float daylight = smoothstep(-0.30, 0.88, dot(up, L));
  float reliefLight = clamp(0.50 + 0.67 * dot(relief, L), 0.34, 1.18);
  vec2 cloudUV = wrappedUV(uv + vec2(cloudPhase, 0.0));
  vec2 shadowOffset = vec2(dot(L, east) / max(0.25, cos((uv.y-0.5)*czm_pi)), dot(L, north) * 2.0) * 0.00085 / max(0.3, dot(up,L));
  float cloudShadow = cloudCover(texture(cloudMap, wrappedUV(cloudUV + shadowOffset)).r);
  vec3 natural = albedo * (0.32 + daylight * 0.80) * mix(reliefLight, 1.0, ocean);
  float valley=clamp(((hE+hW+hN+hS)*0.25-elevation)*8.0,0.0,0.20);
  natural*=1.0-valley*(1.0-ocean);
  vec2 habitat=texture(contactMap,uv).rg;
  float contact=habitat.r*canopyMix*(1.0-ocean);
  natural=mix(natural,natural*vec3(0.80,1.16,0.72),habitat.g*0.35*(1.0-ocean));
  natural*=1.0-contact*(0.14+0.14*daylight);
  natural *= 1.0 - cloudShadow * 0.18 * daylight;
  float spec = pow(max(0.0, dot(up, normalize(L + V))), 55.0) * ocean * daylight;
  natural += vec3(0.56, 0.72, 0.79) * spec * 0.34;
  float footprint = 0.0;
  ${visits}
  vec3 city = texture(nightMap, uv).rgb;
  float lamps = smoothstep(0.025, 0.62, max(city.r, max(city.g, city.b)));
  vec3 color = mix(albedo * (0.10 + footprint * 0.72), natural, day);
  color += vec3(1.0, 0.65, 0.23) * lamps * (0.62 - daylight * 0.25) * (1.0 - cloudShadow * 0.5);
  color += vec3(1.0, 0.61, 0.15) * footprint * (0.36 + day * 0.12);
  float edge = pow(1.0 - max(0.0, dot(up, V)), 5.0);
  color = mix(color, vec3(0.11, 0.40, 0.71), edge * 0.24 * day);
  m.diffuse = vec3(0.0); m.emission = clamp(color, 0.0, 1.0); m.alpha = opacity;
  return m;
}` } });
  const clouds = new Cesium.Material({ translucent: true, fabric: {
    type: 'TravelEarthClouds', uniforms: { ...common(), cloudMap: textures.cloud,
      cloudTexel: new Cesium.Cartesian2(1 / textures.cloud.width, 1 / textures.cloud.height) },
    source: coordinates + `
czm_material czm_getMaterial(czm_materialInput inputData) {
  czm_material m = czm_getDefaultMaterial(inputData);
  vec3 up = earthUp(earthPosition(inputData));
  vec2 uv = wrappedUV(earthUV(up) + vec2(cloudPhase, 0.0));
  float density = texture(cloudMap, uv).r, cover = cloudCover(density);
  float gradient = texture(cloudMap, wrappedUV(uv + cloudTexel * vec2(1.3, 0.9))).r - density;
  float light = smoothstep(-0.3, 0.85, dot(up, normalize(sunWC)));
  vec3 color = mix(vec3(0.30, 0.39, 0.50), vec3(1.0, 0.985, 0.955), light);
  color *= clamp(1.0 - gradient * 0.8, 0.7, 1.15);
  m.diffuse = vec3(0.0); m.emission = color;
  m.alpha = cover * opacity * mix(0.16, 0.78, day);
  return m;
}` } });
  const atmosphere = new Cesium.Material({ translucent: true, fabric: {
    type: 'TravelEarthAtmosphere', uniforms: common(), source: coordinates + `
czm_material czm_getMaterial(czm_materialInput inputData) {
  czm_material m = czm_getDefaultMaterial(inputData);
  vec3 pos = earthPosition(inputData), up = earthUp(pos);
  vec3 V = normalize(czm_inverseView[3].xyz - pos);
  float rim = pow(1.0 - max(0.0, dot(up, V)), 7.0);
  float light = smoothstep(-0.35, 0.65, dot(up, normalize(sunWC)));
  m.diffuse = vec3(0.0);
  m.emission = mix(vec3(0.08, 0.30, 0.67), vec3(0.30, 0.67, 1.0), light);
  m.alpha = rim * opacity * mix(0.18, 0.63, light) * mix(0.3, 1.0, day);
  return m;
}` } });
  return { surface, clouds, atmosphere, visitNames };
}
