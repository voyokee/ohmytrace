import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {storyFixture} from './story-fixtures.mjs';
import {composeStory,setStoryMemories} from '../../src/life/story/compose.js';
import {projectShare,parseArtifact} from '../../src/life/story/share.js';
import {createStoryBridge} from '../../src/life/story/viewer-bridge.js';
import {staticZip,crc32,createSharePackage} from '../../src/life/story/package.js';

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
