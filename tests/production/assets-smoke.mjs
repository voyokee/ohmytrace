import {browserTarget} from './browser-target.mjs';
const target=await browserTarget(process.env.LIFE_APP_URL);
for(const path of ['/','/app.js','/story-viewer.html','/story-viewer','/runtime-config.json']){
  const r=await target.fetch(path),bytes=new Uint8Array(await r.arrayBuffer());
  console.log(JSON.stringify({path,status:r.status,finalPath:new URL(r.url).pathname,bytes:bytes.length,type:r.headers.get('content-type'),cache:r.headers.get('cache-control')}));
}
