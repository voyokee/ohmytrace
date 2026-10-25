// Original code-authored, opaque 3D assets. Z is up; every tree is one metre tall before instancing.
export const SPECIES = ['spruce', 'broadleaf', 'birch', 'tropical', 'shrub', 'sakura', 'grass'];
const palettes = { spruce: [0.24,0.43,0.20], broadleaf: [0.36,0.53,0.20], birch: [0.51,0.62,0.26],
  tropical: [0.20,0.45,0.23], shrub: [0.43,0.51,0.23], sakura: [0.96,0.68,0.76], grass: [0.55,0.63,0.27] };
const add = (a,b) => a.map((x,i)=>x+b[i]);
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function assetMesh(kind, low) {
  const positions=[],normals=[],colors=[],indices=[],canopy=[];
  const flexibility={spruce:.18,broadleaf:1,birch:.55,tropical:1,shrub:.65,sakura:.85,grass:0}[kind];
  const tri=(a,b,c,color,smooth,foliage=false,facets=0) => {
    const n=cross(sub(b,a),sub(c,a)), length=Math.hypot(...n)||1, base=positions.length/3;
    for(const p of [a,b,c]) { positions.push(...p);
      let normal=smooth?smooth(p):n.map(x=>x/length);
      if(facets){normal=normal.map((v,i)=>v*(1-facets)+n[i]/length*facets);
        const l=Math.hypot(...normal)||1;normal=normal.map(v=>v/l);}
      normals.push(...normal);
      // glTF vertex colours are linear. Authoring sRGB directly made the old crowns chalky.
      const fleck=.94+.06*Math.sin(p[0]*139+p[1]*173+p[2]*97);
      const ambient=foliage ? .66+.34*Math.sqrt(Math.max(0,.5+.5*normal[2])) : 1;
      const f=(0.58+Math.sqrt(Math.max(0,p[2]))*0.50)*fleck*ambient;
      canopy.push(flexibility,foliage?1:0);
      colors.push(...color.map(x=>Math.pow(Math.min(1,x*f),2.2))); }
    indices.push(base,base+1,base+2);
  };
  const cone=(center,radius,height,color,sides=low?5:7,topRadius=0,foliage=false) => {
    for(let i=0;i<sides;i++) {
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      const ripple=1+.12*Math.sin(i*2.39+center[2]*31), next=1+.12*Math.sin((i+1)*2.39+center[2]*31);
      const p=add(center,[Math.cos(a)*radius*ripple,Math.sin(a)*radius*ripple,0]);
      const q=add(center,[Math.cos(b)*radius*next,Math.sin(b)*radius*next,0]);
      const t=add(center,[Math.cos(a)*topRadius,Math.sin(a)*topRadius,height]);
      tri(p,q,t,color,undefined,foliage);
      if(topRadius) tri(q,add(center,[Math.cos(b)*topRadius,Math.sin(b)*topRadius,height]),t,color,undefined,foliage);
      tri(center,q,p,color,undefined,foliage);
    }
  };
  const crown=(center,radii,color,seed=0,tuft=false,bough=false) => {
    const sides=low?7:bough?11:tuft?9:10, levels=low?(bough?3:tuft?2:3):bough?5:tuft?4:5;
    const normal=p=>{const d=sub(p,center).map((x,i)=>x/(radii[i]*radii[i])),l=Math.hypot(...d)||1;return d.map(x=>x/l);};
    const point=(j,i) => {const a=(i%sides)/sides*Math.PI*2,b=j/levels*Math.PI;
      // Uneven branch tips break the smooth balloon silhouette, including in the orbital LOD.
      const r=bough?1+.23*Math.sin(a*3+seed*7)+.08*Math.cos(a*5-seed*3):
        1+.19*Math.sin(a*3+seed*7+j*2.1)+.09*Math.cos(a*5-seed*3+j);
      const profile=Math.sin(b)*(bough?1-.22*Math.cos(b):1),lean=bough?Math.cos(b)*.18:0;
      return add(center,[(profile*Math.cos(a)*r+lean*Math.sin(seed*4))*radii[0],
        (profile*Math.sin(a)*r+lean*Math.cos(seed*4))*radii[1],
        (Math.cos(b)+(bough?Math.sin(b)*.08*Math.sin(a*2+seed):0))*radii[2]]);};
    for(let j=0;j<levels;j++)for(let i=0;i<sides;i++) {
      const p=point(j,i),q=point(j+1,i),r=point(j+1,i+1),s=point(j,i+1);
      if(j<levels-1)tri(p,q,r,color,normal,true,bough?.28:0);
      if(j>0)tri(p,r,s,color,normal,true,bough?.28:0);
    }
  };
  const branch=(a,b,radius,color)=>{
    const d=sub(b,a),length=Math.hypot(...d),z=d.map(v=>v/length),x=cross(z,[0,0,1]);
    const l=Math.hypot(...x)||1;for(let i=0;i<3;i++)x[i]/=l;const y=cross(z,x),sides=low?4:5;
    const ring=(p,angle,r)=>add(p,x.map((v,i)=>(v*Math.cos(angle)+y[i]*Math.sin(angle))*r));
    for(let i=0;i<sides;i++){const q=i/sides*Math.PI*2,t=(i+1)/sides*Math.PI*2;
      tri(ring(a,q,radius),ring(a,t,radius),ring(b,q,radius*.35),color);
      tri(ring(a,t,radius),ring(b,t,radius*.35),ring(b,q,radius*.35),color);}
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
      const tiers=low?5:9;
      for(let j=0;j<tiers;j++) {const t=j/tiers;
        cone([Math.sin(j*2.4)*.012,Math.cos(j*2.4)*.012,.15+t*.72],.30*Math.pow(1-t,.78),.25-t*.12,
          leaf.map((x,i)=>x*(.79+t*.34)+(i===0?t*.035:0)),low?7:10,0,true);}
      cone([0,0,.83],.07,.17,leaf.map(x=>x*1.12),low?5:7,0,true);
    } else if(kind==='tropical') {
      // Spend the same orbital triangles on six connected, lobed branch volumes instead
      // of twelve tiny pods. Low/detail assets share the complete crown architecture.
      crown([-.025,.02,.86],[.20,.17,.14],leaf,0,true,true);
      for(let i=0;i<5;i++) {
        const a=i*2.399,r=.20+(i%2)*.05,p=[Math.cos(a)*r,Math.sin(a)*r,.58+(i%3)*.09];
        if(!low)branch([0,0,.32],p,.016,[.28,.23,.12]);
        crown(p,[.22,.16,.14],leaf.map(x=>x*(.78+i*.055)),i+.3,true,true);
      }
    } else if(kind==='birch') {
      crown([.02,0,.83],[.11,.10,.17],leaf,0,true,true);
      for(let i=0;i<3;i++) {
        const a=i*2.399,r=.07+i*.02,p=[Math.cos(a)*r,Math.sin(a)*r,.46+i*.12];
        if(!low)branch([0,0,.23+i*.04],p,.010,bark);
        crown(p,[.13,.10,.20],leaf.map(x=>x*(.83+i*.06)),i+.1,true,true);
      }
      if(!low)for(let i=0;i<4;i++)cone([0,0,.12+i*.12],.036,.014,[.14,.15,.13],6,.034);
    } else if(kind==='shrub') {
      crown([0,0,.25],[.38,.31,.25],leaf);
    } else if(kind==='broadleaf') {
      crown([.035,-.01,.84],[.15,.13,.16],leaf,0,true,true);
      for(let i=0;i<5;i++) {
        const a=i*2.399,r=.14+(i%2)*.04,p=[Math.cos(a)*r,Math.sin(a)*r,.55+(i%3)*.085];
        if(!low)branch([0,0,.24+(i%3)*.07],p,.013,bark);
        crown(p,[.17,.13,.20],leaf.map(x=>x*(.78+i*.06)),i+.7,true,true);
      }
    } else {
      crown([0,.02,.88],[.14,.12,.12],leaf,0,true);
      for(let i=0;i<11;i++) {
        const a=i*2.399,r=i<4?.15:.19+(i%3)*.025,p=[Math.cos(a)*r,Math.sin(a)*r,i<4?.77+(i%2)*.045:.45+(i%4)*.075];
        if(!low&&i%2===0)branch([0,0,.24+(i%3)*.07],p,.013,bark);
        crown(p,[.13+(i%2)*.015,.11,.12],leaf.map(x=>x*(.78+(i%6)*.05)),i+.7,true);
      }
    }
  }
  const texcoords=new Float32Array(positions.length/3*2);
  for(let i=0;i<positions.length/3;i++){texcoords[i*2]=Math.max(0,positions[i*3+2]);
    texcoords[i*2+1]=['broadleaf','birch','sakura'].includes(kind)?1:0;}
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),colors:new Float32Array(colors),texcoords,canopy:new Float32Array(canopy),indices:new Uint16Array(indices)};
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
      TEXCOORD_0:out.accessor(mesh.texcoords,'VEC2',5126,34962),
      TEXCOORD_1:out.accessor(mesh.canopy,'VEC2',5126,34962)},
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
