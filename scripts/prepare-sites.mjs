import {readFile,writeFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),[kind,folder]=process.argv.slice(2);
if(!['editor','stories'].includes(kind)||!folder)throw new Error('Usage: node scripts/prepare-sites.mjs editor|stories /absolute/managed-checkout');
const checkout=resolve(folder),manifestPath=resolve(checkout,'.openai/hosting.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(!manifest.project_id)throw new Error('Open/register this Site using the Sites source helper first');
if(kind==='editor'){
 if(manifest.static?.directory!=='dist')throw new Error('Expected retained static Editor wrapper');
 await cp(resolve(root,'dist/editor'),resolve(checkout,'dist'),{recursive:true});
}else{
 for(const path of ['server/publishing/service.js','server/publishing/cloudflare.js','src/life/schema.js','src/life/story/share.js','src/life/story/schema.js','src/life/story/publishing/publisher.js']){
  await mkdir(dirname(resolve(checkout,path)),{recursive:true});await copyFile(resolve(root,path),resolve(checkout,path));
 }
 await cp(resolve(root,'dist/viewer'),resolve(checkout,'public'),{recursive:true});await copyFile(resolve(root,'deploy/sites/schema.ts'),resolve(checkout,'db/schema.ts'));
 manifest.d1='DB';manifest.r2='BUCKET';await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const path=resolve(checkout,'worker/index.ts');let source=await readFile(path,'utf8');
 if(!source.includes('cloudflarePublisher')){
  source='import {cloudflarePublisher} from "../server/publishing/cloudflare.js";\n'+source;
  source=source.replace('  fetch(request: Request,','  async fetch(request: Request,');
  const anchor='    let binding = ctx.props?.CONNECTORS;';if(!source.includes(anchor))throw new Error('Unknown maintained Sites Worker wrapper; integrate the route explicitly');
  source=source.replace(anchor,(await readFile(resolve(root,'deploy/sites/worker-route.txt'),'utf8'))+anchor);
  await writeFile(path,source);
 }
}
console.log('Prepared '+kind+' assets; retain Site identity, generate new DB migrations when schema changes, then build/package with Sites helpers.');
