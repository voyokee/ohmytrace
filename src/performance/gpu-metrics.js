import {profileGl} from './profile-gl.js';
import {createDrawStatistics} from './draw-statistics.js';
// Opt-in diagnostics only. Queries are bounded and read back after the GPU has finished.
export function attachGpuMetrics(viewer) {
  const gl=viewer.canvas.getContext('webgl2')||viewer.canvas.getContext('webgl');
  const debug=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=gl?gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER):'unavailable';
  const ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  const cpu=profileGl(gl,viewer.scene),removeFrame=viewer.scene.postRender.addEventListener(()=>cpu.frame());
  const draw=gl&&new URLSearchParams(location.search).has('profilegpu')?createDrawStatistics(gl,viewer.scene):null;
  let active,elapsed=null,frame=0;const pending=[];
  if(!ext||!gl.createQuery)return {details:()=>({gpuMs:null,gpuRenderer:renderer,...cpu.details(),...draw?.details()}),dispose(){draw?.dispose();removeFrame();cpu.dispose();}};
  const removeBefore=viewer.scene.preRender.addEventListener(()=>{
    if(++frame%12)return;
    if(gl.isContextLost()||active)return;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      pending.splice(0).forEach(q=>gl.deleteQuery(q));elapsed=null;return;
    }
    while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)) {
      const q=pending.shift();elapsed=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);
    }
    if(pending.length<3&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)) {
      active=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,active);
    }
  });
  const removeAfter=viewer.scene.postRender.addEventListener(()=>{
    if(!active)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=undefined;
  });
  return {
    details:()=>({gpuMs:elapsed===null?null:+elapsed.toFixed(2),gpuRenderer:renderer,...cpu.details(),...draw?.details()}),
    dispose(){removeBefore();removeAfter();draw?.dispose();removeFrame();cpu.dispose();if(active)gl.endQuery(ext.TIME_ELAPSED_EXT);
      if(active)gl.deleteQuery(active);pending.forEach(q=>gl.deleteQuery(q));},
  };
}
