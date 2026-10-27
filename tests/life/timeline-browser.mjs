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
try {
  await page.goto(url);await page.waitForSelector('#globe canvas');
  await page.waitForFunction(()=>!document.querySelector('#loader')||document.querySelector('#loader').classList.contains('out'),null,{timeout:60000});
  await page.locator('#empty-demo').click();await page.waitForFunction(()=>document.querySelectorAll('#tl-track .tl-dot').length===4);
  const first=await page.locator('#tl-track .tl-dot').first().evaluate(e=>parseFloat(e.style.left));
  assert.ok(first<25,`First recorded year must occupy the first timeline slot, not leave an empty residence-only span (${first}%)`);
  assert.equal(await page.locator('#btn-life svg').count(),1);
  assert.equal(await page.locator('#btn-photos svg').count(),1);
  assert.equal(await page.locator('#btn-life').getAttribute('aria-label'),'人生阶段');
  assert.equal(await page.locator('#btn-photos').getAttribute('aria-label'),'从相册恢复足迹');
  await page.setViewportSize({width:910,height:1220});
  await page.waitForTimeout(1500);await page.screenshot({path:resolve(output,'timeline-demo.png')});
  const fixture='日期,行程,地点,类型,备注,坐标\n2000~至今,,上海,现居地,,"31.23,121.47"\n'+
    [2008,2010,2012,2014,2016,2018,2020,2022,2024,2025].map(y=>`${y}-06,旅行 ${y},北京,旅行,,"39.9,116.4"`).join('\n');
  await page.locator('#btn-data').click();await page.locator('[data-tab=import]').click();
  await page.locator('#file').setInputFiles({name:'timeline.csv',mimeType:'text/csv',buffer:Buffer.from(fixture)});
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='10');
  const viewport=page.locator('.tl-main');
  const atLatest=()=>page.waitForFunction(()=>{const e=document.querySelector('.tl-main');return e.scrollWidth>e.clientWidth&&Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2;});
  await atLatest();
  assert.deepEqual(await page.locator('#tl-track .tl-year').evaluateAll(nodes=>nodes.map(e=>+e.dataset.year)),[2008,2010,2012,2014,2016,2018,2020,2022,2024,2025]);
  assert.ok(await page.locator('#tl-track .tl-year').last().evaluate(e=>{const r=e.getBoundingClientRect(),v=e.closest('.tl-main').getBoundingClientRect();return r.left>=v.left&&r.right<=v.right;}),'Latest year must be visible by default');
  await viewport.focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('.tl-main').scrollLeft===0);
  await page.locator('#tl-track .tl-dot').first().click();
  assert.equal(await viewport.evaluate(e=>e.scrollLeft),0,'Trip selection must preserve the browsing position');
  await viewport.focus();await page.keyboard.press('End');await atLatest();
  await viewport.hover();await page.mouse.wheel(-600,0);
  await page.waitForFunction(()=>{const e=document.querySelector('.tl-main');return e.scrollLeft<e.scrollWidth-e.clientWidth-100;});
  await viewport.focus();await page.keyboard.press('End');await atLatest();
  await page.locator('#card [data-record-action=close]').click();
  await page.setViewportSize({width:390,height:844});await atLatest();
  await page.waitForTimeout(1600);
  await page.screenshot({path:resolve(output,'timeline-mobile-latest.png')});
  await viewport.focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('.tl-main').scrollLeft===0);
  await page.screenshot({path:resolve(output,'timeline-mobile-earliest.png')});
  await page.setViewportSize({width:910,height:1220});
  await page.waitForTimeout(100);
  assert.equal(await viewport.evaluate(e=>e.scrollLeft),0,'Resize must preserve a deliberate move to older history');
  await viewport.focus();await page.keyboard.press('End');await atLatest();
  await page.setViewportSize({width:1440,height:1000});await atLatest();
  await page.reload();await page.waitForSelector('#tl-track .tl-dot');await atLatest();
  // Selecting a year uses only its recorded month span, not a blank January–December rail.
  await page.locator('#year-filter [data-year="2025"]').click();
  await page.waitForFunction(()=>document.querySelector('#list-count').textContent==='1');
  assert.deepEqual(await page.locator('#tl-track .tl-month').allTextContents(),['6月']);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: record-driven timeline domain, SVG entries, sparse years, horizontal scrolling, latest default, resize, selection, refresh and month range');
} finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
