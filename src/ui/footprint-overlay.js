import {layoutFootprints} from './footprint-layout.js?v=20261026-places';
import {contractedHeight} from '../rendering/terrain-handoff.js';

// Capture one intent while a projected marker is moving beneath the finger.
// Pointer-up owns activation; its compatibility click must not activate twice.
export function bindMarkerActivation(el,{readValue,activate,onPress=()=>{},onRelease=()=>{},slop=12}) {
  let press=null,blockClick=false;
  const finish=()=>{const held=press;if(!held)return null;press=null;
    try{if(el.hasPointerCapture?.(held.id))el.releasePointerCapture(held.id);}catch{}
    onRelease();return held;};
  const cancel=()=>{if(press){blockClick=true;finish();}};
  const down=e=>{
    if(e.isPrimary===false||e.button!==0||press)return;
    blockClick=false;press={id:e.pointerId,x:e.clientX,y:e.clientY,value:readValue(),dragged:false};onPress();
    try{if(press)el.setPointerCapture?.(e.pointerId);}catch{}
  };
  const move=e=>{if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>slop)press.dragged=true;};
  const up=e=>{
    if(!press||e.pointerId!==press.id)return;move(e);blockClick=true;e.preventDefault();e.stopPropagation();
    const held=finish();if(!held.dragged&&held.value!=null&&el.isConnected!==false)activate(held.value);
  };
  const click=e=>{e.stopPropagation();if(blockClick&&(e.detail>0||e.pointerType||e.sourceCapabilities?.firesTouchEvents))return;const value=readValue();if(value!=null)activate(value);};
  const events={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,click};
  for(const [type,listener]of Object.entries(events))el.addEventListener(type,listener);
  return {cancel,dispose(){cancel();for(const [type,listener]of Object.entries(events))el.removeEventListener(type,listener);}};
}

function writeLabel(label,item) {
  label.replaceChildren();
  if(item.home){const prefix=document.createElement('em');prefix.textContent=item.home==='home'?'现居':'曾居';label.append(prefix);}
  label.append(document.createTextNode(item.label));
}
function makeMarker(container,cluster=false) {
  const el=document.createElement('button');el.type='button';el.className=cluster?'mk mk-cluster':'mk';
  el.style.visibility='hidden';el.tabIndex=-1;
  const core=document.createElement('span');core.className=cluster?'cluster-count':'mk-core';
  const label=document.createElement('span');label.className='mk-label';el.append(core,label);container.append(el);
  return {el,label,core,visible:false};
}
function show(node,visible) {
  if(node.visible===visible)return;node.visible=visible;node.el.style.visibility=visible?'visible':'hidden';
  node.el.tabIndex=visible?0:-1;node.el.setAttribute('aria-hidden',String(!visible));
}
function place(node,g,mobile=false) {
  const value=`translate3d(${g.x.toFixed(1)}px,${g.y.toFixed(1)}px,0)`;
  if(node.transform!==value){node.el.style.transform=value;node.transform=value;}
  node.el.classList.toggle('label-on',!!g.label);
  if(g.label){const hitRadius=mobile?22:node.el.classList.contains('mk-cluster')?20:15;node.label.style.left=(g.label.dx+hitRadius)+'px';node.label.style.top=(g.label.dy+hitRadius)+'px';}
}

