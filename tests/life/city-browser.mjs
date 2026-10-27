// Real app navigation, isolated browser storage and fictional travel history.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(tmpdir(),'ohmytrace-city-acceptance');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try {const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const rows=[
  ['2024~至今','','新加坡','现居地','1.3,103.8'],
  ['2015~2020','','成都','曾居地','30.57,104.07'],
  ['2021-05','成都重访','成都','旅行','30.57,104.07'],
  ['2023-01','云南初访','昆明','旅行','25.04,102.71'],
  ['2025-02','云南重访','昆明','旅行','25.04,102.71'],
  ['2025-02','云南重访','丽江','旅行','26.87,100.23']
].map(([date,trip,place,type,coordinates])=>({date,trip,place,type,note:'',coordinates}));
await context.addInitScript(rows=>{if(!localStorage.getItem('footprints.v1'))localStorage.setItem('footprints.v1',JSON.stringify({rows,places:Object.fromEntries(rows.map(r=>{const [lat,lon]=r.coordinates.split(',').map(Number);return [r.place,{lat,lon,status:'confirmed'}];}))}));},rows);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const city=name=>page.locator('#markers .mk').filter({has:page.locator(`.mk-label`)}) // activation also supports keyboard/screen readers
  .evaluateAll((nodes,name)=>{const node=nodes.find(n=>n.title===name);if(!node)throw Error('Missing marker '+name);node.click();},name);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?perf`);
  await page.waitForSelector('#globe canvas');
  await page.waitForFunction(()=>document.querySelector('#list-count')?.textContent==='3'&&document.querySelector('#loader')?.classList.contains('out'),null,{timeout:60000});
  // A single-visit city opens the common city card before selecting a journey.
  await city('丽江');assert.equal(await page.locator('#card[data-record-kind=place].show').isVisible(),true);assert.equal(await page.locator('#card h2').innerText(),'丽江');
  assert.match(await page.locator('#card').innerText(),/相关旅程 · 1/);
  await city('昆明');assert.match(await page.locator('#card').innerText(),/相关旅程 · 2/);
  assert.deepEqual(await page.locator('#card .record-links [data-record-kind=trip] strong').allTextContents(),['云南重访','云南初访']);
  await page.locator('#card .record-links [data-record-kind=trip]').first().click();assert.equal(await page.locator('#card h2').innerText(),'云南重访');assert.equal(await page.locator('#card').getAttribute('data-record-kind'),'trip');
  await city('昆明');assert.equal(await page.locator('#card').getAttribute('data-record-kind'),'place');assert.equal(await page.locator('#card .record-links [data-record-kind=trip]').count(),2);
  await city('新加坡');assert.match(await page.locator('#card').innerText(),/居住城市/);assert.equal(await page.locator('#card .record-links [data-record-kind=trip]').count(),0);
  await city('成都');assert.match(await page.locator('#card').innerText(),/曾住城市/);assert.match(await page.locator('#card').innerText(),/相关旅程 · 1/);
  await page.setViewportSize({width:390,height:844});await city('昆明');const bounds=await page.locator('#card').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
  await page.screenshot({path:resolve(output,'city-mobile.png')});
  await page.reload();await page.waitForSelector('#markers .mk',{state:'attached'});await city('昆明');assert.equal(await page.locator('#card .record-links [data-record-kind=trip]').count(),2);
  assert.deepEqual(errors,[]);console.log('PASS: single/repeated visits, current/former residence, revisit after residence, explicit journey selection, mobile and reload');
  console.log('Screenshot: '+resolve(output,'city-mobile.png'));
} finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
