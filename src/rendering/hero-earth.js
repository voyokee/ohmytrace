import { createEarthMaterials, SUN_EC } from './earth-materials.js?v=20261024-earth';
import { presentationState } from './presentation-state.js';
import { earthTexturePlan } from './texture-policy.js';

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

function shell(viewer, material, altitude, writeDepth = false) {
  const radii = Cesium.Cartesian3.add(Cesium.Ellipsoid.WGS84.radii,
    new Cesium.Cartesian3(altitude, altitude, altitude), new Cesium.Cartesian3());
  // Single front face: Cesium's closed+translucent two-pass path would also draw the far hemisphere.
  const appearance = new Cesium.MaterialAppearance({ material, flat: true, closed: false, translucent: true,
    renderState: { depthTest: { enabled: true }, depthMask: writeDepth,
      cull: { enabled: true, face: Cesium.CullFace.BACK }, blending: Cesium.BlendingState.ALPHA_BLEND } });
  appearance.isTranslucent = () => !writeDepth || material.uniforms.opacity < 0.999;
  return viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: new Cesium.EllipsoidGeometry({ radii,
      stackPartitions: 128, slicePartitions: 256,
      vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat }) }),
    appearance,
    asynchronous: false, allowPicking: false,
  }));
}

export function setupCinematic(viewer, { onError = () => {} } = {}) {
  const scene = viewer.scene;
  const plan = earthTexturePlan({ coarsePointer: matchMedia('(pointer: coarse)').matches,
    memoryGB: navigator.deviceMemory, maxTextureSize: Cesium.ContextLimits.maximumTextureSize });
  const canvas = document.createElement('canvas');
  canvas.id = 'cosmos'; canvas.setAttribute('aria-hidden', 'true');
  const halo = document.createElement('div');
  halo.id = 'sun-halo'; halo.hidden = true; halo.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas, halo);
  let starImage, materials, textures, error, layers = [], disposed = false;
  let detail = 'preview', upgradeJob;
  let state = presentationState(0, false), previousHalo = '';
  let surfaceIsolated = false, atmosphereEnabled = true;
  const handoffs = [];
  const paint = () => {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, w, h);
    if (starImage) {
      ctx.save(); ctx.translate(w * 0.50, h * 0.5); ctx.rotate(0.50); ctx.scale(-1, 1);
      const scale = Math.max(w / starImage.width, h / starImage.height) * 1.35;
      const iw = starImage.width * scale, ih = starImage.height * scale;
      ctx.globalAlpha = 0.82; ctx.drawImage(starImage, -iw * 0.42, -ih * 0.55, iw, ih); ctx.restore();
    }
    const dark = ctx.createRadialGradient(w * .5, h * .43, h * .2, w * .5, h * .5, Math.max(w, h) * .85);
    dark.addColorStop(0, '#02061100'); dark.addColorStop(1, '#01030b80');
    ctx.fillStyle = dark; ctx.fillRect(0, 0, w, h);
  };
  paint(); window.addEventListener('resize', paint);
  (plan.constrained ? loadTexture('earth/stars.jpg', 2048) : loadImage(asset('earth/stars.jpg'))).then(img => {
    if (!disposed) { starImage = img; paint(); }
  }).catch(() => {});
  const ready = Promise.all(['earth/day-mobile.jpg', 'earth/height-mobile.jpg', 'earth/depth-mobile.jpg',
    'earth/night-mobile.jpg', 'clouds-nasa.jpg'].map(name => loadTexture(name, plan.previewWidth))).then(images => {
    if (disposed) return false;
    textures = Object.fromEntries(['day', 'height', 'depth', 'night', 'cloud'].map((name, i) => [name, images[i]]));
    materials = createEarthMaterials(textures);
    layers.push(shell(viewer, materials.surface, 12000, true));
    layers.push(shell(viewer, materials.clouds, 33000));
    layers.push(shell(viewer, materials.atmosphere, 85000));
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
    toggleSurface() { surfaceIsolated = !surfaceIsolated; },
    toggleAtmosphere() { atmosphereEnabled = !atmosphereEnabled; },
    details: () => ({ renderer: state.phase, earthMix: +state.mix.toFixed(2), earthTexture: textures?.day.width || 0,
      earthDetail: detail,
      ...(error ? { earthError: error } : {}) }),
    update({ altitude, day, lightUniforms, reducedMotion = false, now = performance.now() }) {
      if (disposed) return;
      state = presentationState(altitude, !!materials);
      if (handoffs[handoffs.length - 1]?.phase !== state.phase) {
        handoffs.push({ phase: state.phase, altitude: Math.round(altitude), mix: +state.mix.toFixed(3) });
        if (handoffs.length > 12) handoffs.shift();
        viewer.canvas.dataset.handoffs = JSON.stringify(handoffs);
      }
      viewer.canvas.dataset.renderer = state.phase;
      viewer.canvas.dataset.earthMix = state.mix.toFixed(3);
      viewer.canvas.dataset.earthTexture = String(textures?.day.width || 0);
      viewer.canvas.dataset.earthDetail = detail;
      scene.globe.show = state.terrain || surfaceIsolated;
      scene.skyAtmosphere.show = state.mix < 0.01 && atmosphereEnabled;
      if (!materials) return;
      Cesium.Matrix4.multiplyByPointAsVector(viewer.camera.inverseViewMatrix, sunEC, sunWC);
      Cesium.Cartesian3.normalize(sunWC, sunWC);
      for (const material of [materials.surface, materials.clouds, materials.atmosphere]) {
        const u = material.uniforms;
        Cesium.Cartesian3.clone(sunWC, u.sunWC);
        u.opacity = state.mix; u.day = day;
        u.cloudPhase = reducedMotion ? 0 : (now - start) / 1000 * 0.0000015;
      }
      layers.forEach((layer, i) => { layer.show = state.surface && (i === 0 ? !surfaceIsolated : i !== 2 || atmosphereEnabled); });
      const u = materials.surface.uniforms;
      u.visitRadius = Math.max(0.018, (lightUniforms?.fpRadius || 300000) / 6378137);
      materials.visitNames.forEach((name, i) => {
        const v = lightUniforms?.['fpL' + String(i).padStart(2, '0')], out = u[name];
        if (v?.w > 0.001) {
          const z = v.z / 0.99330562, length = Math.hypot(v.x, v.y, z);
          out.x = v.x / length; out.y = v.y / length; out.z = z / length; out.w = v.w;
        } else out.w = 0;
      });
      halo.hidden = !state.surface || day < 0.01;
      if (halo.hidden) return;
      const p = Cesium.SceneTransforms.worldToWindowCoordinates(scene, Cesium.Cartesian3.ZERO, point);
      if (!p) { halo.hidden = true; return; }
      const cam = viewer.camera, radiusEarth = Cesium.Ellipsoid.WGS84.maximumRadius;
      const distance = Cesium.Cartesian3.magnitude(cam.positionWC);
      const focal = viewer.canvas.clientHeight / (2 * Math.tan(cam.frustum.fovy / 2));
      const radius = focal * radiusEarth / Math.sqrt(Math.max(1, distance * distance - radiusEarth * radiusEarth));
      const length = Math.hypot(SUN_EC[0], SUN_EC[1]);
      const transform = `translate(${(p.x + radius * SUN_EC[0] / length).toFixed(1)}px,${(p.y - radius * SUN_EC[1] / length).toFixed(1)}px) translate(-50%,-50%)`;
      const key = transform + radius.toFixed(1) + day.toFixed(2) + state.mix.toFixed(2);
      if (key !== previousHalo) {
        previousHalo = key; halo.style.width = `${radius * 0.95}px`; halo.style.transform = transform;
        halo.style.opacity = state.mix * day;
      }
    },
    dispose() {
      if (upgradeJob) {
        if (upgradeJob.idle) cancelIdleCallback(upgradeJob.id); else clearTimeout(upgradeJob.id);
      }
      disposed = true; layers.forEach(layer => scene.primitives.remove(layer));
      if (materials) [materials.surface, materials.clouds, materials.atmosphere].forEach(material => material.destroy());
      window.removeEventListener('resize', paint); canvas.remove(); halo.remove();
      scene.globe.show = true; scene.skyAtmosphere.show = true;
    },
  };
}
