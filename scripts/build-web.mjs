import {readFile,writeFile,mkdir,lstat,realpath,readdir,rename,rm,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const safePath=path=>typeof path==='string'&&/^[\w./-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'||!p);
const headers='/*\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/runtime-config.json\n  Cache-Control: no-store\n/build-manifest.json\n  Cache-Control: no-store\n';

function origin(value){
  if(value===null||value===undefined)return null;
  const url=new URL(value);
  if(url.origin!==value||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Deployment URLs must be HTTPS origins (or loopback HTTP)');
  return value;
}
export function deploymentConfig({editorOrigin=null,viewerOrigin=null}={}){
  editorOrigin=origin(editorOrigin);viewerOrigin=origin(viewerOrigin);
  if(editorOrigin&&viewerOrigin&&editorOrigin===viewerOrigin)throw new Error('Editor and Viewer require separate origins, not different paths');
  return {schemaVersion:1,editorOrigin,viewerOrigin,publisher:null};
}

async function filesIn(folder,prefix=''){
  const files=[];
  for(const item of await readdir(folder,{withFileTypes:true})){
    const path=prefix+item.name;
    if(item.isSymbolicLink())throw new Error('Distribution must not contain symlinks');
    if(item.isDirectory())files.push(...await filesIn(resolve(folder,item.name),path+'/'));
    else if(item.isFile())files.push(path);else throw new Error('Unsupported distribution entry');
  }
  return files.sort();
}
export async function verifyDistribution(folder){
  const manifest=JSON.parse(await readFile(resolve(folder,'build-manifest.json'),'utf8'));
  if(manifest.schemaVersion!==1||manifest.kind!=='ohmytrace.production-web'||!['editor','viewer','native'].includes(manifest.target)||!Array.isArray(manifest.files))throw new Error('Unknown distribution manifest');
  const names=manifest.files.map(f=>f.path);
  if(names.some(p=>!safePath(p))||new Set(names).size!==names.length)throw new Error('Invalid distribution paths');
  if(JSON.stringify((await filesIn(folder)))!==JSON.stringify([...names,'build-manifest.json'].sort()))throw new Error('Unexpected or missing distribution files');
  for(const file of manifest.files){const bytes=await readFile(resolve(folder,file.path));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new Error('Distribution integrity failed: '+file.path);}
  return manifest;
}

export async function buildWeb({root=sourceRoot,outDir=resolve(root,'dist'),editorOrigin=null,viewerOrigin=null}={}){
  const config=deploymentConfig({editorOrigin,viewerOrigin}),spec=JSON.parse(await readFile(resolve(root,'config/web-runtime.json'),'utf8'));
  if(spec.schemaVersion!==1)throw new Error('Unknown runtime allowlist');
  root=await realpath(root);outDir=resolve(outDir);
  // Never replace an arbitrary existing directory. Only our verified previous
  // build or an empty destination is eligible for atomic replacement.
  let existing;
  try{existing=await lstat(outDir);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){
    if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('Build destination must be a real directory');
    if((await readdir(outDir)).length){
      let marker;try{marker=JSON.parse(await readFile(resolve(outDir,'production.json'),'utf8'));}catch{throw new Error('Not an owned build directory');}
      if(marker.kind!=='ohmytrace.production')throw new Error('Not an owned build directory');
    }
  }
  const inputs=new Map();
  for(const name of ['editor','viewer']){
    const paths=spec[name];
    if(!Array.isArray(paths)||paths.some(p=>!safePath(p))||new Set(paths).size!==paths.length)throw new Error('Invalid runtime allowlist');
    for(const path of paths){
      const absolute=resolve(root,path),actual=await realpath(absolute);
      if(!actual.startsWith(root+sep)||!(await lstat(absolute)).isFile()||actual!==absolute)throw new Error('Runtime input must be a regular in-repository file: '+path);
      if(!inputs.has(path))inputs.set(path,await readFile(absolute));
    }
  }
  const sourceHashes=[...inputs].sort(([a],[b])=>compare(a,b)).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)}));
  const buildId=hash(JSON.stringify({config,spec,sourceHashes,builder:hash(await readFile(fileURLToPath(import.meta.url)))}));
  await mkdir(dirname(outDir),{recursive:true});const stage=await mkdtemp(resolve(dirname(outDir),'.ohmytrace-build-'));
  try{
    const targets=[];
    for(const target of ['editor','viewer','native']){
      const folder=resolve(stage,target),records=[];await mkdir(folder);
      const write=async(path,input)=>{const bytes=typeof input==='string'?Buffer.from(input):input;await mkdir(dirname(resolve(folder,path)),{recursive:true});await writeFile(resolve(folder,path),bytes);records.push({path,bytes:bytes.length,sha256:hash(bytes)});};
      for(const path of spec[target==='native'?'editor':target]){
        let bytes=inputs.get(path);
        if(path.endsWith('.html')){
          const html=bytes.toString('utf8').replace(/((?:src|href)="[^"#:]+\.(?:js|css))(?:\?[^"\s]*)?"/g,`$1?build=${buildId}"`);
          bytes=Buffer.from(html);
        }
        await write(target==='viewer'&&path==='story-viewer.html'?'index.html':path,bytes);
      }
      await write('runtime-config.json',JSON.stringify({...config,target,buildId},null,2)+'\n');
      await write('_headers',headers);
      const manifest={schemaVersion:1,kind:'ohmytrace.production-web',target,buildId,sourceHashes,files:records.sort((a,b)=>compare(a.path,b.path))};
      await writeFile(resolve(folder,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await verifyDistribution(folder);targets.push(target);
    }
    await writeFile(resolve(stage,'production.json'),JSON.stringify({schemaVersion:1,kind:'ohmytrace.production',buildId,targets},null,2)+'\n');
    const previous=stage+'-previous';let moved=false;
    try{await rename(outDir,previous);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    try{await rename(stage,outDir);}catch(e){if(moved)await rename(previous,outDir);throw e;}
    if(moved)await rm(previous,{recursive:true,force:true});
    return {buildId,outDir,targets,inputs:inputs.size};
  }catch(e){await rm(stage,{recursive:true,force:true});throw e;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){const key={'--out':'outDir','--editor-origin':'editorOrigin','--viewer-origin':'viewerOrigin'}[args[i]];if(!key||!args[i+1])throw new Error('Usage: node scripts/build-web.mjs [--out path] [--editor-origin https://...] [--viewer-origin https://...]');options[key]=args[i+1];}
  console.log(JSON.stringify(await buildWeb(options),null,2));
}