export function createFootprintOverlay(viewer,{container,groundHeight,obstacles=()=>[],onSelect,onCluster,onCameraChange,onInteract}={}) {
  const C=Cesium,items=new Map(),clusters=new Map(),matrix=new C.Matrix4();
  const occluder=new C.EllipsoidalOccluder(C.Ellipsoid.WGS84,C.Cartesian3.ZERO);
  const scratch=new C.Cartesian3(),position=new C.Cartesian3(),windowPoint=new C.Cartesian2();
  let dirty=true,lastMix=-1,lastGroundBlend=-1,lastRatio=-1,lastRelief=false,lastWidth=0,lastHeight=0,lastUI='',previousSeeds=[],statistics={},blocked=null,blockedAt=0,blockedUI='',wasNear=false;
  const pressed=new Set();
  function wire(node,readValue,activate){node.activation=bindMarkerActivation(node.el,{readValue,activate,
    onPress:()=>{pressed.add(node);onInteract?.();},onRelease:()=>{pressed.delete(node);dirty=true;viewer.scene.requestRender();}});}
  return {
    setItems(data) {
      for(const node of pressed)node.activation.cancel();
      const wanted=new Set(data.map(d=>d.id));
      for(const [id,m]of items)if(!wanted.has(id)){m.activation?.dispose();m.el.remove();items.delete(id);}
      for(const item of data) {
        let m=items.get(item.id);
        if(!m){m=makeMarker(container);items.set(item.id,m);wire(m,()=>m.item?.id,id=>onSelect?.(id));}
        if(m.item?.lon!==item.lon||m.item?.lat!==item.lat){m.globalPos=undefined;m.globalHeight=undefined;}
        m.item=item;
        const text=`${item.home||''}:${item.label}`;
        if(m.text!==text){writeLabel(m.label,item);m.text=text;m.measure=true;}
        m.el.setAttribute('aria-label',`${item.label}${item.home?'，'+(item.home==='home'?'现居':'曾居'):''}，查看足迹`);
        m.el.title=item.fullName||item.label;
        m.el.style.setProperty('--c',item.color);m.el.classList.toggle('home',item.home==='home');m.el.classList.toggle('past',item.home==='past');
        m.el.classList.toggle('sel',item.selected);m.el.classList.toggle('dim',item.dim);
      }
      dirty=true;viewer.scene.requestRender();
    },
    invalidate(){dirty=true;viewer.scene.requestRender();},
    update() {
      if(pressed.size){dirty=true;return;}
      const camera=viewer.camera,width=viewer.canvas.clientWidth,height=viewer.canvas.clientHeight;
      const resized=width!==lastWidth||height!==lastHeight;
      const mix=+(viewer.canvas.dataset.earthMix||0),relief=viewer.canvas.dataset.worldRelief==='true',ui=document.body.className.replace(/(^| )near( |$)/,' ').trim();
      const groundBlend=+(viewer.canvas.dataset.worldGroundBlend||0),ratio=+(viewer.canvas.dataset.worldNativeReliefRatio||1.65/30);
      const moved=!C.Matrix4.equals(camera.viewMatrix,matrix);
      if(!dirty&&!moved&&mix===lastMix&&groundBlend===lastGroundBlend&&ratio===lastRatio&&relief===lastRelief&&width===lastWidth&&height===lastHeight&&ui===lastUI)return;
      if(moved)onCameraChange?.();
      dirty=false;lastMix=mix;lastRelief=relief;lastWidth=width;lastHeight=height;lastUI=ui;C.Matrix4.clone(camera.viewMatrix,matrix);
      lastGroundBlend=groundBlend;lastRatio=ratio;
      occluder.cameraPosition=camera.positionWC;
      const projected=[],toWindow=C.SceneTransforms.worldToWindowCoordinates||C.SceneTransforms.wgs84ToWindowCoordinates;
      // These dimensions change only with text, not on every moving frame.
      for(const m of items.values())if(m.measure||resized){m.labelWidth=m.label.offsetWidth;m.labelHeight=m.label.offsetHeight;m.measure=false;}
      for(const m of items.values()) {
        const d=m.item;if(!d.active)continue;
        if(relief&&(!m.globalPos||m.groundBlend!==groundBlend||m.ratio!==ratio)) {
          m.globalHeight??=groundHeight(d.lon,d.lat);
          m.globalPos=C.Cartesian3.fromDegrees(d.lon,d.lat,contractedHeight(m.globalHeight,groundBlend,ratio)+18000);
          m.groundBlend=groundBlend;m.ratio=ratio;
        }
        const p=m.globalPos?C.Cartesian3.lerp(d.position,m.globalPos,mix,position):d.position;
        if(!occluder.isPointVisible(p)||C.Cartesian3.dot(camera.directionWC,C.Cartesian3.subtract(p,camera.positionWC,scratch))<=0)continue;
        const w=toWindow(viewer.scene,p,windowPoint);
        if(!w||w.x<0||w.x>width||w.y<0||w.y>height)continue;
        projected.push({id:d.id,x:w.x,y:w.y,priority:d.priority,labelWidth:m.labelWidth,labelHeight:m.labelHeight});
      }
      // Panel rectangles force layout; while the camera moves they are re-read only when the
      // UI state or size changes, or every 500 ms to follow panel transitions.
      const now=performance.now();
      if(!blocked||ui!==blockedUI||resized||now-blockedAt>500){blocked=obstacles().filter(Boolean).map(el=>{const r=el.getBoundingClientRect();return {left:r.left-6,right:r.right+6,top:r.top-6,bottom:r.bottom+6};});blockedAt=now;blockedUI=ui;}
      // Hysteresis keeps the body class from flipping (and restyling the page) at the threshold.
      const altitude=camera.positionCartographic.height,near=wasNear?altitude<2000000:altitude<1800000;wasNear=near;const mobile=width<=720;
      const groups=layoutFootprints(projected,{width,height,obstacles:blocked,radius:mobile?38:42,previousSeeds,labelLimit:mobile?(near?6:4):(near?10:6)});
      previousSeeds=groups.map(g=>g.key);
      // Batch projection/layout reads before visibility and transform writes.
      for(const m of items.values())m.nextVisible=false;
      for(const m of clusters.values())m.nextVisible=false;
      const used=new Set();
      for(const g of groups) {
        const seed=items.get(g.key);
        if(g.members.length===1){seed.nextVisible=true;place(seed,g,mobile);continue;}
        used.add(g.key);let cluster=clusters.get(g.key);
        if(!cluster){
          cluster=makeMarker(container,true);clusters.set(g.key,cluster);
          wire(cluster,()=>cluster.group?{ids:cluster.group.members.map(p=>p.id),anchor:{x:cluster.group.x,y:cluster.group.y}}:null,
            value=>onCluster?.(value.ids,value.anchor,cluster.el));
          cluster.el.setAttribute('aria-haspopup','dialog');cluster.el.setAttribute('aria-controls','map-chooser');
        }
        cluster.group=g;
        if(cluster.count!==g.members.length){
          cluster.count=g.members.length;cluster.core.textContent=g.members.length;
          cluster.el.setAttribute('aria-label',`附近 ${g.members.length} 个地点，查看地点列表`);
        }
        const d=seed.item;
        if(cluster.text!==seed.text){writeLabel(cluster.label,d);cluster.text=seed.text;}
        cluster.el.style.setProperty('--c',d.color);
        cluster.el.classList.toggle('home',!!d.home);cluster.el.classList.toggle('sel',g.members.some(p=>items.get(p.id).item.selected));
        cluster.el.classList.toggle('dim',g.members.every(p=>items.get(p.id).item.dim));
        const title=`${d.label}附近 · ${g.members.length} 个地点`;
        if(cluster.title!==title){cluster.el.title=title;cluster.title=title;}
        cluster.nextVisible=true;place(cluster,g,mobile);
      }
      for(const [key,node]of clusters)if(!used.has(key)){node.activation.dispose();node.el.remove();clusters.delete(key);}
      for(const node of items.values())show(node,!!node.nextVisible);
      for(const node of clusters.values())show(node,!!node.nextVisible);
      document.body.classList.toggle('near',near);
      statistics={markerPlaces:items.size,markerProjected:projected.length,markerGroups:groups.length,markerClusters:groups.filter(g=>g.members.length>1).length,markerLabels:groups.filter(g=>g.label).length};
      for(const [key,value]of Object.entries(statistics))if(container.dataset[key]!==String(value))container.dataset[key]=value;
    },
    details:()=>statistics,
    dispose(){for(const node of [...items.values(),...clusters.values()])node.activation.dispose();container.replaceChildren();items.clear();clusters.clear();pressed.clear();}
  };
}
