import {syncCameraSun} from './sunlight.js';
import { createEarthMaterials, SUN_EC } from './earth-materials.js?v=20261026-continuity';
import { presentationState } from './presentation-state.js';
import { earthTexturePlan, runtimeDeviceConfig } from './texture-policy.js?v=20261026-mobile-clear';
import { makeWorldForest, WORLD_RELIEF, WORLD_RIDGE_RELIEF, WORLD_RIDGE_MAX, random } from '../scenery/world-data.js?v=20261026-relief-fit';
import {makeWorldSurface,surfaceGround,installSurfaceSampling} from '../scenery/world-surface.js?v=20261025-ridges';
import {makeCanopyContact} from '../scenery/canopy-contact.js';
import { createWorldForest } from '../scenery/world-forest.js?v=20261026-continuity';
import {RegionalForest} from '../scenery/regional-forest.js?v=20261026-continuity';
import {regionalWorldScale} from '../scenery/regional-forest-data.js?v=20261026-continuity';
import {groundHandoff,surfaceHandoffVertexShader} from './terrain-handoff.js';

const asset = name => new URL('../../assets/' + name, import.meta.url).href;
const loadImage = url => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to load ' + url));
  image.src = url;
});

// Decode once and bound texture memory. The downloaded originals remain unchanged.
async function loadTexture(name, maxWidth) {
  const image = await loadImage(asset(name));
  if (image.width <= maxWidth) return image;
  const canvas = document.createElement('canvas'), ratio = Math.min(1, maxWidth / image.width);
  canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function shell(viewer, material, altitude, writeDepth = false, terrain,groundMorph=false) {
  const radii = Cesium.Cartesian3.add(Cesium.Ellipsoid.WGS84.radii,
    new Cesium.Cartesian3(altitude, altitude, altitude), new Cesium.Cartesian3());
  // Single front face: Cesium's closed+translucent two-pass path would also draw the far hemisphere.
  const appearance = new Cesium.MaterialAppearance({ material, flat: true, closed: false, translucent: true,
    vertexShaderSource:groundMorph&&writeDepth?surfaceHandoffVertexShader(material):undefined,
    renderState: { depthTest: { enabled: true }, depthMask: writeDepth,
      cull: { enabled: true, face: Cesium.CullFace.BACK }, blending: Cesium.BlendingState.ALPHA_BLEND } });
  appearance.isTranslucent = () => !writeDepth || material.uniforms.opacity < 0.999;
  return viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: terrain || new Cesium.EllipsoidGeometry({ radii,
      stackPartitions: 128, slicePartitions: 256,
      vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat }) }),
    appearance,
    asynchronous: false, allowPicking: false,
  }));
}

function pixels(image,width=1024) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width/2;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,width,width/2);
  return {width,height:width/2,data:context.getImageData(0,0,width,width/2).data};
}
function terrainGeometry(data) {
  return new Cesium.Geometry({attributes:{
    position:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:data.positions}),
    normal:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:data.normals}),
    st:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:data.st})},
    indices:data.indices,primitiveType:Cesium.PrimitiveType.TRIANGLES,
    boundingSphere:Cesium.BoundingSphere.fromVertices(data.positions)});
}

