import {makeWorldSurface} from './world-surface.js?v=20261025-ridges';
import {makeWorldForest} from './world-data.js?v=20261026-relief-fit';
import {makeCanopyContact} from './canopy-contact.js';
self.onmessage=async({data})=>{
  try {
    const options={constrained:data.constrained,nightMap:data.night};
    const forest=makeWorldForest(data.day,data.height,options);
    forest.contact=makeCanopyContact(forest,{...options,dayMap:data.day,heightMap:data.height});
    const surface=await makeWorldSurface(data.height,options);
    self.postMessage({forest,surface},[forest.contact.data.buffer,...Object.values(surface).map(a=>a.buffer)]);
  }catch(error){self.postMessage({error:error.message});}
};
