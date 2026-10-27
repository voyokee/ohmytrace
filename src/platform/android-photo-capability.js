import {analyzePhotoFile} from '../life/media/exif.js';
import {validateThumbnail} from '../life/media/thumbnail.js';
import {MEDIA_LIMITS} from '../life/media/config.js';

/** Origin-scoped WebMessageListener, installed only by the bundled Android app. */
export class AndroidPhotoBridge {
  constructor(port=globalThis.OhMyTraceMedia){
    if(!port?.postMessage)throw new Error('Android 相册通道不可用');
    this.port=port;this.pending=new Map();this.sequence=0;
    port.onmessage=event=>{let response;try{response=JSON.parse(event.data);}catch{return;}
      const job=this.pending.get(response.id);if(!job)return;this.pending.delete(response.id);job.cleanup();
      response.error?job.reject(new Error(response.error)):job.resolve(response.result);
    };
  }
  call(method,params={}, {signal,timeoutMs=60000}={}){
    signal?.throwIfAborted();const id=String(++this.sequence);
    return new Promise((resolve,reject)=>{
      const abort=()=>{this.pending.delete(id);cleanup();this.port.postMessage(JSON.stringify({id:`cancel-${id}`,method:'cancel',params:{requestId:id}}));reject(signal.reason||new DOMException('已取消','AbortError'));};
      const timer=setTimeout(()=>{this.pending.delete(id);cleanup();this.port.postMessage(JSON.stringify({id:`cancel-${id}`,method:'cancel',params:{requestId:id}}));reject(new Error('Android 相册读取超时，请重试'));},timeoutMs);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{this.port.postMessage(JSON.stringify({id,method,params}));}catch(error){this.pending.delete(id);cleanup();reject(error);}
    });
  }
}
const bytesFrom64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

