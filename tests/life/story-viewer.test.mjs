import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {storyFixture} from './story-fixtures.mjs';
import {composeStory,setStoryMemories} from '../../src/life/story/compose.js';
import {projectShare,parseArtifact} from '../../src/life/story/share.js';
import {createStoryBridge} from '../../src/life/story/viewer-bridge.js';
import {staticZip,crc32,createSharePackage} from '../../src/life/story/package.js';
import {mountStandaloneViewer} from '../../src/life/story/viewer.js';

test('Viewer uses only an independent Artifact, preserves scoped identities and never opens storage',()=>{
  const f=storyFixture(),a=projectShare(f.data,composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}));
  const original=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){throw new Error('must not read private database');}});
  try{const bridge=createStoryBridge(a);assert.equal(bridge.repository,undefined);const all=bridge.adapter.getRenderSnapshot();assert.equal(all.trips.length,2);assert.equal(all.trips[0].origin,null);
    bridge.adapter.setScope({type:'chapter',id:a.chapters[0].id});assert.equal(bridge.adapter.getRenderSnapshot().homes[0].anchor,true);
    bridge.adapter.setScope({type:'trip',id:a.trips[1].id});assert.equal(bridge.adapter.getRenderSnapshot().trips.length,1);
    bridge.adapter.focusTrip(a.trips[1].id);assert.equal(bridge.adapter.getRenderSnapshot().focus.id,a.trips[1].id);assert.throws(()=>bridge.adapter.setScope({type:'chapter',id:f.chapter}));
  }finally{if(original)Object.defineProperty(globalThis,'indexedDB',original);else delete globalThis.indexedDB;}
});
test('static ZIP has standard headers, CRC, central directory and rejects traversal',async()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const bytes=new Uint8Array(await staticZip([['index.html','hello'],['story.json','{}']]).arrayBuffer()),v=new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.equal(v.getUint16(bytes.length-12,true),2);
  const offset=v.getUint32(bytes.length-6,true);assert.equal(v.getUint32(offset,true),0x02014b50);
  assert.throws(()=>staticZip([['../private.csv','secret']]));
});
test('read-only Trip photo counts do not reinterpret text or video Memories as photos',()=>{
  const f=storyFixture();f.data.memories.find(m=>m.id===f.photo).kind='note';
  const story=setStoryMemories(composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}),f.data,[f.photo]);story.privacySettings.includeNotes=true;
  const snapshot=createStoryBridge(projectShare(f.data,story)).adapter.getRenderSnapshot();assert.equal(snapshot.trips[0].memoryCount,0);
});
test('package whitelist excludes personal persistence, editors, source fixtures and original files',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../src/life/story/runtime-files.json',import.meta.url),'utf8'));
  assert.ok(manifest.includes('app.js'));assert.ok(manifest.includes('vendor/cesium/Cesium.js'));assert.ok(manifest.includes('story-viewer.html'));
  for(const file of manifest)assert.ok(!/repository|app-bridge|media\/|composer|compose\.js|tests\/|\.csv$|\.git/.test(file),file);
  const root=new URL('../../',import.meta.url);for(const file of manifest)await readFile(new URL(file,root));
  const f=storyFixture(),artifact=projectShare(f.data,composeStory(f.data,{scope:{type:'chapter',id:f.chapter}}));
  await assert.rejects(createSharePackage(artifact,{fetchFile:async()=>new TextEncoder().encode('["src/life/repository.js"]')}),/清单/);
  const demo=parseArtifact(await readFile(new URL('../../src/life/story/demo.story.json',import.meta.url),'utf8'));assert.equal(demo.chapters.length,2);assert.ok(demo.memories[0].image);assert.equal(JSON.stringify(demo).includes('PRIVATE_'),false);
});

test('late packaged stories and slower file reads cannot replace the latest Viewer selection',async()=>{
  const f=storyFixture(),artifact=projectShare(f.data,composeStory(f.data));
  const manual={...artifact,title:'Explicit selection'},latest={...artifact,title:'Latest file'};
  const nodes=new Map(),handlers=new Map(),loads=[];let resolveDefault;
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',hidden:false});return nodes.get(selector);};
  const panel={innerHTML:'',querySelector:node,addEventListener:(type,handler)=>handlers.set(type,handler)};
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>panel,body:{append(){}},querySelector:node}});
  globalThis.fetch=path=>path==='./story.json'?new Promise(resolve=>{resolveDefault=resolve;}):Promise.resolve({ok:false});
  try{
    const viewer=mountStandaloneViewer({onLoad:async a=>loads.push(a.title),onStop(){}});
    await viewer.load(manual);
    resolveDefault({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(artifact)});
    await new Promise(setImmediate);
    assert.equal(node('#brand h1').textContent,manual.title,'A late automatic fetch must not replace a deliberately loaded work');
    assert.deepEqual(loads,[manual.title]);
    let resolveFirst;
    const first=handlers.get('change')({target:{files:[{size:1,text:()=>new Promise(resolve=>{resolveFirst=resolve;})}],value:'first'}});
    await handlers.get('change')({target:{files:[{size:1,text:async()=>JSON.stringify(latest)}],value:'second'}});
    resolveFirst(JSON.stringify(manual));await first;
    assert.equal(node('#brand h1').textContent,latest.title,'A slow previous file read must not replace the most recent file');
    assert.deepEqual(loads,[manual.title,latest.title]);
  }finally{globalThis.fetch=oldFetch;if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete globalThis.document;}
});

test('offline package download uses four bounded workers while preserving ZIP entry order',async()=>{
  const f=storyFixture(),artifact=projectShare(f.data,composeStory(f.data));
  const paths=['app.js','styles.css','story-viewer.html','src/life/story/schema.js','src/life/story/share.js','src/life/story/viewer.js','src/life/story/playback.js','src/life/story/player-ui.js'];
  let active=0,maximum=0;const completed=[],progress=[];
  const zip=await createSharePackage(artifact,{onProgress:message=>progress.push(message),fetchFile:async path=>{
    if(path==='src/life/story/runtime-files.json')return new TextEncoder().encode(JSON.stringify(paths));
    active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,path==='app.js'?20:1));active--;completed.push(path);return new TextEncoder().encode(path);
  }});
  assert.equal(maximum,4);assert.equal(active,0);assert.notEqual(completed[0],'app.js');
  const bytes=Buffer.from(await zip.arrayBuffer()),names=[];let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){const length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),size=bytes.readUInt32LE(offset+18);names.push(bytes.subarray(offset+30,offset+30+length).toString());offset+=30+length+extra+size;}
  assert.deepEqual(names.slice(0,paths.length),paths.map(p=>p==='story-viewer.html'?'index.html':p));
  assert.ok(progress.includes('正在打包地球资源 8 / 8'));
});
