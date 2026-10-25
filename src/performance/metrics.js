import {attachGpuMetrics} from './gpu-metrics.js?v=20261025-groves';
// Opt-in, local diagnostics. No telemetry leaves the browser.
export function attachFrameMetrics(viewer, details = () => ({}), actions = []) {
  if (!new URLSearchParams(location.search).has('perf')) return;
  const gpu=attachGpuMetrics(viewer);
  const shell=document.createElement('details'),summary=document.createElement('summary');
  shell.id='performance-panel';shell.open=new URLSearchParams(location.search).has('profile');
  shell.style.cssText='position:fixed;right:16px;top:84px;z-index:30;max-width:min(360px,calc(100vw - 32px));'+
    'background:#07111eee;color:#bde8cf;border:1px solid #345;border-radius:8px;font:11px/1.45 monospace';
  summary.style.cssText='padding:9px 12px;cursor:pointer';summary.textContent='渲染性能 · 采样中';shell.append(summary);
  const panel = document.createElement('pre');
  panel.id = 'performance-metrics';
  panel.setAttribute('aria-label', '渲染性能');
  panel.style.cssText = 'margin:0;padding:0 12px 12px;font:inherit;max-height:calc(100vh - 265px);overflow:auto;white-space:pre-wrap';
  shell.append(panel);document.body.append(shell);
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
  const syncControls=()=>{controls.style.display=shell.open?'flex':'none';};
  shell.addEventListener('toggle',syncControls);syncControls();
  let frames = [], count = 0, last = 0, start = performance.now(), longTasks = 0;
  const history = [];
  const tracing=new URLSearchParams(location.search).has('trace'),updates=[];
  const removeUpdates=tracing?viewer.scene.preUpdate.addEventListener(()=>{
    updates.push({cpu:performance.now(),raf:document.timeline?.currentTime});
    if(updates.length>240)updates.shift();
  }):()=>{};
  let observer;
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    observer = new PerformanceObserver(list => { longTasks += list.getEntries().length; });
    observer.observe({ type: 'longtask', buffered: false });
  }
  const remove = viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if(tracing&&updates.length)updates[updates.length-1].render=now;
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
      ...gpu.details(),
      ...details(),
    };
    panel.textContent = JSON.stringify(snapshot, null, 2);
    summary.textContent=`${snapshot.fps?snapshot.fps+' FPS':'静止 · 按需渲染'} · ${snapshot.renderPixels} · ${snapshot.instances||snapshot.worldTrees||0} 植物`;
    history.push(snapshot);
    if (history.length > 60) history.shift();
    panel.dataset.samples = JSON.stringify(history);
    if(tracing)panel.dataset.frameTrace=JSON.stringify(updates);
    frames = []; count = 0; longTasks = 0; start = now;
  }, 2000);
  return () => { clearInterval(timer); remove();removeUpdates();gpu.dispose();observer?.disconnect(); shell.remove(); controls.remove(); };
}
