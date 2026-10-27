import {analyzePhotoFile} from './exif.js';
self.onmessage=async event=>{
  const {id,file,limits}=event.data;
  try{self.postMessage({id,asset:await analyzePhotoFile(file,{limits})});}
  catch(error){self.postMessage({id,error:error.message});}
};
