import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {photoJPEG} from './photo-fixtures.mjs';
import {cleanJPEG} from '../../src/life/story/share.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+sep)&&path!==resolve(root,'index.html'))throw new Error();const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.LIFE_BROWSER_EXECUTABLE,args:['--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('nominatim'))network.push(r.url());});
const base64=bytes=>Buffer.from(bytes).toString('base64'),photos=[base64(photoJPEG({lat:30.2741,lon:120.1551,nonce:123})),base64(await readFile(new URL('./fixtures/photo-gps.heic',import.meta.url))),base64(await readFile(new URL('./fixtures/photo-gps.png',import.meta.url))),base64(photoJPEG({lat:35.68,lon:139.76,nonce:124}))],thumbnail=base64(cleanJPEG(photoJPEG()));
await context.addInitScript(({photos,thumbnail})=>{
  window.nativeCalls=[];const port={postMessage(text){const request=JSON.parse(text);window.nativeCalls.push(request);if(request.method==='cancel')return;
    setTimeout(()=>{let result,error;try{const p=request.params,done=localStorage.getItem('native-first-done')==='yes',all=done?photos:photos.slice(0,3);
      if(request.method==='permissionStatus')result={photos:'authorized',location:localStorage.getItem('fake-gps')||'permission-required'};
      else if(request.method==='requestPermission'){if(p.location)localStorage.setItem('fake-gps','authorized');result={photos:'authorized',location:localStorage.getItem('fake-gps')||'permission-required'};}
      else if(request.method==='enumerate'){const offset=p.cursor??(p.since?3:0),limit=offset+2,entries=all.slice(offset,limit).map((bytes,i)=>({handle:{source:'android',scopeId:'test:full:gps',localId:String(offset+i)},name:`phone-${offset+i}.${offset+i===1?'heic':offset+i===2?'png':'jpg'}`,mimeType:'image/jpeg',size:atob(bytes).length,lastModified:1000}));result={entries,cursor:limit<all.length?limit:null,checkpoint:{scopeId:'test:full:gps',versions:{primary:'v1'},upper:{primary:all.length}},scopeId:'test:full:gps'};}
      else if(request.method==='readRange')result={base64:btoa(atob(photos[+p.handle.localId]).slice(p.offset,p.offset+p.length))};
      else if(request.method==='thumbnail')result={base64:thumbnail};else throw new Error(request.method);
    }catch(e){error=e.message;}port.onmessage?.({data:JSON.stringify({id:request.id,result,error})});},5);
  }};window.OhMyTraceMedia=port;
},{photos,thumbnail});
const data=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('ohmytrace.life');r.onsuccess=()=>{const db=r.result,q=db.transaction('datasets').objectStore('datasets').get('canonical');q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>reject(q.error);};}));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.querySelector('#loader')?.classList.contains('out'));await page.waitForSelector('body.is-empty #empty-photos');assert.equal(await page.locator('#btn-data').isVisible(),false);await page.locator('#empty-photos').click();await page.waitForSelector('[data-photo-native]');
  assert.equal(await page.locator('[data-photo-library-backup]').count(),0,'onboarding keeps backup controls on their own page');await page.locator('[data-photo-manage]').click();await page.waitForSelector('[data-photo-library-backup]');assert.equal(await page.locator('[data-photo-native]').count(),0);await page.locator('[data-photo-manage]').click();await page.waitForSelector('[data-photo-native]');
  await page.locator('[data-photo-native-location]').click();await page.waitForFunction(()=>document.querySelector('[data-photo-native]').textContent.includes('可读取原始照片 GPS'));
  await page.locator('[data-photo-native-start]').fill('2025-01-01T00:00');await page.locator('[data-photo-native-end]').fill('2026-01-01T00:00');await page.locator('[data-photo-retain]').check();
  await page.locator('[data-photo-native-scan]').click();await page.waitForSelector('[data-photo-preview]');assert.match(await page.locator('[data-photo-summary]').innerText(),/有 GPS\s*3/);assert.ok((await page.evaluate(()=>window.nativeCalls)).find(c=>c.method==='enumerate'&&c.params.startMs&&c.params.endMs));
  await page.locator('[data-photo-preview]').click();await page.waitForSelector('[data-photo-commit]');await page.locator('[data-photo-commit]').click();await page.waitForFunction(()=>document.querySelector('[data-photo-progress]').textContent.includes('已保存'));
  assert.equal((await data()).memories.length,3);assert.equal(errors.length,0);assert.equal(network.length,0);
  await page.evaluate(()=>localStorage.setItem('native-first-done','yes'));await page.reload();await page.waitForFunction(()=>document.querySelector('#loader')?.classList.contains('out'));await page.locator('#btn-photos').click();await page.locator('[data-photo-gallery]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-photo-gallery-list] img').length===3&&[...document.querySelectorAll('[data-photo-gallery-list] img')].every(i=>i.complete&&i.naturalWidth));
  await page.locator('[data-photo-native-start]').fill('2025-01-01T00:00');await page.locator('[data-photo-native-end]').fill('2026-01-01T00:00');await page.locator('[data-photo-native-scan]').click();await page.waitForSelector('[data-photo-preview]');assert.ok((await page.evaluate(()=>window.nativeCalls)).find(c=>c.method==='enumerate'&&c.params.since));
  await page.locator('[data-photo-preview]').click();await page.waitForSelector('[data-photo-commit]');await page.locator('[data-photo-commit]').click();await page.waitForFunction(()=>document.querySelector('[data-photo-progress]').textContent.includes('已保存'));assert.equal((await data()).memories.length,4);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  console.log(JSON.stringify({passed:true,browser:await browser.version(),memories:4,retainedAfterReload:3,nativeBoundary:'mock WebMessage port; real browser UI, Worker, IndexedDB and thumbnails; not Android device certification'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
