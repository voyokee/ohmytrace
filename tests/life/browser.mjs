// Optional end-to-end acceptance: PLAYWRIGHT_MODULE points at a Playwright package
// when it is supplied by the host rather than installed in this static project.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.LIFE_BROWSER_OUTPUT||resolve(tmpdir(),'ohmytrace-life-acceptance');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try {const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const dataset=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('ohmytrace.life',1);req.onsuccess=()=>{const db=req.result,read=db.transaction('datasets').objectStore('datasets').get('canonical');read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};req.onerror=()=>reject(req.error);}));
const fixture='日期,行程,地点,类型,备注,坐标\n2024~2026,,新加坡,现居地,,"1.3,103.8"\n2025-05-01~2025-05-03,北京实习,北京,旅行,回忆,"39.9,116.4"\n2025-05-01~2025-05-03,北京实习,天津,旅行,,"39.1,117.2"\n2026-06,深圳之行,深圳,旅行,,"22.54,114.05"';
try {
  await page.goto(url+'?perf');await page.waitForSelector('#globe canvas');
  await page.waitForFunction(()=>!document.querySelector('#loader')||document.querySelector('#loader').classList.contains('out'),null,{timeout:60000});
  await page.waitForSelector('body.is-empty #empty-photos');assert.equal(await page.locator('#btn-data').isVisible(),false);assert.equal(await dataset(),undefined);
  await page.screenshot({path:resolve(output,'01-new-browser.png')});
  await page.locator('#empty-demo').click();await page.waitForSelector('[data-act=exit-demo]');assert.equal(await page.locator('[data-story-compose]').count(),0);assert.equal(await dataset(),undefined);
  await page.locator('[data-act=exit-demo]').click();await page.waitForSelector('body.is-empty #empty-demo');assert.equal(await dataset(),undefined);
  await page.locator('#empty-import').click();await page.locator('[data-tab=import]').click();
  await page.locator('#file').setInputFiles({name:'history.csv',mimeType:'text/csv',buffer:Buffer.from(fixture)});
  await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));
  let d=await dataset();assert.equal(d.trips.length,2);assert.equal(d.places.length,4);assert.equal(d.meta.origin,'user');
  const timelineYears=()=>page.locator('#tl-track .tl-year[data-year]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.year)));
  assert.deepEqual(await timelineYears(),[2025,2026],'Residence coverage alone must not add empty years to the timeline');
  await page.locator('#btn-life').click();
  const add=async(title,start,end,tripIndices)=>{
    await page.locator('#chapter-form [name=title]').fill(title);await page.locator('#chapter-form [name=start]').fill(start);await page.locator('#chapter-form [name=end]').fill(end);
    await page.locator('#chapter-form details').first().locator('summary').click();
    await page.locator('[name=homeAnchors]').first().check();
    for(const i of tripIndices)await page.locator('[name=relatedTripIds]').nth(i).check();
    await page.locator('#chapter-form button[type=submit]').click();
    await page.waitForFunction(title=>[...document.querySelectorAll('.life-chapter strong')].some(x=>x.textContent===title),title);
  };
  await add('新加坡硕士','2024','2026',[0,1]);await add('北京实习','2025','2025',[0]);
  d=await dataset();assert.equal(d.chapters.length,2);assert.ok(d.chapters.every(c=>c.relatedTripIds.includes(d.trips[0].id)));
  await page.screenshot({path:resolve(output,'02-overlapping-chapters.png')});
  await page.locator(`[data-life-view="${d.chapters[1].id}"]`).click();
  assert.equal(await page.locator('#life-dialog').isVisible(),false,'Closed Chapter dialog must release the globe and other controls');
  assert.equal(await page.locator('#list-count').innerText(),'1');assert.equal(await page.locator('#tl-track [data-id]').count(),2);
  assert.deepEqual(await timelineYears(),[2025],'Chapter and residence bounds must not add years without scoped Trip records');
  await page.waitForTimeout(2200);await page.locator('[data-act=all-years]').click();
  assert.equal(await page.locator('#list-count').innerText(),'2','All years must exit Chapter scope');
  assert.equal(await page.locator('#markers .mk[title="深圳"]').count(),1,'Exiting Chapter must restore other map footprints');
  await page.locator('#year-filter [data-year="2026"]').click();assert.equal(await page.locator('#list-count').innerText(),'1');assert.match(await page.locator('#list-body').innerText(),/深圳之行/);
  await page.locator('[data-act=all-years]').click();assert.equal(await page.locator('#list-count').innerText(),'2');
  await page.locator(`[data-life-scope="${d.chapters[1].id}"]`).click();
  await page.locator('#list-body .item').filter({hasText:'北京实习'}).click();await page.waitForSelector('#card.show');assert.match(await page.locator('#card h2').innerText(),/北京实习/);
  await page.locator('#card [data-record-kind=place]').first().click();
  await page.waitForTimeout(2500);await page.screenshot({path:resolve(output,'03-chapter-trip-place.png')});
  await page.locator('#btn-tone').click();assert.equal(await page.locator('#btn-tone').getAttribute('aria-pressed'),'true');
  await page.locator('#btn-tone').click();assert.equal(await page.locator('#btn-tone').getAttribute('aria-pressed'),'false');
  await page.locator('#btn-play').click();await page.waitForFunction(()=>document.querySelector('#btn-play').title==='停止回放');await page.waitForTimeout(2000);
  assert.match(await page.locator('#tl-status').innerText(),/从这里出发|北京实习|1/);await page.locator('#btn-play').click();
  await page.reload();await page.waitForSelector('#chapter-filter [data-life-scope]');
  assert.deepEqual((await dataset()).chapters,d.chapters);await page.locator(`[data-life-scope="${d.chapters[1].id}"]`).click();assert.equal(await page.locator('#list-count').innerText(),'1');
  await page.locator('#btn-life').click();const downloadPromise=page.waitForEvent('download');await page.locator('[data-life-backup]').click();const download=await downloadPromise;const backup=await readFile(await download.path(),'utf8');assert.deepEqual(JSON.parse(backup).chapters,d.chapters);
  await page.screenshot({path:resolve(output,'04-reloaded-relations.png')});
  await page.locator('#chapter-form [name=title]').fill('只有学习，没有旅行');await page.locator('#chapter-form [name=start]').fill('2020');await page.locator('#chapter-form [name=end]').fill('2024');
  await page.locator('#chapter-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.life-chapter').length===3);
  const noTravel=(await dataset()).chapters[2];await page.locator(`[data-life-view="${noTravel.id}"]`).click();
  assert.equal(await page.locator('#list-count').innerText(),'0');
  assert.deepEqual(await timelineYears(),[],'A Chapter without Trips retains its period band without empty year ticks');
  assert.notEqual(await page.locator('#timeline').evaluate(e=>getComputedStyle(e).pointerEvents),'none','Chapter without Trips must retain accessible timeline and scope controls');
  await page.locator('[data-life-scope=""]').click();await page.locator('#btn-life').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator(`[data-life-delete="${noTravel.id}"]`).click();await page.waitForFunction(()=>document.querySelectorAll('.life-chapter').length===2);
  // Edit and delete operate on Chapters only; restore must recover all relations.
  await page.locator(`[data-life-edit="${d.chapters[1].id}"]`).click();await page.locator('#chapter-form [name=title]').fill('北京实习 · 修订');await page.locator('#chapter-form button[type=submit]').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.life-chapter strong')].some(e=>e.textContent==='北京实习 · 修订'));
  assert.equal((await dataset()).chapters[1].id,d.chapters[1].id);
  page.once('dialog',dialog=>dialog.accept());await page.locator(`[data-life-delete="${d.chapters[1].id}"]`).click();
  await page.waitForFunction(()=>document.querySelectorAll('.life-chapter').length===1);
  assert.equal((await dataset()).trips.length,2);assert.equal((await dataset()).places.length,4);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-life-restore]').setInputFiles({name:'LifeAtlas.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await page.waitForFunction(()=>document.querySelectorAll('.life-chapter').length===2);assert.deepEqual((await dataset()).chapters,d.chapters);
  // Reuse the original map-pick correction and CSV export UI.
  await page.locator('[data-life-close]').click();await page.locator('#btn-data').click();await page.locator('[data-tab=places]').click();
  const placeBefore=(await dataset()).places.find(p=>p.name==='北京');
  await page.locator('.pl[data-name="北京"] [data-act=pick]').click();await page.waitForTimeout(2200);
  const canvas=page.locator('#globe canvas').first(),box=await canvas.boundingBox();await canvas.click({position:{x:box.width/2,y:box.height/2}});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已把'));
  const placeAfter=(await dataset()).places.find(p=>p.name==='北京');assert.equal(placeAfter.id,placeBefore.id);assert.ok(placeAfter.evidenceIds.length>placeBefore.evidenceIds.length);
  await page.locator('#btn-data').click();await page.locator('[data-tab=import]').click();
  const csvDownloadPromise=page.waitForEvent('download');await page.locator('[data-act=export]').click();const csvDownload=await csvDownloadPromise;
  const exportedCSV=await readFile(await csvDownload.path(),'utf8');assert.match(exportedCSV,/visit_id,place_id,trip_id/);assert.match(exportedCSV,/北京实习/);await page.locator('#modal-close').click();
  // Real IndexedDB transaction abort: rejected edit leaves both committed data
  // and the open editor intact, without a false success notification.
  await page.locator('#btn-data').click();await page.locator('[data-tab=edit]').click();
  await page.locator('[data-i="1"][data-k=note]').fill('this must not be committed');const beforeError=await dataset();
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);this.transaction.abort();IDBObjectStore.prototype.put=put;return r;};});
  await page.locator('[data-act=save-rows]').click();await page.waitForSelector('#life-storage-error:visible');
  assert.deepEqual(await dataset(),beforeError);assert.ok(await page.locator('#modal').evaluate(e=>document.body.classList.contains('modal-open')));
  assert.equal(await page.locator('[data-i="1"][data-k=note]').inputValue(),'this must not be committed');
  await page.locator('[data-i="1"][data-k=note]').fill('已验证的用户修订');await page.locator('[data-act=save-rows]').click();
  await page.waitForFunction(()=>!document.body.classList.contains('modal-open'));assert.equal((await dataset()).visits[1].legacy.note,'已验证的用户修订');
  assert.deepEqual((await dataset()).chapters,d.chapters);
  await page.reload();await page.waitForSelector('#chapter-filter [data-life-scope]');
  await page.setViewportSize({width:390,height:844});await page.locator('#btn-life').click();
  assert.ok(await page.locator('#life-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  await page.screenshot({path:resolve(output,'05-mobile-chapters.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['new-browser demo is ephemeral','CSV file import and export','overlapping Chapter CRUD','shared Trip relationships','scoped map/list/timeline and year reset','Chapter without Trips','Trip and Place flights','day/night','Trip Replay','reload persistence','JSON backup and restore','manual coordinate correction','failed edit preserves data and draft','successful edit preserves IDs and relationships','mobile layout'],output,entities:{trips:d.trips.length,chapters:d.chapters.length,places:d.places.length},pageErrors:errors},null,2));
  // Distinct old browser states, migration failure and pending-marker resume,
  // using actual IndexedDB transactions (not the MemoryStore test boundary).
  for(const failAt of [0,1,2]) {
    const ctx=await browser.newContext({viewport:{width:1000,height:850}});
    const old={rows:[{date:'2025-05',trip:'旧旅行',place:'北京',type:'旅行',note:'原始记录'}],places:{北京:{lat:39.9,lon:116.4,status:'confirmed'}}};
    await ctx.addInitScript(({old,failAt})=>{
      if(!sessionStorage.getItem('seeded')){localStorage.setItem('footprints.v1',JSON.stringify(old));sessionStorage.setItem('seeded','1');}
      if(failAt&&!sessionStorage.getItem('aborted')){const put=IDBObjectStore.prototype.put;let writes=0;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);if(++writes===failAt){sessionStorage.setItem('aborted','1');this.transaction.abort();}return r;};}
    },{old,failAt});
    const tab=await ctx.newPage();await tab.goto(url);await tab.waitForSelector('#globe canvas');
    if(failAt){await tab.waitForSelector('#life-storage-error:visible');assert.equal(await tab.locator('#btn-life').isDisabled(),true);await tab.reload();}
    await tab.waitForFunction(()=>!document.querySelector('#btn-life').disabled&&document.querySelector('#list-count').textContent==='1');
    const migrated=await tab.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('ohmytrace.life');req.onsuccess=()=>{const db=req.result,r=db.transaction('datasets').objectStore('datasets').get('canonical');r.onsuccess=()=>{resolve(r.result);db.close();};};}));
    assert.equal(migrated.meta.migration.status,'complete');assert.equal(migrated.visits.length,1);
    assert.deepEqual(await tab.evaluate(()=>JSON.parse(localStorage.getItem('footprints.v1'))),old);
    await tab.reload();await tab.waitForFunction(()=>document.querySelector('#list-count').textContent==='1');await ctx.close();
  }
  console.log('PASS: real IndexedDB legacy migration, aborted first write, interrupted completion marker, reload recovery; legacy storage preserved');
} finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
