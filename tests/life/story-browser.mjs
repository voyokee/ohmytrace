import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {resolve,extname,sep} from 'node:path';import {tmpdir} from 'node:os';import * as zlib from 'node:zlib';
import {storyFixture} from './story-fixtures.mjs';import {exportLegacyCSV} from '../../src/life/legacy.js';import {photoJPEG} from './photo-fixtures.mjs';import {parseArtifact,cleanJPEG} from '../../src/life/story/share.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),output=process.env.LIFE_BROWSER_OUTPUT||resolve(tmpdir(),'ohmytrace-story-acceptance');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await ctx.route(url=>url.hostname.includes('nominatim'),route=>route.abort());
const f=storyFixture();let publicContext,publicServer;
const crc32=zlib.crc32||function(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
const dataset=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('ohmytrace.life',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('datasets').objectStore('datasets').get('canonical');r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};req.onerror=()=>reject(req.error);}));
async function download(button,name){const promise=page.waitForEvent('download');await page.locator(button).click();const file=await promise,bytes=await readFile(await file.path());await writeFile(resolve(output,name),bytes);return bytes;}
async function review(){await page.locator('[data-story-review]').click();await page.locator('[data-story-approve]').check();}
function unpack(bytes){const entries=new Map();let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const method=bytes.readUInt16LE(offset+8),crc=bytes.readUInt32LE(offset+14),size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);assert.equal(method,0);const name=bytes.subarray(offset+30,offset+30+length).toString(),start=offset+30+length+extra,data=bytes.subarray(start,start+size);assert.equal(crc32(data),crc,name);entries.set(name,data);offset=start+size;}assert.equal(bytes.readUInt32LE(offset),0x02014b50);return entries;}
try{
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#loader')||document.querySelector('#loader').classList.contains('out'));
  await page.locator('#btn-data').click();await page.locator('[data-tab=import]').click();await page.locator('#file').setInputFiles({name:'life.csv',mimeType:'text/csv',buffer:Buffer.from(exportLegacyCSV(f.data))});
  await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));await page.locator('#btn-life').click();
  for(const [title,start,end,indices]of [['新加坡硕士','2024','2026',[0,1]],['北京实习阶段','2025','2025',[0]]]){
    await page.locator('#chapter-form [name=title]').fill(title);await page.locator('#chapter-form [name=start]').fill(start);await page.locator('#chapter-form [name=end]').fill(end);
    await page.locator('#chapter-form details').first().locator('summary').click();await page.locator('[name=homeAnchors]').first().check();for(const i of indices)await page.locator('[name=relatedTripIds]').nth(i).check();
    await page.locator('#chapter-form button[type=submit]').click();await page.waitForFunction(title=>[...document.querySelectorAll('.life-chapter strong')].some(e=>e.textContent===title),title);
  }
  await page.locator('[data-life-close]').click();const before=await dataset();assert.equal(before.memories.length,0);
  await page.locator('[data-story-compose]').click();await page.waitForSelector('#story-composer[open]');
  await page.locator('[data-story-source]').selectOption(`chapter:${before.chapters[0].id}`);await page.locator('[data-story-generate]').click();
  await page.locator('[data-story-field=title]').fill('我的求学故事');await page.locator('[data-story-field=description]').fill('仅由已有足迹构成的虚构演示');
  const attack='<img src=x onerror="window.STORY_XSS=true">';await page.locator('[data-story-scene="0"] [data-story-scene-field=title]').fill(attack);
  const secondTitle=await page.locator('[data-story-scene="1"] [data-story-scene-field=title]').inputValue();await page.locator('[data-story-scene="1"] [data-story-move="-1"]').click();
  assert.equal(await page.locator('[data-story-scene="0"] [data-story-scene-field=title]').inputValue(),secondTitle);
  await page.locator('[data-story-scene="0"] [data-story-move="1"]').click();
  await page.screenshot({path:resolve(output,'01-composer.png')});
  await page.locator('[data-story-preview]').click();await page.waitForSelector('#story-player:not([hidden])');
  assert.match(await page.locator('#year-filter [data-act=all-years]').innerText(),/2$/,'Overview counts must reflect the minimal Story snapshot, including exclusion of undated private Trips');
  assert.equal(await page.locator('[data-story-scene-title]').innerText(),attack);assert.equal(await page.evaluate(()=>window.STORY_XSS),undefined);assert.equal(await page.locator('[data-story-scene-title] img').count(),0);
  await page.locator('[data-story-play]').click();assert.equal(await page.locator('#story-player').getAttribute('data-status'),'paused');
  await page.locator('[data-story-jump]').selectOption('3');await page.waitForTimeout(50);assert.equal(await page.locator('#story-player').getAttribute('data-status'),'paused');
  await page.locator('[data-story-next]').click();await page.locator('[data-story-previous]').click();
  await page.locator('[data-story-stop]').click();assert.equal(await page.locator('#story-player').getAttribute('data-status'),'stopped');
  await page.locator('[data-story-speed]').selectOption('4');
  await page.evaluate(()=>{window.storyTitles=[];new MutationObserver(()=>{const title=document.querySelector('[data-story-scene-title]')?.textContent;if(title&&!window.storyTitles.includes(title))window.storyTitles.push(title);}).observe(document.querySelector('#story-player'),{childList:true,subtree:true});});
  await page.locator('[data-story-play]').click();await page.waitForFunction(()=>document.querySelector('#story-player').dataset.status==='ended',null,{timeout:45000});
  const played=await page.evaluate(()=>window.storyTitles);assert.ok(played.includes('新加坡硕士'));assert.ok(played.includes('北京实习'));assert.ok(played.includes('继续探索这段人生'));
  await page.locator('[data-story-edit]').click();assert.deepEqual(await dataset(),before,'Composing and playback cannot modify canonical data');
  // Replay the whole selected life, including both overlapping Chapters and a
  // shared Trip, while explicitly excluding the private/unshared Trip.
  await page.locator('[data-story-source]').selectOption('all');await page.locator('[data-story-generate]').click();
  await page.locator('#story-composer summary').filter({hasText:'逐项审查旅行'}).click();await page.locator(`[data-story-trip="${before.trips[2].id}"]`).uncheck();
  await page.locator('[data-story-preview]').click();await page.locator('[data-story-speed]').selectOption('4');
  await page.evaluate(()=>{window.fullLifeTitles=[];new MutationObserver(()=>{const title=document.querySelector('[data-story-scene-title]')?.textContent;if(title&&!window.fullLifeTitles.includes(title))window.fullLifeTitles.push(title);}).observe(document.querySelector('#story-player'),{childList:true,subtree:true});});
  await page.waitForFunction(()=>document.querySelector('#story-player').dataset.status==='ended',null,{timeout:45000});
  const fullLifeTitles=await page.evaluate(()=>window.fullLifeTitles);assert.ok(fullLifeTitles.includes('新加坡硕士'));assert.ok(fullLifeTitles.includes('北京实习阶段'));assert.ok(!fullLifeTitles.includes('私人旅行'));
  await page.locator('[data-story-edit]').click();await page.locator('[data-story-source]').selectOption(`chapter:${before.chapters[0].id}`);await page.locator('[data-story-generate]').click();
  await page.locator('[data-story-scene="0"] [data-story-scene-field=title]').fill(attack);
  await page.locator('#story-composer summary').filter({hasText:'逐项审查旅行'}).click();await page.locator(`[data-story-trip="${before.trips[1].id}"]`).uncheck();
  await review();assert.equal(JSON.parse(await page.locator('[data-story-review-panel] pre').textContent()).trips.length,1);
  await page.locator('[data-story-field=description]').fill('修改后重新审查的虚构故事');assert.equal(await page.locator('[data-story-json]').isDisabled(),true);
  await page.locator('#story-composer summary').filter({hasText:'逐项审查旅行'}).click();await page.locator(`[data-story-trip="${before.trips[1].id}"]`).check();
  await review();const artifact=parseArtifact((await download('[data-story-json]','csv-only.story.json')).toString());
  assert.equal(artifact.memories.length,0);assert.equal(artifact.chapters.length,1);assert.equal(artifact.trips.length,2);
  for(const secret of ['PRIVATE_','秘密住宅','秘密地点',before.id,before.chapters[1].id,'1.312345','39.912345'])assert.equal(JSON.stringify(artifact).includes(secret),false,secret);
  const zip=await download('[data-story-package]','LifeStory-static.zip'),entries=unpack(zip);
  assert.equal(entries.has('src/life/repository.js'),false);assert.equal(entries.has('src/life/app-bridge.js'),false);assert.equal(entries.has('tests/life/story-fixtures.mjs'),false);assert.deepEqual(parseArtifact(entries.get('story.json').toString()),artifact);
  publicServer=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html',bytes=entries.get(path);if(!bytes){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(bytes);});
  await new Promise(r=>publicServer.listen(0,'127.0.0.1',r));const publicURL=`http://127.0.0.1:${publicServer.address().port}/`;
  publicContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'});
  await publicContext.addInitScript(()=>{window.storageReads=0;for(const name of ['indexedDB','localStorage'])Object.defineProperty(window,name,{configurable:true,get(){window.storageReads++;throw new Error('Viewer accessed private storage');}});});
  await publicContext.route('https://**/*',route=>route.abort());
  const viewer=await publicContext.newPage(),requests=[],viewerErrors=[];viewer.on('request',r=>requests.push(r.url()));viewer.on('pageerror',e=>{viewerErrors.push(e.message);console.error('Viewer page error:',e.stack);});
  viewer.on('console',message=>{if(message.type()==='error'&&/policy|rendering|Error|shader/i.test(message.text()))console.error('Viewer console:',message.text().slice(0,5000));});
  await viewer.goto(publicURL+'?dataset=ohmytrace.life&demo=private&artifact=/private.json&perf');await viewer.waitForSelector('#story-player:not([hidden])');
  await viewer.waitForFunction(()=>document.querySelector('#globe canvas').dataset.storyTerrain==='fallback');
  assert.equal(await viewer.evaluate(()=>window.storageReads),0);assert.ok(requests.map(r=>new URL(r).pathname).every(path=>!path.includes('repository.js')&&!path.includes('app-bridge.js')&&!path.includes('/media/')&&!path.includes('private.json')));
  // A packaged story may still be fetching when a visitor chooses a different
  // work. The explicit file selection must own the view and cancel the old fetch.
  const race=await publicContext.newPage(),raceErrors=[];race.on('pageerror',e=>raceErrors.push(e.message));
  let releaseDefault,defaultRequested;
  const heldDefault=new Promise(resolve=>{releaseDefault=resolve;}),requestedDefault=new Promise(resolve=>{defaultRequested=resolve;});
  await race.route(publicURL+'story.json',async route=>{defaultRequested();await heldDefault;await route.fulfill({contentType:'application/json',body:entries.get('story.json')}).catch(()=>{});});
  await race.goto(publicURL);await requestedDefault;
  const cancelledDefault=race.waitForEvent('requestfailed',{predicate:r=>r.url()===publicURL+'story.json'});
  const explicit={...artifact,title:'明确选择的另一份故事'};
  await race.locator('[data-story-file]').setInputFiles({name:'explicit.story.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(explicit))});
  await race.waitForFunction(title=>document.querySelector('#brand h1').textContent===title,explicit.title);
  releaseDefault();await cancelledDefault;
  assert.equal(await race.locator('#brand h1').innerText(),explicit.title);assert.equal(await race.evaluate(()=>window.storageReads),0);
  await race.close();assert.deepEqual(raceErrors,[]);
  assert.equal(await viewer.locator('[data-story-scene-title]').innerText(),attack);assert.equal(await viewer.evaluate(()=>window.STORY_XSS),undefined);
  await viewer.locator('[data-story-play]').click();await viewer.locator('[data-story-jump]').selectOption('2');await viewer.locator('[data-story-jump]').selectOption('5');await viewer.locator('[data-story-jump]').selectOption('1');
  assert.equal(await viewer.locator('#story-player').getAttribute('data-status'),'paused');
  await viewer.locator('[data-story-explore]').click();const canvas=viewer.locator('#globe canvas').first(),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});
  await viewer.locator('#btn-list').click();await viewer.waitForSelector('#list-body .item');
  await viewer.setViewportSize({width:390,height:844});await viewer.waitForTimeout(300);const rect=await viewer.locator('#story-player').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);
  await viewer.screenshot({path:resolve(output,'02-independent-mobile-viewer.png')});
  await viewer.locator('[data-story-close]').click();await viewer.locator('[data-story-file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...artifact,schemaVersion:99}))});await viewer.waitForFunction(()=>document.querySelector('[data-story-load-error]').textContent.includes('版本'));
  // Restore fictional photo/Memory data through the normal JSON Restore UI.
  await page.locator('[data-story-composer-close]').click();await page.locator('#btn-life').click();page.once('dialog',d=>d.accept());await page.locator('[data-life-restore]').setInputFiles({name:'fictional-life.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.data))});
  await page.waitForSelector(`[data-life-edit="${f.chapter}"]`);await page.locator('[data-life-close]').click();
  await page.locator('[data-story-compose]').click();await page.locator('[data-story-source]').selectOption(`chapter:${f.chapter}`);await page.locator('[data-story-generate]').click();
  await page.locator('[data-story-policy=includePhotos]').check();await page.locator('summary').filter({hasText:'逐张选择记忆'}).click();await page.locator(`[data-story-memory="${f.photo}"]`).check();
  await page.locator(`[data-story-image="${f.photo}"]`).setInputFiles({name:'approved-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photoJPEG({lat:39.912345,lon:116.412345,time:'2025:05:01 10:00:00',offset:'+08:00',nonce:99}))});
  await page.waitForFunction(()=>document.querySelector('#story-composer').textContent.includes('已生成去除 EXIF 的缩略图'));
  await review();const photoArtifact=parseArtifact((await download('[data-story-json]','with-photo.story.json')).toString());
  assert.equal(photoArtifact.memories.length,1);assert.ok(photoArtifact.memories[0].image);assert.equal(JSON.stringify(photoArtifact).includes('PRIVATE_'),false);cleanJPEG(Buffer.from(photoArtifact.memories[0].image.split(',')[1],'base64'),{reject:true});
  const beforeMobile=await dataset();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-story-field=title]').fill('移动端 · 求学足迹');
  await page.locator('[data-story-scene="0"] [data-story-scene-field=description]').fill('在窄屏编辑的故事说明');
  await page.locator('[data-story-field=visualTheme]').selectOption('paper');
  const composerBox=await page.locator('#story-composer').boundingBox();assert.ok(composerBox.x>=0&&composerBox.x+composerBox.width<=390);
  assert.equal(await page.locator('#story-composer').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Mobile composer must not overflow horizontally');
  await page.screenshot({path:resolve(output,'05-mobile-composer.png')});
  await page.locator('[data-story-preview]').click();await page.locator('[data-story-play]').click();
  await page.locator('[data-story-edit]').click();assert.equal(await page.locator('[data-story-field=title]').inputValue(),'移动端 · 求学足迹');
  assert.equal(await page.locator('[data-story-field=visualTheme]').inputValue(),'paper');
  await review();const mobileArtifact=parseArtifact((await download('[data-story-json]','mobile-edited.story.json')).toString());
  assert.equal(mobileArtifact.title,'移动端 · 求学足迹');assert.equal(mobileArtifact.orderedScenes[0].description,'在窄屏编辑的故事说明');
  assert.deepEqual(await dataset(),beforeMobile,'Responsive composing and export must preserve the persisted private Dataset and revision');
  await viewer.locator('[data-story-file]').setInputFiles({name:'with-photo.story.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(photoArtifact))});await viewer.waitForSelector('#story-player:not([hidden])');
  await viewer.locator('[data-story-play]').click();const memoryIndex=photoArtifact.orderedScenes.findIndex(s=>s.kind==='memory');await viewer.locator('[data-story-jump]').selectOption(String(memoryIndex));
  await viewer.waitForFunction(()=>document.querySelector('.story-memory-image')?.naturalWidth>0);assert.equal(await viewer.evaluate(()=>window.storageReads),0);
  await viewer.screenshot({path:resolve(output,'03-approved-memory.png')});
  const motion=await publicContext.newPage(),motionErrors=[];motion.on('pageerror',e=>motionErrors.push(e.message));await motion.emulateMedia({reducedMotion:'no-preference'});
  await motion.goto(publicURL);await motion.waitForSelector('#story-player:not([hidden])');await motion.locator('[data-story-play]').click();
  await motion.locator('[data-story-jump]').selectOption('2');await motion.waitForTimeout(80);await motion.locator('[data-story-jump]').selectOption('3');await motion.waitForTimeout(80);await motion.locator('[data-story-jump]').selectOption('0');
  await motion.waitForFunction(()=>document.querySelector('#globe canvas').dataset.cameraPhase==='global',null,{timeout:6000});await motion.waitForTimeout(1900);
  assert.equal(await motion.locator('[data-story-scene-title]').innerText(),attack);assert.equal(await motion.locator('#globe canvas').getAttribute('data-camera-phase'),'global');assert.deepEqual(motionErrors,[]);
  motion.removeAllListeners('pageerror');await motion.close();
  await viewer.close();
  if(viewerErrors.length)console.error('Viewer errors:',viewerErrors);
  assert.deepEqual(errors,[]);assert.deepEqual(viewerErrors,[]);
  const result={result:'PASS',csvOnly:true,overlappingChapters:true,sceneEditing:true,fullPlayback:true,fullLifePlayback:true,sharedTripAcrossChapters:true,transport:true,privacyProjection:true,staticZipFiles:entries.size,staticZipBytes:zip.length,independentViewer:true,storageReads:0,externalResourcesBlocked:true,mobile:true,mobileComposer:true,approvedPhoto:true,normalMotionCancellation:true,latestSelectionWins:true,closeLifecycle:true,pageErrors:[],output};
  await writeFile(resolve(output,'story-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){await page.screenshot({path:resolve(output,'failure-private.png')}).catch(()=>{});console.error('Page errors:',errors,'Composer error:',await page.locator('[data-story-error]').allTextContents());throw error;}
finally{await publicContext?.close();if(publicServer)await new Promise(r=>publicServer.close(r));await ctx.close();await browser.close();await new Promise(r=>server.close(r));}