/** Virtual File: reads bounded native ranges, never copies a whole album into JS. */
export class AndroidPhotoFile {
  constructor(capability,handle,info,signal){this.capability=capability;this.nativeHandle=handle;this.name=info.name;this.size=info.size;this.type=info.mimeType||'';this.lastModified=info.lastModified??0;this.locationAuthorized=info.locationAuthorized??false;this.signal=signal;}
  slice(start=0,end=this.size){
    const size=this.size,normalize=n=>Math.min(size,Math.max(0,n<0?size+n:n)),offset=normalize(start),length=Math.max(0,normalize(end)-offset);
    return {size:length,arrayBuffer:async()=>{
      const cached=this.sampleRanges?.find(r=>offset>=r.offset&&offset+length<=r.offset+r.bytes.length);if(cached)return cached.bytes.slice(offset-cached.offset,offset-cached.offset+length).buffer;
      // Bridge payloads remain <=256 KiB even during the bounded legacy hash check.
      if(length>64*1024*1024)throw new Error('NATIVE_READ_BUDGET');
      const out=new Uint8Array(length);
      for(let p=0;p<length;p+=256*1024){this.signal?.throwIfAborted();const n=Math.min(256*1024,length-p);
        const result=await this.capability.bridge.call('readRange',{handle:this.nativeHandle,offset:offset+p,length:n},{signal:this.signal});
        const bytes=bytesFrom64(result.base64);if(bytes.length!==n)throw new Error('照片已变更或读取不完整，请重新扫描');out.set(bytes,p);
      }return out.buffer;
    }};
  }
  arrayBuffer(){return this.slice().arrayBuffer();}
}
export class AndroidPhotoCapability {
  platform='android';
  constructor(bridge=new AndroidPhotoBridge()){this.bridge=bridge;}
  async permissionStatus(){return (await this.permissionDetails()).photos;}
  permissionDetails(){return this.bridge.call('permissionStatus');}
  requestPermission({location=false}={}){return this.bridge.call('requestPermission',{location},{timeoutMs:180000});}
  async ensureLocationAccess(){
    let permission=await this.permissionDetails();
    if(!['authorized','limited'].includes(permission.photos))permission=await this.requestPermission();
    if(!['authorized','limited'].includes(permission.photos))throw new Error('PHOTO_PERMISSION_REQUIRED：未获相册访问授权，本次未扫描。请在系统设置中允许访问照片后重试。');
    if(permission.location!=='authorized')permission=await this.requestPermission({location:true});
    if(permission.location!=='authorized')throw new Error('GPS_PERMISSION_REQUIRED：未获照片位置授权，本次未扫描。请允许读取照片 GPS；若系统不再提示，请到设置 → 应用 → OnceHere → 权限中调整后重新扫描。');
    return permission;
  }
  async page(options){return this.bridge.call('enumerate',options,{signal:options.signal});}
  /** One-tap import page: only located photos come back, as [volume,id,lat,lon,local,offset,takenMs] rows. */
  locate(options,{signal}={}){return this.bridge.call('locate',options,{signal,timeoutMs:180000});}
  async preview(pointer,{maxEdge=320,signal}={}){const result=await this.bridge.call('preview',{...pointer,maxEdge},{signal});return new Blob([bytesFrom64(result.base64)],{type:'image/jpeg'});}
  file(entry,signal){return new AndroidPhotoFile(this,entry.handle,entry,signal);}
  async analyzeFile(file,options={}){
    const limits=options.limits||MEDIA_LIMITS;
    try{
      if(file.size<=limits.maxFileBytes&&limits.sampleBytes<=262144&&limits.tailSampleBytes<=65536){
        const headLength=Math.min(file.size,limits.sampleBytes),tailLength=file.size>headLength?Math.min(file.size,limits.tailSampleBytes):0;
        const samples=await this.bridge.call('readSamples',{handle:file.nativeHandle,headLength,tailLength},{signal:file.signal});
        const head=bytesFrom64(samples.headBase64),tail=bytesFrom64(samples.tailBase64);if(head.length!==headLength||tail.length!==tailLength||samples.tailOffset!==file.size-tailLength)throw new Error('照片读取不完整');
        if(tailLength&&samples.tailOffset<=head.length){const bytes=new Uint8Array(file.size);bytes.set(head);bytes.set(tail,samples.tailOffset);file.sampleRanges=[{offset:0,bytes}];}
        else file.sampleRanges=[{offset:0,bytes:head},{offset:samples.tailOffset,bytes:tail}];
      }
      return await analyzePhotoFile(file,options);
    }finally{file.sampleRanges=null;}
  }
  async readAssetMetadata(handle,{signal}={}){const info=await this.bridge.call('stat',{handle},{signal}),file=this.file({...info,handle},signal),observation=await analyzePhotoFile(file);return {handle,mimeType:info.mimeType,size:info.size,availability:'local',location:observation.coordinates?{state:'authorized',...observation.coordinates}:{state:info.locationAuthorized?'absent':'permission-required'},observation};}
  async requestThumbnail(handle,{maxEdge=512,signal}={}){const result=await this.bridge.call('thumbnail',{handle,maxEdge},{signal});const blob=new Blob([bytesFrom64(result.base64)],{type:'image/jpeg'});await validateThumbnail(blob);return blob;}
  async *enumerateAuthorizedAssets(options){let cursor=options.cursor||null;do{const page=await this.page({...options,cursor});yield {handles:page.entries.map(e=>e.handle),entries:page.entries,cursor:page.cursor,scopeId:page.scopeId,checkpoint:page.checkpoint};cursor=page.cursor;}while(cursor);}
  async readAssetContent(handle,{signal}={}){const info=await this.bridge.call('stat',{handle},{signal});if(info.size>64*1024*1024)throw new Error('NATIVE_READ_BUDGET');return new Blob([await this.file({...info,handle},signal).arrayBuffer()],{type:info.mimeType});}
  async releaseResources(){} // No native streams survive an individual call.
}
export function androidPhotoCapability(){return globalThis.OhMyTraceMedia?.postMessage?new AndroidPhotoCapability():null;}
