// Reproducible, opt-in art/performance comparisons. No storage writes or device spoofing.
export const BENCHMARK_VIEWS=Object.freeze({
  asia:{lon:105,lat:28},alps:{lon:10,lat:46},americas:{lon:-75,lat:5},
  steppe:{lon:116,lat:48},tropics:{lon:110,lat:5},desert:{lon:15,lat:24},
  birch:{lon:119.92,lat:47.19},
});
export function visualBenchmark(search='') {
  const params=new URLSearchParams(search),enabled=params.get('benchmark')==='1';
  const key=params.get('view')||'asia';
  const requested=Number(params.get('altitude'));
  return {enabled,view:enabled&&Object.hasOwn(BENCHMARK_VIEWS,key)?BENCHMARK_VIEWS[key]:null,
    altitude:enabled&&Number.isFinite(requested)&&requested>=1000&&requested<=40000000?requested:undefined,
    mobile:params.get('quality')==='mobile'};
}

export function benchmarkDetails(viewer) {
  const p=viewer.camera.positionCartographic,r=180/Math.PI;
  return {benchmark:true,benchmarkCamera:{lon:+(p.longitude*r).toFixed(6),lat:+(p.latitude*r).toFixed(6),
    height:Math.round(p.height),heading:+viewer.camera.heading.toFixed(6),pitch:+viewer.camera.pitch.toFixed(6)},
    benchmarkViewport:`${viewer.canvas.clientWidth}×${viewer.canvas.clientHeight}`};
}
