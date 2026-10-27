import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildWeb,verifyDistribution,deploymentConfig} from '../../scripts/build-web.mjs';

test('production build is reproducible, complete, isolated and free of private/development files',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'ohmytrace-production-'));
  try{
    const outDir=resolve(temp,'dist'),first=await buildWeb({outDir});
    const manifests=await Promise.all(first.targets.map(target=>verifyDistribution(resolve(outDir,target))));
    for(const manifest of manifests){
      const files=manifest.files.map(f=>f.path);
      assert.ok(files.some(p=>p.endsWith('.wasm')));assert.ok(files.some(p=>p.startsWith('vendor/cesium/Workers/')));
      assert.ok(files.some(p=>p.endsWith('.glb')));assert.ok(files.includes('LICENSE'));assert.ok(files.includes('vendor/cesium/LICENSE.md'));assert.ok(files.includes('assets/SOURCES.md'));
      assert.ok(!files.some(p=>p.startsWith('tests/')||p.startsWith('docs/')||p.includes('.DS_Store')||p.endsWith('.csv')||p.startsWith('.git/')||p.startsWith('server/')));
      const config=JSON.parse(await readFile(resolve(outDir,manifest.target,'runtime-config.json'),'utf8'));assert.equal(config.publisher,null);
      assert.match(await readFile(resolve(outDir,manifest.target,'index.html'),'utf8'),new RegExp('build='+first.buildId));
      const html=await readFile(resolve(outDir,manifest.target,'index.html'),'utf8');
      assert.match(html,/<title>[^<]*OnceHere[^<]*<\/title>/,'Every shipped entry point identifies OnceHere');
      assert.doesNotMatch(html,/Oh\s?My\s?Trace|Life Atlas|我的足迹/,'Old product names must not ship in entry pages');
    }
    const viewer=manifests.find(m=>m.target==='viewer').files.map(f=>f.path);
    assert.ok(!viewer.includes('src/life/repository.js'));assert.ok(!viewer.includes('src/life/app-bridge.js'));assert.ok(!viewer.some(p=>p.startsWith('src/life/media/')));
    const second=await buildWeb({outDir});assert.equal(second.buildId,first.buildId);
    assert.deepEqual(await Promise.all(second.targets.map(target=>verifyDistribution(resolve(outDir,target)))),manifests);
    await writeFile(resolve(outDir,'viewer/app.js'),'tampered');await assert.rejects(verifyDistribution(resolve(outDir,'viewer')),/integrity/);
    await buildWeb({outDir});await writeFile(resolve(outDir,'viewer/private.json'),'secret');await assert.rejects(verifyDistribution(resolve(outDir,'viewer')),/Unexpected/);
    assert.throws(()=>deploymentConfig({editorOrigin:'https://same.test',viewerOrigin:'https://same.test'}),/separate origins/);
    assert.throws(()=>deploymentConfig({editorOrigin:'http://public.test'}),/HTTPS/);
    assert.throws(()=>deploymentConfig({editorOrigin:'https://editor.test/path'}),/origins/);
    assert.equal(deploymentConfig({editorOrigin:'http://127.0.0.1:9000',viewerOrigin:'http://127.0.0.1:9001'}).viewerOrigin,'http://127.0.0.1:9001');
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('Android display name and update prompt use OnceHere without changing installed app identity',async()=>{
  const resources=await readFile(new URL('../../android/app/src/main/res/values/strings.xml',import.meta.url),'utf8');
  assert.match(resources,/<string name="app_name">OnceHere<\/string>/);
  assert.match(resources,/<string name="webview_update_required">[^<]*OnceHere<\/string>/);
  const gradle=await readFile(new URL('../../android/app/build.gradle',import.meta.url),'utf8');
  assert.match(gradle,/applicationId 'com\.ohmytrace\.app'/,'Existing Android installations must retain their data on upgrade');
});

test('production build cannot replace unrelated files or follow a destination symlink',async()=>{
  const temp=await mkdtemp(resolve(tmpdir(),'ohmytrace-build-boundary-'));
  try{
    const unrelated=resolve(temp,'unrelated');await mkdir(unrelated);await writeFile(resolve(unrelated,'keep.txt'),'keep');
    await assert.rejects(buildWeb({outDir:unrelated}),/owned build directory/);assert.equal(await readFile(resolve(unrelated,'keep.txt'),'utf8'),'keep');
    // Windows junctions exercise the same link boundary without requiring the
    // optional CreateSymbolicLink privilege / Developer Mode.
    await symlink(unrelated,resolve(temp,'link'),process.platform==='win32'?'junction':'dir');await assert.rejects(buildWeb({outDir:resolve(temp,'link')}),/real directory/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
