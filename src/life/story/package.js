import {parseArtifact} from './share.js';

const encoder=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const header=size=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
export function staticZip(entries){
  const parts=[],directory=[];let offset=0,total=0;
  if(entries.length>65000)throw new Error('分享包文件过多');
  for(const [path,input]of entries){
    if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw new Error('分享包路径无效');
    const bytes=typeof input==='string'?encoder.encode(input):input,name=encoder.encode(path),crc=crc32(bytes);total+=bytes.length;if(total>256*1024*1024)throw new Error('分享包超过 256 MiB 预算');
    const h=header(30),v=h.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);
    const c=header(46),w=c.view;w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,bytes.length,true);w.setUint32(24,bytes.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
    parts.push(h.bytes,name,bytes);directory.push(c.bytes,name);offset+=h.bytes.length+name.length+bytes.length;
  }
  const size=directory.reduce((n,b)=>n+b.length,0),end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
}
const allowed=path=>/^(assets\/|vendor\/cesium\/|src\/(rendering|scenery|performance|ui|geocoding)\/)/.test(path)||['app.js','styles.css','story-viewer.html','src/platform/android-bridge.js','src/platform/document-save.js','src/life/schema.js','src/life/geocoding/region-policy.js','src/life/travel-policy.js','src/life/timeline-layout.js','src/life/story/publishing/publisher.js'].includes(path)||/^src\/life\/story\/(schema|share|viewer|viewer-config|viewer-bridge|app-integration|player-ui|playback|story)\.(js|css)$/.test(path);
export async function createSharePackage(input,{fetchFile=async path=>{const r=await fetch(new URL('../../../'+path,import.meta.url));if(!r.ok)throw new Error(`分享包资源缺失：${path}`);return new Uint8Array(await r.arrayBuffer());},onProgress=()=>{}}={}){
  const artifact=parseArtifact(input),manifest=JSON.parse(new TextDecoder().decode(await fetchFile('src/life/story/runtime-files.json'))),entries=[];
  if(!Array.isArray(manifest)||manifest.some(path=>typeof path!=='string'||!allowed(path)||path.includes('..'))||new Set(manifest).size!==manifest.length)throw new Error('分享运行时清单无效');
  let next=0,completed=0,failed=false;
  await Promise.all(Array.from({length:Math.min(4,manifest.length)},async()=>{
    while(!failed&&next<manifest.length){
      const i=next++,path=manifest[i];
      try{entries[i]=[path==='story-viewer.html'?'index.html':path,await fetchFile(path)];}
      catch(error){failed=true;throw error;}
      completed++;if(completed%10===1||completed===manifest.length)onProgress(`正在打包地球资源 ${completed} / ${manifest.length}`);
    }
  }));
  const json=JSON.stringify(artifact,null,2),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(json)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  entries.push(['story.json',json],['story.sha256',digest],['README.txt','OnceHere — static story package\nExtract the ZIP and publish the entire folder to a static HTTPS host on a separate origin. No build step or login required. Open index.html through HTTP(S), not file://. For local testing: python -m http.server 8080\nIncludes only reviewed Story data, embedded approved thumbnails and public engine/assets. No personal database, CSV or original media files. External terrain/imagery is optional; the local globe remains usable when offline. No cloud upload was performed.\n']);
  onProgress('静态分享包已生成；未上传任何数据');return staticZip(entries);
}
