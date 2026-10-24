// Opt-in, local diagnostics. No telemetry leaves the browser.
export function attachFrameMetrics(viewer, details = () => ({}), actions = []) {
  if (!new URLSearchParams(location.search).has('perf')) return;
  const panel = document.createElement('pre');
  panel.id = 'performance-metrics';
  panel.setAttribute('aria-label', '渲染性能');
  panel.style.cssText = 'position:fixed;right:16px;top:84px;z-index:30;margin:0;padding:12px;' +
    'background:#07111eee;color:#bde8cf;border:1px solid #345;pointer-events:none;font:12px/1.5 monospace';
  document.body.append(panel);
  const controls = document.createElement('div');
  controls.style.cssText = 'position:fixed;right:16px;bottom:120px;max-width:calc(100vw - 32px);z-index:31;display:flex;flex-wrap:wrap;gap:6px';
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.style.cssText = 'padding:6px;background:#162638;color:#fff;border:1px solid #567;border-radius:5px';
    button.onclick = () => { action.run(); viewer.scene.requestRender(); };
    controls.append(button);
  }
  document.body.append(controls);
  let frames = [], count = 0, last = 0, start = performance.now(), longTasks = 0;
  const history = [];
  let observer;
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver(list => { longTasks += list.getEntries().length; });
    observer.observe({ type: 'longtask', buffered: false });
  }
  const remove = viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (last && now - last < 250) frames.push(now - last);
    count++;
    last = now;
  });
  const timer = setInterval(() => {
    const now = performance.now();
    const sorted = frames.slice().sort((a, b) => a - b);
    const snapshot = {
      fps: +(count * 1000 / (now - start)).toFixed(1),
      p95FrameMs: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
      longTasks,
      renderPixels: `${viewer.canvas.width}×${viewer.canvas.height}`,
      ...details(),
    };
    panel.textContent = JSON.stringify(snapshot, null, 2);
    history.push(snapshot);
    if (history.length > 60) history.shift();
    panel.dataset.samples = JSON.stringify(history);
    frames = []; count = 0; longTasks = 0; start = now;
  }, 2000);
  return () => { clearInterval(timer); remove(); observer?.disconnect(); panel.remove(); controls.remove(); };
}
