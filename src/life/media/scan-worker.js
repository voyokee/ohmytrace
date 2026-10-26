import {analyzePhotoFile} from './exif.js';
// One message carries several files; replies are batched for the same reason.
self.onmessage=async event=>{
  const {id,files,limits,companions}=event.data,results=[];
  try{
    for(let i=0;i<files.length;i++){try{results.push({asset:await analyzePhotoFile(files[i],{limits,companion:companions[i]})});}catch(error){results.push({error:error.message});}}
    self.postMessage({id,asset:results});
  }catch(error){self.postMessage({id,error:error.message});}
};
