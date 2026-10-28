import {openTool} from './browser-tools.mjs';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {resolve,extname,sep} from 'node:path';import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const packaged=!!process.env.LIFE_VIEWER_ROOT,root=packaged?resolve(process.env.LIFE_VIEWER_ROOT):fileURLToPath(new URL('../../',import.meta.url)),output=process.env.LIFE_BROWSER_OUTPUT||resolve(tmpdir(),'ohmytrace-story-mobile');await mkdir(output,{recursive:true});
const demo=await readFile(packaged?resolve(root,'story.json'):new URL('../../src/life/story/demo.story.json',import.meta.url)),artifact=JSON.parse(demo);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/story.json'){res.writeHead(200,{'Content-Type':'application/json'}).end(demo);return;}
  const path=resolve(root,'.'+decodeURIComponent(name));if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{window.storageReads=0;for(const name of ['indexedDB','localStorage'])Object.defineProperty(window,name,{get(){window.storageReads++;throw new Error('Mobile Viewer read private storage');}});});
await context.route('https://**/*',route=>route.abort());
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/${packaged?'index.html':'story-viewer.html'}`);await page.waitForSelector('#story-player:not([hidden])');
  assert.ok(await page.evaluate(()=>navigator.maxTouchPoints>0));await page.locator('[data-story-play]').tap();assert.equal(await page.locator('#story-player').getAttribute('data-status'),'paused');
  const place=artifact.orderedScenes.findIndex(s=>s.kind==='place'&&s.tripId);await page.locator(`[data-story-dot="${String(place)}"]`).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#card').evaluate(el=>el.classList.contains('show')),false,'Automatic Story scenes must keep the globe visible instead of opening a second blocking Trip card');
  const inferredTrip=artifact.trips.find(t=>t.routeKind==='inferred'),tripScene=artifact.orderedScenes.findIndex(s=>s.kind==='trip'&&s.tripId===inferredTrip.id);
  await page.locator(`[data-story-dot="${String(tripScene)}"]`).click();await openTool(page,'#btn-list');await page.waitForSelector('#list-body .item');
  await page.locator('#list-body .item').filter({hasText:inferredTrip.title}).tap();await page.waitForSelector('#card.show');assert.equal(await page.locator('#story-player').isVisible(),false,'A Trip card opened during playback replaces the player instead of stacking on it');
  assert.doesNotMatch(await page.locator('#card').innerText(),/0 张照片|照片只提供/,'A CSV-only Trip must not acquire photo provenance just because its route is inferred');
  await page.locator('#card [data-act=close]').tap();
  const touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:340,y:220}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290,y:245}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('#story-player').getAttribute('data-status'),'paused');
  await openMore(page);await page.locator('[data-story-stop]').tap();await openMore(page);await page.locator('[data-story-speed]').selectOption('4');await page.locator('[data-story-play]').tap();
  await page.waitForFunction(()=>document.querySelector('#story-player').dataset.status==='ended',null,{timeout:50000});
  const memory=artifact.orderedScenes.findIndex(s=>s.kind==='memory');await page.locator(`[data-story-dot="${String(memory)}"]`).click();await page.waitForFunction(()=>document.querySelector('.story-memory-image')?.naturalWidth>0);
  const rect=await page.locator('#story-player').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);assert.equal(await page.evaluate(()=>window.storageReads),0);
  await page.screenshot({path:resolve(output,'04-fresh-touch-mobile.png')});await page.close();assert.deepEqual(errors,[]);
  const result={result:'PASS',packagedRuntime:packaged,viewport:'390x844',deviceScaleFactor:2,isMobile:true,hasTouch:true,fullLifePlayback:true,nativeTouchExploration:true,photoMemory:true,storageReads:0,externalResourcesBlocked:true,pageErrors:[],physicalDeviceTest:false};
  await writeFile(resolve(output,'story-mobile-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}

// Speed, jump-to and restart live under the player's collapsed "更多" section.
async function openMore(p){if(!await p.locator('.story-more').evaluate(e=>e.open))await p.locator('.story-more summary').click();}