export function setupCinematic(viewer, { onError = () => {}, terrainExaggeration = 1.65 } = {}) {
  const scene = viewer.scene;
  const continuous=Cesium.VERSION==='1.120'&&new URLSearchParams(location.search).get('handoff')!=='0';
  const regionalEnabled=continuous&&new URLSearchParams(location.search).get('regional')!=='0';
  const traceEnabled=new URLSearchParams(location.search).get('handofftrace')==='1';
  const handoffTrace=[];let lastTrace=-Infinity;
  let currentGroundBlend=0;
  const plan = earthTexturePlan({ ...runtimeDeviceConfig(),maxTextureSize: Cesium.ContextLimits.maximumTextureSize });
  const canvas = document.createElement('canvas');
  canvas.id = 'cosmos'; canvas.setAttribute('aria-hidden', 'true');
  const halo = document.createElement('div');
  halo.id = 'sun-halo'; halo.hidden = true; halo.setAttribute('aria-hidden', 'true');
  const rim=document.createElement('div');rim.id='earth-rim';rim.hidden=true;rim.setAttribute('aria-hidden','true');
  document.body.prepend(canvas, rim, halo);
  let starImage, materials, textures, error, layers = [], disposed = false;
  let detail = 'preview', upgradeJob;
  let worldWorker,worldForest,heightPixels,reliefReady=false,worldError,worldTimeout,worldDataSource='pending';
  let worldSurfaceStats={};
  let regional,focus,focusMonth=8;
  let state = presentationState(0, false), previousHalo = '';
  let surfaceIsolated = false, atmosphereEnabled = true, terrainEnabled=true;
  const handoffs = [];
  const paint = () => {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, w, h);
    if (starImage) {
      ctx.save(); ctx.translate(w * 0.50, h * 0.5); ctx.rotate(0.50); ctx.scale(-1, 1);
      // Exclude the polar rows of the equirectangular sky map, where stars are stretched.
      const band=starImage.height*.56,scale = Math.max(w / starImage.width, h / band) * 1.25;
      const iw = starImage.width * scale, ih = band * scale;
      ctx.globalAlpha = 0.72;ctx.filter='brightness(1.45) contrast(1.35)';
      ctx.drawImage(starImage,0,starImage.height*.22,starImage.width,band,-iw*.47,-ih*.52,iw,ih);ctx.restore();
    }
    const dark = ctx.createRadialGradient(w * .5, h * .43, h * .2, w * .5, h * .5, Math.max(w, h) * .85);
    dark.addColorStop(0, '#02061100'); dark.addColorStop(1, '#01030b80');
    ctx.fillStyle = dark; ctx.fillRect(0, 0, w, h);
    // Crisp points complement the historical galaxy image; painted only on load/resize.
    const rnd=random(82417),count=Math.round(w*h/450);
    for(let i=0;i<count;i++) {
      const x=rnd()*w,y=rnd()*h,bright=rnd(),r=bright>.992?1.4:bright>.95?.8:.35;
      ctx.fillStyle=`rgba(${185+Math.floor(rnd()*70)},${205+Math.floor(rnd()*50)},255,${.22+bright*.65})`;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      if(bright>.996){const glow=ctx.createRadialGradient(x,y,0,x,y,5);glow.addColorStop(0,'#e0f3ffc0');glow.addColorStop(.2,'#b0dcff50');glow.addColorStop(1,'#8ccaff00');ctx.fillStyle=glow;ctx.fillRect(x-5,y-5,10,10);}
    }
  };
  paint(); window.addEventListener('resize', paint);
  (plan.constrained ? loadTexture('earth/stars.jpg', 2048) : loadImage(asset('earth/stars.jpg'))).then(img => {
    if (!disposed) { starImage = img; paint(); }
  }).catch(() => {});
  const ready = Promise.all(['earth/day-mobile.jpg', 'earth/height-mobile.jpg', 'earth/depth-mobile.jpg',
    'earth/night-mobile.jpg', 'clouds-nasa.jpg'].map(name => loadTexture(name, plan.previewWidth))).then(images => {
    if (disposed) return false;
    textures = Object.fromEntries(['day', 'height', 'depth', 'night', 'cloud'].map((name, i) => [name, images[i]]));
    const contact=document.createElement('canvas');contact.width=contact.height=1;
    textures.contact=contact;
    materials = createEarthMaterials(textures);
    layers.push(shell(viewer, materials.surface, 12000, true,undefined,continuous));
    layers.push(shell(viewer, materials.clouds, 170000));
    layers.push(shell(viewer, materials.atmosphere, 120000));
    const dayPixels=pixels(textures.day),nightPixels=pixels(textures.night);heightPixels=pixels(textures.height,plan.constrained?1024:2048);
    if(regionalEnabled)
      regional=new RegionalForest(viewer,{day:dayPixels,height:heightPixels,night:nightPixels},{constrained:plan.constrained});
    const fallback=()=>new Promise((resolve,reject)=>setTimeout(async()=>{
      try {
        worldDataSource='fallback';
        if(disposed)throw new DOMException('World disposed','AbortError');
        const forest=makeWorldForest(dayPixels,heightPixels,{constrained:plan.constrained,nightMap:nightPixels});
        forest.contact=makeCanopyContact(forest,{constrained:plan.constrained,dayMap:dayPixels,heightMap:heightPixels});
        const surface=await makeWorldSurface(heightPixels,{constrained:plan.constrained,checkpoint:async()=>{
          await new Promise(r=>setTimeout(r,0));if(disposed)throw new DOMException('World disposed','AbortError');
        }});
        resolve({forest,surface});
      }catch(error){reject(error);}
    },0));
    const worldData=typeof Worker==='function'?new Promise((resolve,reject)=>{
      worldWorker=new Worker(new URL('../scenery/world-worker.js?v=20261026-relief-fit',import.meta.url),{type:'module'});
      worldTimeout=setTimeout(()=>{worldWorker?.terminate();reject(new Error('World worker timed out'));},12000);
      worldWorker.onmessage=({data})=>{worldDataSource='worker';clearTimeout(worldTimeout);if(data.error)reject(new Error(data.error));else resolve(data);};
      worldWorker.onerror=error=>{clearTimeout(worldTimeout);reject(new Error(error.message));};
      worldWorker.postMessage({day:dayPixels,height:heightPixels,night:nightPixels,constrained:plan.constrained});
    }).catch(()=>fallback()):fallback();
    worldData.then(({forest,surface})=>{
      if(disposed)return;
      installSurfaceSampling(heightPixels,plan.constrained,surface.refinements);
      worldSurfaceStats={worldSurfaceTriangles:surface.indices.length/3,worldSurfaceVertices:surface.positions.length/3,
        worldMountainCells:surface.refinements.reduce((n,v)=>n+v,0)};
      const geometry=terrainGeometry(surface);
      if(disposed)return;
      const atlas=document.createElement('canvas');atlas.width=forest.contact.width;atlas.height=forest.contact.height;
      atlas.getContext('2d').putImageData(new ImageData(forest.contact.data,atlas.width,atlas.height),0,0);
      textures.contact=atlas;delete forest.contact;
      const previous=layers[0],oldMaterial=materials.surface;
      const replacement=createEarthMaterials(textures);materials.surface=replacement.surface;
      replacement.clouds.destroy();replacement.atmosphere.destroy();
      layers[0]=shell(viewer,materials.surface,12000,true,geometry,continuous);
      scene.primitives.remove(previous);reliefReady=true;
      oldMaterial.destroy();
      worldForest=createWorldForest(viewer,forest,{constrained:plan.constrained,groundMorph:continuous,nativeReliefRatio:terrainExaggeration/WORLD_RELIEF});scene.requestRender();
    }).catch(reason=>{if(disposed||reason.name==='AbortError')return;worldError=reason.message;console.warn('Miniature world:',reason.message);})
      .finally(()=>{worldWorker?.terminate();worldWorker=undefined;});
    // Present the small local maps immediately, then replace only the albedo. Never hide the globe
    // or rebuild its geometry/material while the detailed source is decoding.
    if (plan.surfaceWidth > textures.day.width) {
      detail = 'loading';
      const upgrade = async () => {
        upgradeJob = undefined;
        if (disposed) return;
        try {
          const image = await loadTexture('earth/day.jpg', plan.surfaceWidth);
          if (disposed) return;
          textures.day = image;
          materials.surface.uniforms.dayMap = image;
          detail = 'full';
          scene.requestRender();
        } catch {
          if (disposed) return;
          detail = 'preview-fallback';
          scene.requestRender();
        }
      };
      upgradeJob = typeof requestIdleCallback === 'function'
        ? { idle: true, id: requestIdleCallback(upgrade, { timeout: 1200 }) }
        : { idle: false, id: setTimeout(upgrade, 0) };
    } else detail = 'limited';
    scene.requestRender(); return true;
  }).catch(reason => {
    layers.forEach(layer => scene.primitives.remove(layer)); layers = [];
    if (materials) [materials.surface, materials.clouds, materials.atmosphere].forEach(material => material.destroy());
    materials = undefined; error = reason.message;
    scene.globe.show = true; scene.skyAtmosphere.show = true;
    onError(reason); scene.requestRender(); return false;
  });

  const sunEC = new Cesium.Cartesian3(...SUN_EC), sunWC = new Cesium.Cartesian3(), point = new Cesium.Cartesian2();
  Cesium.Cartesian3.normalize(sunEC, sunEC);
  const start = performance.now();
  return {
    ready, isReady: () => !!materials,
    setFocus(point,month=8){focus=point?Cesium.Cartesian3.clone(point):undefined;focusMonth=month;if(focus)regional?.preload(focus,month);},
    groundHeight:(lon,lat)=>reliefReady?surfaceGround(heightPixels,lon,lat,plan.constrained):12000,
    toggleForestDetail(){worldForest?.toggleDetail();},
    toggleSurface() { surfaceIsolated = !surfaceIsolated; },
    toggleAtmosphere() { atmosphereEnabled = !atmosphereEnabled; },
    toggleTerrain() {terrainEnabled=!terrainEnabled;},
    details: () => ({ renderer: state.phase, earthMix: +state.mix.toFixed(2), earthTexture: textures?.day.width || 0,
      earthDetail: detail,
      worldRelief:reliefReady, worldDataSource, worldReliefScale:WORLD_RELIEF,worldRidgeRelief:WORLD_RIDGE_RELIEF,worldRidgeMax:WORLD_RIDGE_MAX, worldContactMap:textures?.contact.width||0,
      smoothHandoff:continuous,regionalEnabled,worldGroundBlend:+currentGroundBlend.toFixed(3),terrainExaggeration:scene.verticalExaggeration,
      ...worldSurfaceStats,...(worldForest?.details()||{}),...(regional?.details()||{}),...(worldError?{worldError}:{}),
      ...(error ? { earthError: error } : {}) }),
    update({ altitude, day, lightUniforms, reducedMotion = false, now = performance.now(),terrainReady=true,localReady=false }) {
      if (disposed) return;
      state = presentationState(altitude, !!materials);
      // Cesium 1.120 also exaggerates glTF models with a local-curvature approximation. At orbital
      // distances this displaces entire forests. The miniature layer already contains its own relief.
      scene.verticalExaggeration = continuous?terrainExaggeration:state.surface?1:terrainExaggeration;
      currentGroundBlend=continuous?groundHandoff(altitude):0;
      if(terrainReady)regional?.update({altitude,day,now,mix:state.mix,focus,month:focusMonth,localReady});
      if (handoffs[handoffs.length - 1]?.phase !== state.phase) {
        handoffs.push({ phase: state.phase, altitude: Math.round(altitude), mix: +state.mix.toFixed(3) });
        if (handoffs.length > 12) handoffs.shift();
        viewer.canvas.dataset.handoffs = JSON.stringify(handoffs);
      }
      viewer.canvas.dataset.renderer = state.phase;
      viewer.canvas.dataset.earthMix = state.mix.toFixed(3);
      viewer.canvas.dataset.worldGroundBlend=currentGroundBlend.toFixed(3);
      viewer.canvas.dataset.worldNativeReliefRatio=String(terrainExaggeration/WORLD_RELIEF);
      viewer.canvas.dataset.earthTexture = String(textures?.day.width || 0);
      viewer.canvas.dataset.earthDetail = detail;
      viewer.canvas.dataset.worldRelief=String(reliefReady);
      viewer.canvas.dataset.worldDataSource=worldDataSource;
      viewer.canvas.dataset.surfaceReady=String(layers[0]?.ready);
      if(worldForest) {
        worldForest.update({mix:state.mix,day,altitude,now,canopyScale:regional?.supported ? regionalWorldScale(altitude) : 1,groundBlend:currentGroundBlend});
        if(materials)materials.surface.uniforms.canopyMix=Math.min(1,worldForest.details().worldTrees/1000);
        viewer.canvas.dataset.worldForest=JSON.stringify(worldForest.details());
        viewer.canvas.dataset.worldReady=String(worldForest.details().worldReady);
      }
      if(traceEnabled&&now-lastTrace>=150) {
        lastTrace=now;const r=regional?.details();
        handoffTrace.push({time:Math.round(now-start),altitude:Math.round(altitude),mix:+state.mix.toFixed(3),
          groundBlend:+currentGroundBlend.toFixed(3),worldScale:regional?.supported?+regionalWorldScale(altitude).toFixed(3):1,
          worldTrees:worldForest?.details().worldTrees||0,regionalTrees:r?.regionalInstances||0,regionalReady:!!r?.regionalReady,
          regionalOpacity:r?.regionalOpacity||0,regionalRadius:r?.regionalRadius||0,regionalHeight:r?.regionalTreeHeight||0,
          localReady,nativeExaggeration:scene.verticalExaggeration});
        if(handoffTrace.length>120)handoffTrace.shift();viewer.canvas.dataset.handoffTrace=JSON.stringify(handoffTrace);
      }
      scene.globe.show = terrainEnabled && (state.terrain || surfaceIsolated);
      scene.skyAtmosphere.show = state.mix < 0.01 && atmosphereEnabled;
      if (!materials) return;
      syncCameraSun(viewer.camera.inverseViewMatrix,sunEC,sunWC);
      for (const material of [materials.surface, materials.clouds, materials.atmosphere]) {
        const u = material.uniforms;
        Cesium.Cartesian3.clone(sunWC, u.sunWC);
        u.opacity = state.mix; u.day = day;
        u.cloudPhase = reducedMotion ? 0 : (now - start) / 1000 * 0.0000015;
      }
      layers.forEach((layer, i) => { layer.show = state.surface && (i === 0 ? !surfaceIsolated : i !== 2 || atmosphereEnabled); });
      const u = materials.surface.uniforms;
      u.groundBlend=currentGroundBlend;u.nativeReliefRatio=terrainExaggeration/WORLD_RELIEF;
      u.visitRadius = Math.max(0.018, (lightUniforms?.fpRadius || 300000) / 6378137);
      materials.visitNames.forEach((name, i) => {
        const v = lightUniforms?.['fpL' + String(i).padStart(2, '0')], out = u[name];
        if (v?.w > 0.001) {
          const z = v.z / 0.99330562, length = Math.hypot(v.x, v.y, z);
          out.x = v.x / length; out.y = v.y / length; out.z = z / length; out.w = v.w;
        } else out.w = 0;
      });
      halo.hidden = !state.surface || day < 0.01;
      rim.hidden=halo.hidden||!atmosphereEnabled;
      if (halo.hidden) return;
      const p = Cesium.SceneTransforms.worldToWindowCoordinates(scene, Cesium.Cartesian3.ZERO, point);
      if (!p) { halo.hidden = true; return; }
      const cam = viewer.camera, radiusEarth = Cesium.Ellipsoid.WGS84.maximumRadius;
      const distance = Cesium.Cartesian3.magnitude(cam.positionWC);
      const focal = viewer.canvas.clientHeight / (2 * Math.tan(cam.frustum.fovy / 2));
      const radius = focal * radiusEarth / Math.sqrt(Math.max(1, distance * distance - radiusEarth * radiusEarth));
      const length = Math.hypot(SUN_EC[0], SUN_EC[1]);
      const transform = `translate(${(p.x + radius * 1.018 * SUN_EC[0] / length).toFixed(1)}px,${(p.y - radius * 1.018 * SUN_EC[1] / length).toFixed(1)}px) translate(-50%,-50%)`;
      const key = transform + radius.toFixed(1) + day.toFixed(2) + state.mix.toFixed(2);
      if (key !== previousHalo) {
        previousHalo = key; halo.style.width = `${radius * 0.95}px`; halo.style.transform = transform;
        halo.style.opacity = state.mix * day;
        rim.style.width=rim.style.height=`${(radius*2.025).toFixed(1)}px`;
        rim.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;
        rim.style.opacity=state.mix*day;
      }
    },
    dispose() {
      if (upgradeJob) {
        if (upgradeJob.idle) cancelIdleCallback(upgradeJob.id); else clearTimeout(upgradeJob.id);
      }
      disposed = true; layers.forEach(layer => scene.primitives.remove(layer));
      clearTimeout(worldTimeout);worldWorker?.terminate();worldForest?.dispose();regional?.dispose();
      if (materials) [materials.surface, materials.clouds, materials.atmosphere].forEach(material => material.destroy());
      window.removeEventListener('resize', paint); canvas.remove(); halo.remove();rim.remove();
      scene.globe.show = true; scene.skyAtmosphere.show = true;
    },
  };
}
