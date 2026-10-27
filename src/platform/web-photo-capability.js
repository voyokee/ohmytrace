import {analyzePhotoFile} from '../life/media/exif.js';
import {readZip} from '../life/media/archive.js';
export const MEDIA_NAME=/\.(jpe?g|heic|heif|png|webp|avif|dng|tiff?|cr2|cr3|nef|arw|orf|rw2|raf|mov|mp4|m4v)$/i;
const allowed=name=>MEDIA_NAME.test(name)&&!name.split('/').some(p=>p.startsWith('.')||p==='__MACOSX');
export async function preparePhotoInput(list,{signal,onProgress=()=>{}}={}){
  const files=[];let unpackedBytes=0;for(const f of list){signal?.throwIfAborted();
    if(/\.zip$/i.test(f.name)){const entries=await readZip(f,{signal});for(const entry of entries.filter(e=>allowed(e.path))){signal?.throwIfAborted();unpackedBytes+=entry.size;if(unpackedBytes>256*1024*1024||files.length>=20000)throw new Error('ZIP 总解包容量或文件数量超限');const content=await entry.read();files.push(new File([content],entry.path,{lastModified:0}));onProgress(files.length);}}
    else if(!f.webkitRelativePath||allowed(f.webkitRelativePath))files.push(f);
    if(files.length>20000)throw new Error('每批最多 20,000 个媒体文件');
  }return files.sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name));
}
/** Only user-selected Files exist in this capability. No ambient gallery access. */
export class WebPhotoCapability {
  platform='web';
  constructor({select=async()=>[],thumbnail=null}={}){this.select=select;this.thumbnail=thumbnail;this.files=new Map();this.operations=new Map();}
  async permissionStatus(){return this.files.size?'limited':'unknown';}
  async *selectPhotos({operationId,signal}){const controller=new AbortController();this.operations.set(operationId,controller);if(signal?.aborted)controller.abort(signal.reason);const onAbort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',onAbort,{once:true});const scopeId=crypto.randomUUID();
    try{const files=await preparePhotoInput(await this.select({signal:controller.signal}),{signal:controller.signal});const handles=files.map(file=>{const localId=crypto.randomUUID();this.files.set(localId,{file,scopeId});return {source:'web',localId,scopeId};});for(let i=0;i<handles.length;i+=100){controller.signal.throwIfAborted();yield handles.slice(i,i+100);}}finally{signal?.removeEventListener('abort',onAbort);this.operations.delete(operationId);}}
  file(handle){const entry=this.files.get(handle.localId);if(handle.source!=='web'||entry?.scopeId!==handle.scopeId)throw new Error('照片选择授权已失效，请重新选择');return entry.file;}
  async *enumerateAuthorizedAssets(){throw new Error('Web 无法枚举系统相册，请主动选择照片');}
  async readAssetMetadata(handle,{signal}={}){signal?.throwIfAborted();const file=this.file(handle),observation=await analyzePhotoFile(file);return {handle,mimeType:file.type,size:file.size,location:observation.coordinates?{state:'authorized',...observation.coordinates}:{state:'absent'},availability:'local',observation};}
  async readAssetContent(handle,{signal}={}){signal?.throwIfAborted();return this.file(handle);}
  async requestThumbnail(handle,{maxEdge,signal}={}){signal?.throwIfAborted();if(!this.thumbnail)throw new Error('缩略图生成器不可用');return this.thumbnail(this.file(handle),{maxEdge,signal});}
  async cancelOperation(id){this.operations.get(id)?.abort();}
  observeLibraryChanges(){return ()=>{};}
  async releaseResources(handles){if(handles)for(const h of handles)this.files.delete(h.localId);else this.files.clear();}
}
