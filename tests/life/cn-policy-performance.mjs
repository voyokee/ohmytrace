import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),root=fileURLToPath(new URL('../../',import.meta.url)),baseline='e52d73b';
const changed=new Set(execFileSync('git',['diff','--name-only',baseline],{cwd:root,encoding:'utf8'}).trim().split('\n'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),before=url.pathname.startsWith('/before/'),relative=url.pathname.replace(/^\/(before|after)\//,'').replace(/^\//,'').replace(/^$/,'index.html'),path=resolve(root,relative);if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error();const bytes=before&&changed.has(relative)?execFileSync('git',['show',baseline+':'+relative],{cwd:root}):await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.LIFE_BROWSER_EXECUTABLE,args:['--enable-unsafe-swiftshader']}),runs={};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
try{
 for(const scene of ['global','alpine'])for(const variant of ['before','after']){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const query=scene==='global'?'perf&benchmark=1&view=asia&altitude=17079823':'perf&benchmark=1&view=alps&altitude=15000&pitch=-45';
  await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/?${query}`);await page.locator('#performance-metrics').waitFor({state:'attached'});await page.waitForFunction(()=>!document.querySelector('#loader')||document.querySelector('#loader').classList.contains('out'));
  // Warm up the same fixed camera; sampling uses the app's postRender frame metrics.
  await page.waitForTimeout(8000);const start=await page.locator('#performance-metrics').evaluate(el=>JSON.parse(el.dataset.samples||'[]').length);
  await page.waitForFunction(n=>JSON.parse(document.querySelector('#performance-metrics').dataset.samples||'[]').length>=n+6,start,{timeout:25000});
  const samples=await page.locator('#performance-metrics').evaluate((el,n)=>JSON.parse(el.dataset.samples).slice(n),start);
  runs[scene+'-'+variant]={medianFps:median(samples.map(s=>s.fps)),medianP95FrameMs:median(samples.map(s=>s.p95FrameMs)),samples,errors};console.log(scene+'-'+variant,JSON.stringify({fps:runs[scene+'-'+variant].medianFps,p95:runs[scene+'-'+variant].medianP95FrameMs}));await context.close();
 }
 const result={baseline,measuredAt:new Date().toISOString(),protocol:{browser:await browser.version(),viewport:'1280×720',renderer:'headless Chrome / SwiftShader',windows:'8 s warmup, six subsequent two-second postRender windows',caveats:['Desktop software renderer, not Android hardware','Fixed camera, not flight or import throughput','Online terrain/imagery timing can differ between sequential runs','Existing metrics exclude frame intervals at least 250 ms']},runs};
 await writeFile(resolve(root,'docs/cn-policy-performance.json'),JSON.stringify(result,null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
