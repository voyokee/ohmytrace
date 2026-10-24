import {random} from './world-data.js';
function mistImage() {
  const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
  x.scale(1,.25);const g=x.createRadialGradient(128,128,4,128,128,124);
  g.addColorStop(0,'rgba(219,238,235,.38)');g.addColorStop(.55,'rgba(220,238,237,.16)');g.addColorStop(1,'rgba(221,241,244,0)');
  x.fillStyle=g;x.fillRect(0,0,256,256);return c;
}
function particleImage(kind) {
  const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');
  if(kind==='petal'){x.fillStyle='#ffb6cc';x.beginPath();x.ellipse(16,16,6,11,.5,0,Math.PI*2);x.fill();}
  else {const g=x.createRadialGradient(16,16,0,16,16,14);g.addColorStop(0,kind==='firefly'?'#fff5a6':'#ffffff');
    g.addColorStop(.25,kind==='firefly'?'#d4ec81cc':'#e8f0ecaa');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,32,32);}
  return c;
}
export class EffectManager {
  constructor(viewer,{constrained=false,reducedMotion=false}={}){this.viewer=viewer;this.constrained=constrained;this.reducedMotion=reducedMotion;}
  enter(config,plants=[]) {
    this.exit();this.config=config;this.phase=0;this.last=0;
    const {template,lon,lat,height=0}=config;
    this.frame=Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lon,lat,height));
    this.mist=new Cesium.BillboardCollection({scene:this.viewer.scene,blendOption:Cesium.BlendOption.TRANSLUCENT});
    this.particles=new Cesium.BillboardCollection({scene:this.viewer.scene,blendOption:Cesium.BlendOption.TRANSLUCENT});
    this.viewer.scene.primitives.add(this.mist);this.viewer.scene.primitives.add(this.particles);
    const rnd=random(1843+Math.round(lon*10)),image=mistImage();this.dynamic=[];this.scratch=new Cesium.Cartesian3();this.local=new Cesium.Cartesian3();
    for(let i=0;i<template.mist;i++) {
      const plant=plants[Math.floor(i/Math.max(1,template.mist)*plants.length)];
      const p=plant?Cesium.Cartesian3.fromDegrees(plant.lon,plant.lat,plant.ground*(config.exaggeration||1)+45):this.offset((rnd()-.5)*2500,(rnd()-.5)*2500,70);
      this.mist.add({position:p,image,width:900+rnd()*1100,height:90+rnd()*100,sizeInMeters:true,
        color:Cesium.Color.WHITE.withAlpha(.38),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,15000)});
    }
    if(template.particles) {
      const image=particleImage(template.particles),count=this.constrained?18:40;
      for(let i=0;i<count;i++) {
        const point={x:(rnd()-.5)*1400,y:(rnd()-.5)*1400,z:40+rnd()*240,speed:5+rnd()*12,phase:rnd()*6.28};
        point.sprite=this.particles.add({position:this.offset(point.x,point.y,point.z),image,
          width:template.particles==='snow'?3:template.particles==='petal'?4:5,height:4,sizeInMeters:true,
          color:Cesium.Color.WHITE.withAlpha(.6),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,4000)});
        this.dynamic.push(point);
      }
    }
  }
  offset(x,y,z) {return Cesium.Matrix4.multiplyByPoint(this.frame,new Cesium.Cartesian3(x,y,z),new Cesium.Cartesian3());}
  update(now,day=1) {
    if(!this.config||now-this.last<1000/15)return;const dt=Math.min(.12,(now-this.last)/1000);this.last=now;
    if(this.reducedMotion)return;
    const kind=this.config.template.particles;
    for(const p of this.dynamic) {
      p.x+=p.speed*dt;p.z+=(kind==='snow'||kind==='petal'?-p.speed:Math.sin(now*.0007+p.phase)*3)*dt;
      if(p.x>700)p.x=-700;if(p.z<15)p.z=260;
      this.local.x=p.x;this.local.y=p.y+Math.sin(now*.0005+p.phase)*15;this.local.z=p.z;
      Cesium.Matrix4.multiplyByPoint(this.frame,this.local,this.scratch);
      p.sprite.position=this.scratch;
      if(kind==='firefly')p.sprite.color=Cesium.Color.WHITE.withAlpha((.3+.3*Math.sin(now*.001+p.phase))*(1-day*.65));
    }
  }
  details(){return {mist:this.mist?.length||0,particles:this.particles?.length||0};}
  toggle(){if(this.mist)this.mist.show=!this.mist.show;if(this.particles)this.particles.show=!this.particles.show;}
  exit(){if(this.mist)this.viewer.scene.primitives.remove(this.mist);if(this.particles)this.viewer.scene.primitives.remove(this.particles);
    this.mist=this.particles=undefined;this.dynamic=[];this.config=undefined;}
  dispose(){this.exit();}
}
