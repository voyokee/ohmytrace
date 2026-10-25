export function createRenderPolicy(viewer, { mobile, reducedMotion, benchmark=false }) {
  const scene = viewer.scene;
  const targetFps = mobile ? 30 : 60;
  const maxScale = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5);
  const minScale = Math.min(maxScale, mobile ? 0.75 : 0.85);
  const stillScale = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  let scale = Math.min(window.devicePixelRatio || 1, maxScale);
  let still = false, near = false;
  let samples = [], costs = [], lastFrame = 0, lastChange = performance.now(), goodWindows = 0;
  let wasRunning = true;
  let tickOrigin, lastSlot = 0;
  const applyScale = () => {
    const pixels = benchmark?1:still ? stillScale : scale;
    viewer.resolutionScale = pixels / (window.devicePixelRatio || 1);
    // Supersampled stills already smooth the silhouette; FXAA also softens mountain/coast detail.
    if (scene.postProcessStages?.fxaa) scene.postProcessStages.fxaa.enabled = !near && (!still || pixels < 1.5);
    if (scene.globe) scene.globe.maximumScreenSpaceError = still ? 2 : mobile ? (scale < 0.9 ? 6 : 4) : (scale < 1 ? 3 : 2);
    scene.requestRender();
  };
  // Let RAF deliver input promptly; throttle optional animation, not Cesium's whole update loop.
  viewer.targetFrameRate = undefined;
  scene.requestRenderMode = true;
  scene.maximumRenderTimeChange = Infinity;
  applyScale();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasRunning = viewer.useDefaultRenderLoop;
      viewer.useDefaultRenderLoop = false;
    } else if (wasRunning) {
      lastFrame = 0; samples = []; costs = [];
      viewer.useDefaultRenderLoop = true;
      scene.requestRender();
    }
  });
  window.addEventListener('resize', applyScale);
  return {
    reducedMotion,
    near(value){if(near===value)return;near=value;applyScale();},
    still(value) {
      if (still === value) return;
      still = value;
      applyScale();
    },
    home() {
      still = false;
      scale = maxScale;
      samples = []; costs = []; lastFrame = 0; goodWindows = 0; lastChange = performance.now();
      applyScale();
    },
    tick(now) {
      // The document timeline shares RAF's timestamp, unaffected by CPU work before preUpdate.
      // https://www.w3.org/TR/web-animations-1/#document-timelines
      const stamp=document.timeline?.currentTime,clock=Number.isFinite(stamp)?stamp:now;
      const interval=1000/targetFps;
      // Anchor to an observed update rather than the document's arbitrary zero phase.
      // A quarter-slot allowance keeps 1–3 ms RAF jitter away from the acceptance edge;
      // otherwise a 30 Hz schedule can alternate 50/16 ms while still averaging 30 FPS.
      if(tickOrigin===undefined){tickOrigin=clock;return true;}
      const slot=Math.floor((clock-tickOrigin+interval*.25)/interval);
      if(slot<=lastSlot)return false;
      // Skip missed slots after a long task; never render a burst to catch up.
      lastSlot=slot;
      return true;
    },
    // Only sample during continuous animation. An intentional idle gap is not a slow frame.
    frame(now, active, drawMs = Infinity) {
      if (benchmark || !active) { lastFrame = 0; samples = []; costs = []; return; }
      if (lastFrame && now - lastFrame < 250) samples.push(now - lastFrame);
      costs.push(drawMs);
      lastFrame = now;
      if (samples.length < targetFps * 3) return;
      const sorted = samples.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const drawMedian = costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)];
      samples = []; costs = [];
      if (now - lastChange < 8000) return;
      if (median > 1000 / targetFps * 1.3 && scale > minScale) {
        scale = Math.max(minScale, +(scale - 0.15).toFixed(2));
        goodWindows = 0; lastChange = now; applyScale();
      } else if (median < 1000 / targetFps * 1.08 && drawMedian < 1000 / targetFps * .35 && scale < maxScale) {
        if (++goodWindows >= 4) {
          scale = Math.min(maxScale, +(scale + 0.1).toFixed(2));
          goodWindows = 0; lastChange = now; applyScale();
        }
      } else goodWindows = 0;
    },
    details: () => ({ targetFps, pixelRatio: +(benchmark?1:still ? stillScale : scale).toFixed(2),
      quality: still ? 'still' : 'motion', terrainError: scene.globe?.maximumScreenSpaceError,
      cadenceClock:Number.isFinite(document.timeline?.currentTime)?'animation':'performance' }),
  };
}
