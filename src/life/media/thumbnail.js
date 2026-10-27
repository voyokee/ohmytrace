import {cleanJPEG} from '../story/share.js';
import {parseJpegExif} from './exif.js';
export const THUMBNAIL_LIMITS=Object.freeze({maxEdge:512,maxBytes:100*1024,budgetBytes:100*1024*1024,maxSourceBytes:64*1024*1024,maxDecodePixels:50_000_000});
export async function validateThumbnail(blob,limits=THUMBNAIL_LIMITS){
 if(!(blob instanceof Blob)||blob.size>limits.maxBytes||blob.size===0)throw new Error('缩略图容量无效');
 const bytes=new Uint8Array(await blob.arrayBuffer());cleanJPEG(bytes,{reject:true});const r=parseJpegExif(bytes);
 if(!r.dimensions||r.dimensions.width>limits.maxEdge||r.dimensions.height>limits.maxEdge)throw new Error('缩略图尺寸超限');return blob;
}
/** One decode at a time, requested at reduced size; re-encode + strip metadata. */
export async function createThumbnail(file,{dimensions,orientation=null,limits=THUMBNAIL_LIMITS,signal}={}){
 signal?.throwIfAborted();if(file.size>limits.maxSourceBytes||!dimensions||dimensions.width*dimensions.height>limits.maxDecodePixels)throw new Error('THUMBNAIL_DECODE_BUDGET');
 const swapped=[5,6,7,8].includes(orientation),width=swapped?dimensions.height:dimensions.width,height=swapped?dimensions.width:dimensions.height;
 const scale=Math.min(1,limits.maxEdge/Math.max(width,height)),bitmap=await createImageBitmap(file,{imageOrientation:'from-image',resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),resizeQuality:'high'});
 try{
  signal?.throwIfAborted();const ratio=Math.min(1,limits.maxEdge/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio));
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
  canvas.getContext('2d').drawImage(bitmap,0,0,w,h);
  for(const quality of [.78,.60,.42]){signal?.throwIfAborted();const raw=canvas.convertToBlob?await canvas.convertToBlob({type:'image/jpeg',quality}):await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(!raw)continue;
   const safe=new Blob([cleanJPEG(new Uint8Array(await raw.arrayBuffer()))],{type:'image/jpeg'});if(safe.size<=limits.maxBytes){await validateThumbnail(safe,limits);return safe;}}
  throw new Error('THUMBNAIL_SIZE_LIMIT');
 }finally{bitmap.close();}
}
export class ThumbnailGenerator {
 constructor(){this.worker=null;this.counter=0;this.pending=new Map();this.queue=Promise.resolve();}
 create(file,options){const run=this.queue.then(async()=>{
  if(globalThis.Worker&&globalThis.OffscreenCanvas){
   try{if(!this.worker){this.worker=new Worker(new URL('./thumbnail-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.blob);};this.worker.onerror=()=>this.close();}
    return await new Promise((resolve,reject)=>{const id=++this.counter,timer=setTimeout(()=>{this.close();reject(new Error('THUMBNAIL_TIMEOUT'));},30000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,file,options});});
   }catch{/* Unsupported worker decoding gets one bounded main-thread attempt. */}
  }
  await new Promise(r=>setTimeout(r,0));return createThumbnail(file,options);
 });this.queue=run.catch(()=>{});return run;}
 close(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('THUMBNAIL_WORKER_STOPPED'));}this.pending.clear();}
}
