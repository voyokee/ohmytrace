// Opt-in counts from commands actually submitted. No pixels/buffers are read. Metal's per-draw
// elapsed queries were not additive on the tested driver, so only the existing frame timer is used.
export function createDrawStatistics(gl,scene) {
  const originals=[],programs=new WeakMap(),totals=new Map();let frames=0,programId=0;
  function describe(program) {
    if(!program)return 'unknown';if(programs.has(program))return programs.get(program);
    const shaders=(gl.getAttachedShaders(program)||[]).map(s=>({type:gl.getShaderParameter(s,gl.SHADER_TYPE),source:gl.getShaderSource(s)||''}));
    const source=shaders.map(s=>s.source).join('\n');
    const name=source.includes('fpFocusEC')?'terrain-daylight':source.includes('fpDark')?'terrain-footprint':
      source.includes('u_autumn')?'vegetation':source.includes('u_dayTextures')?'terrain-imagery':
      source.includes('cloudCover')?'world-earth':source.includes('u_atlas')?'billboards':`other-${++programId}`;
    programs.set(program,name);return name;
  }
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
    const original=gl[name];if(typeof original!=='function')continue;originals.push({name,original});
    gl[name]=function(...args){const label=describe(gl.getParameter(gl.CURRENT_PROGRAM));
      const count=args[name.includes('Elements')?1:2],instances=name.endsWith('Instanced')?args[name.includes('Elements')?4:3]:1;
      const triangles=(args[0]===gl.TRIANGLES?count/3:args[0]===gl.TRIANGLE_STRIP?Math.max(0,count-2):0)*instances;
      const value=totals.get(label)||{draws:0,triangles:0};value.draws++;value.triangles+=triangles;totals.set(label,value);
      return original.apply(this,args);};
  }
  const remove=scene.postRender.addEventListener(()=>frames++);
  return {
    details(){const n=Math.max(1,frames),out={gpuDrawCounts:Object.fromEntries([...totals].map(([k,v])=>[k,+(v.draws/n).toFixed(1)])),
      gpuTriangles:Object.fromEntries([...totals].map(([k,v])=>[k,Math.round(v.triangles/n)]))};
      totals.clear();frames=0;return out;},
    dispose(){remove();for(const {name,original}of originals)gl[name]=original;},
  };
}
