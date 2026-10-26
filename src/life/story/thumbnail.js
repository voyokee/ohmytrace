import {cleanJPEG} from './share.js';
export async function storyThumbnail(file){
  if(!file.type.startsWith('image/')||file.size>64*1024*1024)throw new Error('请选择不超过 64 MiB 的图片');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try{
    if(bitmap.width*bitmap.height>40000000)throw new Error('图片超过 4000 万像素预览预算');
    const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.72));if(!blob||blob.size>256*1024)throw new Error('缩略图超过 256 KiB，请选择较小的图片');
    const bytes=cleanJPEG(new Uint8Array(await blob.arrayBuffer()));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return 'data:image/jpeg;base64,'+btoa(binary);
  }finally{bitmap.close();}
}
