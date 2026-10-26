import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {browserTarget} from './browser-target.mjs';
const target=await browserTarget(process.env.LIFE_APP_URL||'http://127.0.0.1:8765/?perf=1');
const output=process.env.LIFE_BROWSER_OUTPUT||resolve('outputs/mobile-editor');await mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.LIFE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFE_BROWSER_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:420,height:820},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
await target.authorize(context);await context.addInitScript(()=>Object.defineProperty(navigator,'deviceMemory',{get:()=>8}));
page.on('pageerror',error=>errors.push(error.message));
const metrics=async()=>JSON.parse(await page.locator('#performance-metrics').textContent());
const geometry=()=>page.evaluate(()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const viewport=box('.tl-main');
  return {width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,brand:box('#brand'),toolbar:box('#toolbar'),title:box('#brand h1'),timeline:box('#timeline'),card:box('#card'),viewport,
    years:[...document.querySelectorAll('#tl-track .tl-year')].map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};
});
try{
  await page.goto(target.url);await page.waitForFunction(()=>document.querySelector('#loader')?.classList.contains('out'));
  await page.waitForFunction(()=>{const el=document.querySelector('#performance-metrics');if(!el?.textContent?.trim())return false;const m=JSON.parse(el.textContent);return m.quality==='still'&&m.pixelRatio===3&&m.worldReady&&m.earthTexture===5400;},null,{timeout:60000});
  const global=await metrics(),initial=await geometry();
  assert.equal(global.renderPixels,'1260×2460');assert.equal(initial.timeline.height,92);assert.ok(initial.brand.height<110);
  assert.ok(initial.title.right<initial.toolbar.x);assert.equal(initial.years.length,4);
  for(const year of initial.years){assert.ok(year.left>=initial.viewport.x&&year.right<=initial.viewport.right,year.text+' should fit horizontally');assert.ok(year.top>=initial.viewport.y&&year.bottom<=initial.viewport.bottom,year.text+' should not be clipped vertically');}
  await page.screenshot({path:resolve(output,'mobile-global-clear.png')});
  const touch=await context.newCDPSession(page),clusterTaps=[];
  for(let attempt=0;attempt<6;attempt++){
    if(attempt){await page.locator('#btn-home').tap();await page.waitForTimeout(100);}
    const point=await page.evaluate(()=>{
      for(const el of document.querySelectorAll('.mk-cluster[aria-hidden=false]')){
        const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        if(document.elementFromPoint(x,y)?.closest('.mk-cluster')===el)return {x,y,count:Number(el.querySelector('.cluster-count').textContent),width:r.width};
      }
      return null;
    });
    assert.ok(point,'A visible cluster must be available');assert.equal(point.width,44);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await page.waitForTimeout(120);
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+2,y:point.y+1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForSelector('#map-chooser:not([hidden])',{timeout:2000});await page.waitForTimeout(250);
    assert.equal(await page.locator('#map-chooser').isVisible(),true,'One tap must keep the chooser open after the next camera frame');
    assert.equal(await page.locator('#map-chooser .chooser-item').count(),point.count);
    clusterTaps.push({attempt:attempt+1,count:point.count,oneTap:true});
    await page.getByRole('button',{name:'关闭足迹详情',exact:true}).tap();
  }
  await page.locator('#tl-track').getByRole('button',{name:'独库公路',exact:true}).tap();await page.waitForSelector('#card.show');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#card')).opacity==='1');
  const compact=await geometry();assert.ok(compact.card.height<=140);assert.ok(compact.card.bottom<compact.timeline.y);
  assert.ok(compact.card.y-compact.brand.bottom>compact.height*.45,'Collapsed details should leave the globe most of the screen');
  await page.screenshot({path:resolve(output,'mobile-card-compact.png')});
  await page.locator('[data-act=card-details]').tap();assert.equal(await page.locator('[data-act=card-details]').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#card .stops').isVisible(),true);assert.match(await page.locator('#card .stops').innerText(),/新疆那拉提/);
  const expanded=await geometry();assert.ok(expanded.card.height<=expanded.height*.38+1);
  await page.screenshot({path:resolve(output,'mobile-card-expanded.png')});
  await page.locator('[data-act=card-details]').tap();await page.locator('[data-act=card-near]').tap();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#performance-metrics').textContent).cameraPhase==='immersive',null,{timeout:30000});
  await page.locator('#globe canvas').first().tap({position:{x:285,y:205}});
  await page.waitForFunction(()=>{const m=JSON.parse(document.querySelector('#performance-metrics').textContent);return m.quality==='still'&&m.pixelRatio===3;},null,{timeout:30000});
  const near=await metrics();assert.equal(near.renderPixels,'1260×2460');
  await page.screenshot({path:resolve(output,'mobile-near-clear.png')});
  await page.setViewportSize({width:360,height:740});await page.waitForTimeout(250);
  const narrow=await geometry();assert.ok(narrow.bodyWidth<=360);assert.ok(narrow.card.bottom<narrow.timeline.y);assert.ok(narrow.title.right<narrow.toolbar.x);
  assert.deepEqual(errors,[]);
  const result={result:'PASS',profile:'420×820 CSS, DPR 3, simulated 8GB touch device',global,near,initial,compact,expanded,narrow,clusterTaps,pageErrors:errors,physicalDeviceTest:false};
  await writeFile(resolve(output,'mobile-editor.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:result.result,globalPixels:global.renderPixels,nearPixels:near.renderPixels,cardHeight:compact.card.height,footerHeight:initial.timeline.height,physicalDeviceTest:false}));
}catch(e){await page.screenshot({path:resolve(output,'failure.png')});const m=await metrics().catch(()=>({}));console.error('State:',{quality:m.quality,pixelRatio:m.pixelRatio,phase:m.cameraPhase,geometry:await geometry()});throw e;}
finally{await context.close();await browser.close();}
