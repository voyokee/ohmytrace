// Original code-authored, opaque 3D assets. Z is up; every tree is one metre tall before instancing.
export const SPECIES = ['spruce', 'broadleaf', 'birch', 'tropical', 'shrub', 'sakura', 'grass'];
const palettes = { spruce: [0.24,0.43,0.20], broadleaf: [0.40,0.54,0.22], birch: [0.54,0.63,0.29],
  tropical: [0.22,0.47,0.26], shrub: [0.43,0.51,0.23], sakura: [0.96,0.68,0.76], grass: [0.55,0.63,0.27] };
const add = (a,b) => a.map((x,i)=>x+b[i]);
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function assetMesh(kind, low) {
  const positions=[],normals=[],colors=[],indices=[];
  const tri=(a,b,c,color,smooth) => {
    const n=cross(sub(b,a),sub(c,a)), length=Math.hypot(...n)||1, base=positions.length/3;
    for(const p of [a,b,c]) { positions.push(...p);
      const normal=smooth?smooth(p):n.map(x=>x/length);normals.push(...normal);
      // glTF vertex colours are linear. Authoring sRGB directly made the old crowns chalky.
      const f=0.68+Math.max(0,p[2])*0.40;
      colors.push(...color.map(x=>Math.pow(Math.min(1,x*f),2.2))); }
    indices.push(base,base+1,base+2);
  };
  const cone=(center,radius,height,color,sides=low?5:7,topRadius=0) => {
    for(let i=0;i<sides;i++) {
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      const ripple=1+.12*Math.sin(i*2.39+center[2]*31), next=1+.12*Math.sin((i+1)*2.39+center[2]*31);
      const p=add(center,[Math.cos(a)*radius*ripple,Math.sin(a)*radius*ripple,0]);
      const q=add(center,[Math.cos(b)*radius*next,Math.sin(b)*radius*next,0]);
      const t=add(center,[Math.cos(a)*topRadius,Math.sin(a)*topRadius,height]);
      tri(p,q,t,color);
      if(topRadius) tri(q,add(center,[Math.cos(b)*topRadius,Math.sin(b)*topRadius,height]),t,color);
      tri(center,q,p,color);
    }
  };
  const crown=(center,radii,color) => {
    const sides=low?5:8, levels=low?3:4;
    const normal=p=>{const d=sub(p,center).map((x,i)=>x/(radii[i]*radii[i])),l=Math.hypot(...d)||1;return d.map(x=>x/l);};
    const point=(j,i) => {const a=i/sides*Math.PI*2,b=j/levels*Math.PI;
      return add(center,[Math.sin(b)*Math.cos(a)*radii[0],Math.sin(b)*Math.sin(a)*radii[1],Math.cos(b)*radii[2]]);};
    for(let j=0;j<levels;j++)for(let i=0;i<sides;i++) {
      const p=point(j,i),q=point(j+1,i),r=point(j+1,i+1),s=point(j,i+1);
      if(j<levels-1)tri(p,q,r,color,normal);
      if(j>0)tri(p,r,s,color,normal);
    }
  };
  const leaf=palettes[kind];
  if(kind==='grass') {
    const blades=low?19:42;
    for(let i=0;i<blades;i++) {const a=i*2.399, radius=4*Math.sqrt((i+.5)/blades),x=Math.cos(a)*radius,y=Math.sin(a)*radius;
      const h=.5+(i%4)*.15,tint=leaf.map(v=>v*(.84+(i%5)*.055));
      tri([x-.055,y,0],[x+.055,y,0],[x+.22,y+.05,h],tint);
      tri([x+.055,y+.005,0],[x-.055,y+.005,0],[x+.22,y+.055,h],tint);}
  } else {
    const bark=kind==='birch'?[.82,.80,.66]:[.29,.20,.11];
    cone([0,0,0],kind==='birch'?.022:.029,.82,bark,low?4:6,.012);
    if(kind==='spruce') {
      const tiers=low?4:8;
      for(let j=0;j<tiers;j++) {const t=j/tiers;
        cone([Math.sin(j*2.4)*.012,Math.cos(j*2.4)*.012,.15+t*.72],.27*Math.pow(1-t,.78),.25-t*.12,
          leaf.map((x,i)=>x*(.79+t*.34)+(i===0?t*.035:0)),low?7:10);}
      cone([0,0,.83],.07,.17,leaf.map(x=>x*1.12),low?5:7);
    } else if(kind==='tropical') {
      crown([0,0,.75],[.40,.35,.25],leaf);
      for(let i=0;i<(low?2:5);i++){const a=i*2.399; crown([Math.cos(a)*.25,Math.sin(a)*.25,.63+(i%2)*.08],[.23,.21,.19],leaf.map(x=>x*(.83+i*.05)));}
    } else if(kind==='birch') {
      crown([0,0,.75],[.18,.16,.25],leaf);
      for(let i=0;i<(low?2:5);i++){const a=i*2.399;crown([Math.cos(a)*.12,Math.sin(a)*.12,.42+i*.065],[.16,.13,.19],leaf.map(x=>x*(.84+i*.045)));}
      if(!low)for(let i=0;i<4;i++)cone([0,0,.12+i*.12],.036,.014,[.14,.15,.13],6,.034);
    } else if(kind==='shrub') {
      crown([0,0,.25],[.38,.31,.25],leaf);
    } else {
      crown([0,0,.76],[.26,.24,.24],leaf);
      for(let i=0;i<(low?3:6);i++){const a=i*2.399;
        crown([Math.cos(a)*.23,Math.sin(a)*.23,.52+(i%3)*.085],[.21,.19,.20],leaf.map(x=>x*(.80+i*.045)));}
    }
  }
  const texcoords=new Float32Array(positions.length/3*2);
  for(let i=0;i<positions.length/3;i++){texcoords[i*2]=Math.max(0,positions[i*3+2]);texcoords[i*2+1]=positions[i*3];}
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),colors:new Float32Array(colors),texcoords,indices:new Uint16Array(indices)};
}
export function encodeGlb(json, bin) {
  const text=new TextEncoder().encode(JSON.stringify(json)), jsonLength=Math.ceil(text.length/4)*4, binLength=Math.ceil(bin.length/4)*4;
  const bytes=new Uint8Array(28+jsonLength+binLength), view=new DataView(bytes.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.length,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);
  bytes.fill(32,20,20+jsonLength);bytes.set(text,20);
  view.setUint32(20+jsonLength,binLength,true);view.setUint32(24+jsonLength,0x004e4942,true);bytes.set(bin,28+jsonLength);
  return bytes;
}
export function decodeGlb(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), size=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+size)));
  const binSize=view.getUint32(20+size,true);
  return {json,bin:bytes.subarray(28+size,28+size+binSize)};
}
function writer(json, initial=new Uint8Array()) {
  const parts=[initial];let length=Math.ceil(initial.length/4)*4;
  return {
    accessor(data,type,componentType,target) {
      const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type], index=json.accessors.length;
      json.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.byteLength,...(target?{target}:{})});
      const accessor={bufferView:json.bufferViews.length-1,componentType,count:data.length/components,type};
      if(type==='VEC3') {accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<data.length;i++) {const k=i%3;accessor.min[k]=Math.min(accessor.min[k],data[i]);accessor.max[k]=Math.max(accessor.max[k],data[i]);}}
      json.accessors.push(accessor);parts.push({offset:length,data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength)});
      length+=Math.ceil(data.byteLength/4)*4;return index;
    },
    finish() {const bytes=new Uint8Array(length);bytes.set(initial);for(const part of parts.slice(1))bytes.set(part.data,part.offset);
      json.buffers=[{byteLength:length}];return encodeGlb(json,bytes);}
  };
}
export function makeVegetationLibrary(low=false) {
  const json={asset:{version:'2.0',generator:'ohmytrace procedural vegetation'},scene:0,scenes:[{nodes:[]}],
    nodes:[],meshes:[],accessors:[],bufferViews:[],materials:[{name:'Matte foliage and bark',doubleSided:false,
      pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}}]};
  const out=writer(json);
  for(const kind of SPECIES) {
    const mesh=assetMesh(kind,low);
    json.meshes.push({name:kind,primitives:[{attributes:{POSITION:out.accessor(mesh.positions,'VEC3',5126,34962),
      NORMAL:out.accessor(mesh.normals,'VEC3',5126,34962),COLOR_0:out.accessor(mesh.colors,'VEC3',5126,34962),
      TEXCOORD_0:out.accessor(mesh.texcoords,'VEC2',5126,34962)},
      indices:out.accessor(mesh.indices,'SCALAR',5123,34963),material:0}]});
    json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({mesh:json.meshes.length-1,name:kind,translation:[json.nodes.length*1.1,0,0]});
  }
  return out.finish();
}
export function instantiateVegetation(library, groups) {
  const {json,bin}=decodeGlb(library);json.nodes=[];json.scenes=[{nodes:[]}];json.scene=0;
  json.extensionsUsed=['EXT_mesh_gpu_instancing'];json.extensionsRequired=['EXT_mesh_gpu_instancing'];
  const out=writer(json,bin);
  for(const group of groups) {
    if(!group.translations.length)continue;
    const mesh=json.meshes.findIndex(m=>m.name===group.species);
    if(mesh<0)throw new Error('Unknown vegetation species: '+group.species);
    const attributes={TRANSLATION:out.accessor(group.translations,'VEC3',5126),
      ROTATION:out.accessor(group.rotations,'VEC4',5126),SCALE:out.accessor(group.scales,'VEC3',5126)};
    json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({mesh,name:group.species,extensions:{EXT_mesh_gpu_instancing:{attributes}}});
  }
  return out.finish();
}
