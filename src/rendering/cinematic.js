const cloudTextureUrl = new URL('../../assets/clouds-nasa.jpg', import.meta.url).href;

// Static artwork is painted only on resize; the backdrop has no animation loop.
export function setupCinematic(viewer) {
  // An independent, low-poly shell avoids competing with terrain's imagery sampler budget.
  // NASA's Blue Marble cloud composite is decorative historical imagery, not live weather.
  const cloudMaterial = new Cesium.Material({ fabric: {
    type: 'FootprintClouds', uniforms: { cloudMap: cloudTextureUrl, opacity: .76 },
    source: `czm_material czm_getMaterial(czm_materialInput inputData) {
      czm_material m = czm_getDefaultMaterial(inputData);
      float density = texture(cloudMap, inputData.st).r;
      // Discard the composite's grey veil, leaving distinct white cloud banks.
      float cover = pow(smoothstep(0.32, 0.92, density), 1.35);
      vec3 pEC = -inputData.positionToEyeEC;
      vec3 n = normalize(cross(dFdx(pEC), dFdy(pEC)));
      if (dot(n, inputData.positionToEyeEC) < 0.0) n = -n;
      float daylight = smoothstep(-0.25, 0.85, dot(n, normalize(vec3(0.85, 0.4, 0.9))));
      m.diffuse = vec3(0.0);
      m.emission = vec3(0.96, 0.98, 1.0) * mix(0.56, 1.0, daylight);
      m.alpha = cover * opacity;
      return m;
    }`,
  } });
  const radii = Cesium.Cartesian3.add(Cesium.Ellipsoid.WGS84.radii, new Cesium.Cartesian3(18000, 18000, 18000), new Cesium.Cartesian3());
  const cloudShell = viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry: new Cesium.EllipsoidGeometry({ radii,
      stackPartitions: 64, slicePartitions: 128, vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat }) }),
    appearance: new Cesium.MaterialAppearance({ material: cloudMaterial, flat: true, closed: true, translucent: true,
      renderState: { depthTest: { enabled: true }, depthMask: false,
        cull: { enabled: true, face: Cesium.CullFace.BACK }, blending: Cesium.BlendingState.ALPHA_BLEND } }),
    asynchronous: false, allowPicking: false,
  }));
  const canvas = document.createElement('canvas');
  canvas.id = 'cosmos'; canvas.setAttribute('aria-hidden', 'true');
  const halo = document.createElement('div');
  halo.id = 'sun-halo'; halo.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas, halo);
  let lastWidth = 0, lastHeight = 0;
  const paint = () => {
    const width = window.innerWidth, height = window.innerHeight;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = canvas.width = width; lastHeight = canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#02050b'; ctx.fillRect(0, 0, width, height);
    let seed = 1701;
    const rnd = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    // A restrained diagonal galactic band, behind the earth and its labels.
    ctx.save(); ctx.translate(width * .72, height * .3); ctx.rotate(.55);
    const band = ctx.createRadialGradient(0, 0, 0, 0, 0, height * .65);
    band.addColorStop(0, '#27354d4a'); band.addColorStop(.35, '#1c2b4530'); band.addColorStop(1, '#00000000');
    ctx.scale(.32, 1.8); ctx.fillStyle = band;
    ctx.fillRect(-height, -height, height * 2, height * 2); ctx.restore();
    const stars = Math.min(5000, width * height / 220);
    for (let i = 0; i < stars; i++) {
      const x = rnd() * width, y = rnd() * height, bright = rnd();
      const radius = bright > .99 ? 1.1 : bright > .9 ? .65 : .35;
      ctx.fillStyle = `rgba(${180 + (rnd() * 70 | 0)},${205 + (rnd() * 45 | 0)},255,${.18 + bright * .62})`;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      if (bright > .997) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
        glow.addColorStop(0, '#daecff80'); glow.addColorStop(1, '#c5e5ff00');
        ctx.fillStyle = glow; ctx.fillRect(x - 6, y - 6, 12, 12);
      }
    }
  };
  paint();
  window.addEventListener('resize', paint);
  const view = new Cesium.Matrix4(), center = new Cesium.Cartesian2();
  let width = 0, height = 0;
  viewer.scene.postRender.addEventListener(() => {
    const cam = viewer.camera, w = viewer.canvas.clientWidth, h = viewer.canvas.clientHeight;
    if (width === w && height === h && Cesium.Matrix4.equals(view, cam.viewMatrix)) return;
    width = w; height = h; Cesium.Matrix4.clone(cam.viewMatrix, view);
    const altitude = cam.positionCartographic.height;
    halo.hidden = altitude < 2e6;
    if (halo.hidden) return;
    const point = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, Cesium.Cartesian3.ZERO, center);
    if (!point) { halo.hidden = true; return; }
    const R = Cesium.Ellipsoid.WGS84.maximumRadius, distance = Cesium.Cartesian3.magnitude(cam.positionWC);
    const focal = h / (2 * Math.tan(cam.frustum.fovy / 2));
    const radius = focal * R / Math.sqrt(Math.max(1, distance * distance - R * R));
    halo.style.width = `${radius * 1.1}px`;
    halo.style.transform = `translate(${point.x + radius * .74}px,${point.y - radius * .70}px) translate(-50%,-50%)`;
    halo.style.opacity = Math.min(1, (altitude - 2e6) / 3e6);
  });
  return { update(value) {
    cloudShell.show = value > .01;
    cloudMaterial.uniforms.opacity = value * .76;
  } };
}
