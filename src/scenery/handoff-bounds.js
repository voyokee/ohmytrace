// Cesium 1.120 rebuilds primitive/derived-command bounds when colour changes render pass.
// Pad every rebuild as well as the ready model; moving roots stay inside conservative
// bounds while the engine's normal frustum/distance culling and chunk budgets remain active.
const installed=new WeakMap();
export function installHandoffBounds(model,padding) {
  if(installed.has(model))return installed.get(model);
  if(!padding)return {setActive(){}};
  const graph=model._sceneGraph;
  if(Cesium.VERSION!=='1.120'||!graph||typeof graph.buildDrawCommands!=='function')
    throw new Error('Unsupported model bounds for terrain handoff');
  let active=true,bases,baseRadius;
  function capture() {
    const spheres=new Set([graph.boundingSphere,model._boundingSphere]);
    for(const node of graph._runtimeNodes)for(const primitive of node?.runtimePrimitives||[]) {
      spheres.add(primitive.boundingSphere);spheres.add(primitive.drawCommand?.boundingVolume);
    }
    bases=[...spheres].filter(s=>s&&Number.isFinite(s.radius)).map(s=>[s,s.radius]);
    baseRadius=model._initialRadius;
  }
  function apply() {
    for(const [sphere,radius] of bases)sphere.radius=radius+(active?padding:0);
    model._initialRadius=baseRadius+(active?padding:0);
  }
  const original=graph.buildDrawCommands;
  graph.buildDrawCommands=function(...args){const result=original.apply(this,args);capture();apply();return result;};
  const control={setActive(value){if(active===value)return;active=value;apply();}};
  installed.set(model,control);capture();apply();return control;
}
