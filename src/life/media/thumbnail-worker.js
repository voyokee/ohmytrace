import {createThumbnail} from './thumbnail.js';
self.onmessage=async({data})=>{try{self.postMessage({id:data.id,blob:await createThumbnail(data.file,data.options)});}catch{self.postMessage({id:data.id,error:'THUMBNAIL_DECODE_FAILED'});}};
