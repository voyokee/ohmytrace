import {androidBridge} from './android-bridge.js';
const CHUNK=192*1024;
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
export async function saveDocument(name,input,{mimeType=input?.type||'application/octet-stream',bridge=androidBridge(),signal,document=globalThis.document,url=globalThis.URL}={}){
 const blob=input instanceof Blob?input:new Blob([input],{type:mimeType});signal?.throwIfAborted();
 if(!bridge){const a=document.createElement('a'),href=url.createObjectURL(blob);a.href=href;a.download=name;document.body.append(a);a.click();const timer=setTimeout(()=>{url.revokeObjectURL(href);a.remove();},1000);timer.unref?.();return {saved:true,bytes:blob.size};}
 let documentId;
 try{
  const result=await bridge.call('saveDocument',{name,mimeType:blob.type||mimeType,size:blob.size},{signal,timeoutMs:180000});if(result?.cancelled)return {saved:false,cancelled:true};documentId=result?.documentId;if(!documentId)throw new Error('本机保存通道未返回文件');
  for(let offset=0;offset<blob.size;offset+=CHUNK){signal?.throwIfAborted();const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer());await bridge.call('writeDocument',{documentId,offset,base64:base64(bytes)},{signal});}
  const done=await bridge.call('finishDocument',{documentId},{signal});return {saved:true,bytes:done.bytes??blob.size};
 }catch(error){if(documentId)await bridge.call('cancelDocument',{documentId}).catch(()=>{});throw error;}
}
