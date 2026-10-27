import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
// One-tap Android import against a mock WebMessage port: real UI, offline names,
// IndexedDB and reconstruction; not Android device certification.
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const output=process.env.LIFE_BROWSER_OUTPUT||resolve(tmpdir(),'ohmytrace-android-auto');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+sep)&&path!==resolve(root,'index.html'))throw new Error();const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.LIFE_BROWSER_EXECUTABLE,args:['--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{
  // 12,000 album rows: home in Shenzhen, a Bali trip, a Kyoto trip; a third has no GPS.
  const TOTAL=Number(localStorage.getItem('fake-total')||12000),spots=[[22.62,114.06],[-8.65,115.22],[-8.51,115.26],[35.01,135.76]];
  const row=i=>{if(i%3===0)return null;if(i%97===0)return ['external_primary',String(i+1),0,0,'2026-01-01T00:00:00',480,null];
    const trip=i%10<6?0:i%10<9?(i%2?1:2):3,[lat,lon]=spots[trip],day=trip===0?1+(i%200):trip===3?400+(i%3):300+(i%5),d=new Date(Date.UTC(2025,0,day));
    return ['external_primary',String(i+1),lat+(i%13)*0.002,lon+(i%11)*0.002,d.toISOString().slice(0,10)+'T10:00:00',trip===3?540:trip===0?480:480,null];};
  window.nativeCalls=[];const port={postMessage(text){const request=JSON.parse(text);window.nativeCalls.push(request.method);if(request.method==='cancel')return;
    setTimeout(()=>{let result,error;try{const p=request.params;
      if(request.method==='permissionStatus')result={photos:'authorized',location:localStorage.getItem('fake-gps')||'permission-required',scopeId:'test'};
      else if(request.method==='requestPermission'){if(p.location&&localStorage.getItem('fake-gps-deny')!=='yes')localStorage.setItem('fake-gps','authorized');result={photos:'authorized',location:localStorage.getItem('fake-gps')||'permission-required',scopeId:'test'};}
      else if(request.method==='locate'){const start=p.cursor?.afterId??(p.since?TOTAL:0),end=Math.min(TOTAL,start+p.pageSize),located=[];for(let i=start;i<end;i++){const r=row(i);if(r)located.push(r);}
        result={located,scanned:end-start,cursor:end<TOTAL?{afterId:end}:null,checkpoint:{upper:TOTAL},...(p.cursor?{}:{total:TOTAL-start})};}
      else if(request.method==='preview')result={base64:''};else throw new Error(request.method);
    }catch(e){error=e.message;}port.onmessage?.({data:JSON.stringify({id:request.id,result,error})});},15);
  }};window.OhMyTraceMedia=port;
});
const data=()=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('ohmytrace.life');r.onsuccess=()=>{const db=r.result,q=db.transaction('datasets').objectStore('datasets').get('canonical');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
const shot=name=>page.screenshot({path:resolve(output,name)});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.querySelector('#loader')?.classList.contains('out'));
  await page.locator('#empty-photos').click();await page.waitForSelector('[data-photo-auto-start]');
  assert.equal(await page.locator('#photo-dialog input, #photo-dialog [data-photo-zip], #photo-dialog [data-photo-manage]').count(),0,'the app import is a single button: no inputs, ZIP or backup tools');
  await shot('android-1-start.png');
  await page.evaluate(()=>localStorage.setItem('fake-gps-deny','yes'));await page.locator('[data-photo-auto-start]').click();
  await page.waitForSelector('.auto-error');assert.match(await page.locator('.auto-error').innerText(),/照片位置/);assert.ok(!(await page.evaluate(()=>window.nativeCalls)).includes('locate'),'nothing is read without photo GPS consent');
  await page.evaluate(()=>localStorage.removeItem('fake-gps-deny'));
  const started=Date.now();await page.locator('[data-photo-auto-start]').click();
  await page.waitForFunction(()=>/正在读取照片 [\d,]+ \/ 12,000/.test(document.querySelector('[data-auto-status]')?.textContent||''));await shot('android-2-progress.png');
  await page.waitForSelector('[data-photo-auto-done]',{timeout:120000});const elapsed=Date.now()-started;await shot('android-3-done.png');
  const saved=await data(),located=saved.memories.length;
  assert.ok(located>7500&&located<8000,`about two thirds of 12,000 photos are located: ${located}`);
  assert.ok(saved.memories.every(m=>/^android-media:external_primary\/\d+$/.test(m.uri)),'only album pointers are stored');
  assert.ok(saved.places.length<=6,`places are merged per city: ${saved.places.map(p=>p.name)}`);
  assert.equal(saved.residences.length,1,'the dominant city becomes the inferred home');assert.equal(saved.places.find(p=>p.id===saved.residences[0].placeId).name,'深圳','offline city names are Chinese');
  assert.ok(saved.places.every(p=>!/[A-Za-z]/.test(p.name)),`no English place names: ${saved.places.map(p=>p.name)}`);
  assert.deepEqual(saved.trips.map(t=>t.title).sort(),['日本之旅','印度尼西亚之旅'].sort());
  assert.match(await page.locator('.auto-result').innerText(),/新增 2 次旅行/);
  await page.locator('[data-photo-auto-done]').click();await page.waitForFunction(()=>!document.querySelector('#photo-dialog').open);await page.waitForTimeout(1500);await shot('android-4-map.png');
  await page.locator('#btn-photos').click();await page.waitForSelector('[data-photo-auto-start]');assert.match(await page.locator('.auto-intro').innerText(),/只会补充新拍的照片/);
  await page.locator('[data-photo-auto-start]').click();await page.waitForSelector('[data-photo-auto-done]');assert.match(await page.locator('.auto-result').innerText(),/没有发现新的足迹/);
  assert.equal((await data()).memories.length,located,'re-importing never duplicates');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,browser:await browser.version(),albumRows:12000,located,places:saved.places.length,trips:saved.trips.length,jsElapsedMs:elapsed,nativeBoundary:'mock port with 15 ms latency per page; device EXIF time not included'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
