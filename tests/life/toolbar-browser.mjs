import {openTool} from './browser-tools.mjs';
// Mobile toolbar and real sharing flow, with isolated storage and fictional data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(tmpdir(),'ohmytrace-toolbar-acceptance');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await context.route(url=>url.hostname.includes('nominatim'),route=>route.abort());
const closeShare=()=>page.locator('[data-story-composer-close]').click();
const openShare=async()=>{await page.locator('#btn-share').tap();assert.equal(await page.locator('#story-composer[open]').isVisible(),true,'Top share must open the composer from the current app state: '+errors.join('; '));};
const shareSource=()=>page.locator('[data-share-range].on').getAttribute('data-share-range');
const geometry=()=>page.locator('#toolbar>.tb:visible').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#story-composer',{state:'attached'});
  await page.waitForFunction(()=>!document.querySelector('#loader')||document.querySelector('#loader').classList.contains('out'));
  if(process.env.TOOLBAR_TEST_MODE!=='preview'){
  const buttons=await geometry();
  assert.deepEqual(buttons.map(b=>b.id),['btn-share','btn-photos','btn-my'],'Every width shows only the three main actions');
  assert.ok(buttons.every(b=>b.width===42&&b.height===42),'Each mobile action has a 42px target');
  assert.equal(await page.locator('#btn-share').isDisabled(),true,'Empty data cannot be shared');
  }
  await page.locator('#empty-import').click();await page.locator('[data-tab=import]').click();
  const csv='日期,行程,地点,类型,备注,坐标\n2024~至今,,新加坡,现居地,,"1.3,103.85"\n2023-01,云南初访,昆明,旅行,,"25.04,102.71"\n2025-02,云南重访,昆明,旅行,,"25.04,102.71"\n2025-03,四川之行,成都,旅行,,"30.57,104.07"';
  await page.locator('#file').setInputFiles({name:'fictional-trips.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>!document.body.classList.contains('modal-open')&&document.querySelector('#list-count')?.textContent==='3');
  assert.equal(await page.locator('#btn-share').isEnabled(),true);
  if(process.env.TOOLBAR_TEST_MODE!=='preview'){
  await openShare();assert.equal(await shareSource(),'all');assert.match(await page.locator('.share-summary').innerText(),/3 次旅行/);await closeShare();
  await page.locator('#year-filter [data-year="2023"]').click();await openShare();
  assert.equal(await shareSource(),'year:2023','Older selected years remain visible and selected in the share sheet');assert.match(await page.locator('.share-summary').innerText(),/1 次旅行/);await closeShare();
  }
  await page.locator('#year-filter [data-year="2025"]').click();await page.locator('#tl-track').getByRole('button',{name:/2025 年 2 月/}).click();
  await page.waitForSelector('body.card-open');await openShare();assert.match(await shareSource(),/^trip:/,'Open journey takes priority over selected year');
  await page.locator('[data-story-preview]').click();await page.waitForSelector('body.story-readonly #story-player:not([hidden])');
  await openShare();assert.match(await shareSource(),/^trip:/,'Sharing stays available during preview');
  await page.locator('[data-share-range="all"]').click();assert.match(await page.locator('.share-summary').innerText(),/3 次旅行/,'Preview sharing reads the full private dataset, not the minimal playback artifact');await closeShare();
  await page.locator('[data-story-close]').click();
  await page.locator('#btn-my').tap();await page.locator('#my-dialog[open]').waitFor();
  for(const section of ['备份与恢复','导出','人生阶段','显示','隐私说明','记录列表'])assert.ok((await page.locator('#my-dialog').innerText()).includes(section),section);
  assert.equal(await page.locator('#my-advanced').evaluate(e=>e.open),false);
  const night=await page.locator('body').evaluate(e=>e.classList.contains('night-mode'));await page.locator('#btn-tone').tap();assert.equal(await page.locator('#my-dialog').isVisible(),false);assert.notEqual(await page.locator('body').evaluate(e=>e.classList.contains('night-mode')),night);await page.keyboard.press('n');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('night-mode')),night);
  await openTool(page,'#btn-life');await page.waitForSelector('#life-dialog[open]');
  await page.locator('#chapter-form [name=title]').fill('云南阶段');await page.locator('#chapter-form [name=start]').fill('2023');await page.locator('#chapter-form [name=end]').fill('2025');
  await page.locator('#chapter-form details').first().locator('summary').click();await page.locator('#chapter-form [name=relatedTripIds]').first().check();
  await page.locator('#chapter-form button[type=submit]').click();await page.waitForSelector('[data-life-view]');await page.locator('[data-life-view]').first().click();
  await openShare();assert.match(await shareSource(),/^chapter:/,'A stage card shares that stage');await closeShare();
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:844});const buttons=await geometry();assert.equal(buttons.length,3);assert.ok(buttons.every(b=>b.width===42&&b.height===42&&b.x>=0&&b.right<=width));
    const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {titleRight:box('#brand h1').right,toolbarLeft:box('#toolbar').left,titleBottom:box('#brand h1').bottom,toolbarTop:box('#toolbar').top,statsTop:box('#stats').top,toolbarBottom:box('#toolbar').bottom};});
    assert.ok(layout.titleRight<=layout.toolbarLeft||layout.titleBottom<=layout.toolbarTop,'Title and buttons must not overlap');assert.ok(layout.statsTop>=layout.toolbarBottom,'Stats start below the touch targets');
  }
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,bottom:34,left:0,right:20}});
  await page.setViewportSize({width:390,height:844});
  const safe=await geometry();assert.ok(safe.every(b=>b.y>=57&&b.right<=370),'Buttons stay below a 47px top cutout and inside the right safe area');
  await page.locator('#btn-my').tap();const drawer=await page.locator('#my-dialog').boundingBox();assert.ok(drawer.x>=0&&drawer.x+drawer.width<=390);await page.screenshot({path:resolve(output,'mobile-my-panel.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#my-dialog').isVisible(),false);assert.equal(await page.locator('#btn-my').evaluate(e=>document.activeElement===e),true);
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});await page.setViewportSize({width:1440,height:1000});assert.equal((await geometry()).length,3);await openTool(page,'#btn-data');await page.locator('[data-tab=places]').click();assert.equal(await page.locator('#places-body').count()||await page.locator('.pl').count()>0,true);await page.locator('#modal-close').click();await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('PASS: three main targets, My sections, N/Esc, empty/all/year/trip/Chapter/preview share scope, 320–430px layout and desktop');console.log('Screenshot: '+resolve(output,'mobile-my-panel.png'));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
