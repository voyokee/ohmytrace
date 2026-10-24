import { mkdir, writeFile } from 'node:fs/promises';
import { makeVegetationLibrary } from '../src/scenery/vegetation-assets.js';
const folder=new URL('../assets/models/',import.meta.url);await mkdir(folder,{recursive:true});
await writeFile(new URL('vegetation.glb',folder),makeVegetationLibrary());
await writeFile(new URL('vegetation-low.glb',folder),makeVegetationLibrary(true));
console.log('Built original detailed and low-detail 3D vegetation libraries.');
