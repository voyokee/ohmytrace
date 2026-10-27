import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPublicationService} from '../../server/publishing/service.js';
import {memoryPublicationStorage} from '../../server/publishing/memory.js';
const demo=JSON.parse(await readFile(new URL('../../src/life/story/demo.story.json',import.meta.url),'utf8'));
function harness(){const memory=memoryPublicationStorage(),service=createPublicationService({...memory,identify:async r=>r.headers.get('test-owner'),origin:'https://stories.example',editorOrigin:'https://editor.example'});
  return {...memory,async call(path='',{owner='alice',method='GET',body,headers={}}={}){const r=await service.handle(new Request('https://stories.example/api/publications'+path,{method,headers:{...(owner?{'test-owner':owner}:{}),'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};}};}
const input=(visibility='public',key=crypto.randomUUID())=>({artifact:structuredClone(demo),visibility,idempotencyKey:key});
test('real HTTP protocol: owner isolation, private/unlisted/public, idempotency, CAS, revoke/delete',async()=>{
 const h=harness(),data=input();let a=await h.call('',{method:'POST',body:data});assert.equal(a.status,201);const id=a.body.id;assert.equal(a.body.revision,1);assert.match(a.cache,/no-store/);
 assert.equal((await h.call('',{method:'POST',body:data})).body.id,id);assert.equal(h.files.size,1);
 assert.equal((await h.call('/'+id,{owner:'bob'})).status,404);assert.deepEqual((await h.call('',{owner:'bob'})).body.publications,[]);
 assert.equal((await h.call('/'+id+'/content',{owner:null})).status,200);
 const updated=input('unlisted');updated.artifact.title='Updated';a=await h.call('/'+id,{method:'PUT',body:updated,headers:{'If-Match':'1'}});assert.equal(a.status,200);assert.equal(a.body.revision,2);assert.equal(h.files.size,1);
 assert.equal((await h.call('/'+id,{method:'PUT',body:updated,headers:{'If-Match':'1'}})).status,200,'retried mutation is idempotent');
 assert.equal((await h.call('/'+id,{method:'PUT',body:input(),headers:{'If-Match':'1'}})).status,409);
 assert.equal((await h.call('/'+id+'/content',{owner:null})).status,404);
 const token=new URL(a.body.url).hash.slice(5);assert.equal((await h.call('/'+id+'/content',{owner:null,headers:{'X-Story-Key':token}})).status,200);
 assert.equal((await h.call('/'+id+'/content',{owner:null,headers:{'X-Story-Key':'wrong'}})).status,404);
 a=await h.call('/'+id,{method:'PUT',body:input('private'),headers:{'If-Match':'2'}});assert.equal(a.status,200);
 assert.equal((await h.call('/'+id+'/content',{owner:null,headers:{'X-Story-Key':token}})).status,404);assert.equal((await h.call('/'+id+'/content')).status,200);
 assert.equal((await h.call('/'+id+'/revoke',{method:'POST',owner:'bob'})).status,404);
 assert.equal((await h.call('/'+id+'/revoke',{method:'POST'})).body.status,'revoked');assert.equal(h.files.size,0);
 assert.equal((await h.call('/'+id+'/content')).status,404);assert.equal((await h.call('/'+id,{method:'PUT',body:input(),headers:{'If-Match':'4'}})).status,409);
 assert.equal((await h.call('/'+id,{method:'DELETE'})).body.deleted,true);assert.equal((await h.call('/'+id,{method:'DELETE'})).body.deleted,true);
});
test('server revalidates privacy, image metadata, unknown fields and cross-origin/anonymous writes',async()=>{
 const h=harness();assert.equal((await h.call('',{method:'POST',owner:null,body:input()})).status,401);
 assert.equal((await h.call('',{method:'POST',body:input(),headers:{Origin:'https://evil.example'}})).status,403);
 for(const change of [a=>a.artifact.privateEvidence={rawEXIF:'secret'},a=>a.artifact.places[0].coordinates.latitude=31.12345,a=>a.artifact.memories.find(m=>m.image).image='https://private.example/photo.jpg']){const bad=input();change(bad);assert.equal((await h.call('',{method:'POST',body:bad})).status,400);}
 assert.equal(h.files.size,0);
});
test('concurrent update and revocation cannot resurrect or expose late uploaded bytes; retry repairs cleanup',async()=>{
 const h=harness(),created=await h.call('',{method:'POST',body:input()});const id=created.body.id;const put=h.objects.put;let release,entered;
 const ready=new Promise(r=>entered=r);h.objects.put=async(...args)=>{entered();await new Promise(r=>release=r);await put(...args);};
 const update=h.call('/'+id,{method:'PUT',body:input(),headers:{'If-Match':'1'}});await ready;
 await h.call('/'+id+'/revoke',{method:'POST'});release();assert.equal((await update).status,409);assert.equal(h.files.size,0);assert.equal((await h.call('/'+id+'/content',{owner:null})).status,404);
});
test('replaceable local Publisher executes the same validated service protocol',async()=>{
 const {createLocalStoryPublisher}=await import('../../server/publishing/local.js'),publisher=createLocalStoryPublisher();
 const options={visibility:'unlisted',idempotencyKey:crypto.randomUUID()},a=await publisher.publish(demo,options);
 assert.equal((await publisher.publish(demo,options)).id,a.id);assert.equal((await publisher.getPublication(a.id)).status,'published');
 assert.equal((await publisher.listPublications()).length,1);
 const changed=await publisher.update(a.id,{...demo,title:'Revised'},{visibility:'private',revision:a.revision});assert.equal(changed.revision,2);
 const abort=new AbortController();abort.abort();await assert.rejects(publisher.unpublish(a.id,{signal:abort.signal}),{name:'AbortError'});
 assert.equal((await publisher.unpublish(a.id)).status,'revoked');assert.equal((await publisher.delete(a.id)).deleted,true);
});
test('browser-native fetch retains its Window receiver in HTTP Publisher',async()=>{
 const {HttpStoryPublisher}=await import('../../src/life/story/publishing/publisher.js'),original=globalThis.fetch;
 try{globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve(new Response('{"publications":[]}'));};const publisher=new HttpStoryPublisher({origin:'https://stories.example'});assert.deepEqual(await publisher.listPublications(),[]);}finally{globalThis.fetch=original;}
});
