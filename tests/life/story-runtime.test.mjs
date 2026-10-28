import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {posix} from 'node:path';
test('static story ZIP contains every static Life module dependency required by its Viewer',async()=>{
 const root=new URL('../../',import.meta.url),manifest=JSON.parse(await readFile(new URL('src/life/story/runtime-files.json',root),'utf8')),files=new Set(manifest);
 for(const path of manifest.filter(p=>p.startsWith('src/life/')&&p.endsWith('.js'))){
  const source=await readFile(new URL(path,root),'utf8');
  for(const [,specifier]of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"](\.[^'"]+)['"]/g)){
   const dependency=posix.normalize(posix.join(posix.dirname(path),specifier.split('?')[0]));assert.ok(files.has(dependency),path+' requires '+dependency+' in the static ZIP');
  }
 }
});
