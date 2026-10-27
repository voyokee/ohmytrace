import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readAccessInput} from './access-input.mjs';
const {ownerA,ownerB}=await readAccessInput();
const origin='https://ohmytrace-stories.whiteduck3.chatgpt.site',output=process.env.LIFE_BROWSER_OUTPUT||resolve('../outputs/hosted-api');await mkdir(output,{recursive:true});
const artifact=JSON.parse(await readFile(new URL('../../src/life/story/demo.story.json',import.meta.url),'utf8'));let id;
async function call(path='',{token=ownerA,method='GET',body,headers={}}={}){
 const response=await fetch(origin+'/api/publications'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 let value;try{value=await response.json();}catch{throw new Error('Hosted API returned non-JSON HTTP '+response.status);}return {status:response.status,value,cache:response.headers.get('cache-control')};
}
try{
 assert.equal((await call('',{token:null})).status,401);
 assert.equal((await call('',{token:null,headers:{'oai-authenticated-user-id':'forged-visitor','oai-authenticated-user-email':'forged@example.invalid'}})).status,401,'Sites must discard caller-forged visitor identity headers');
 const body={artifact,visibility:'private',idempotencyKey:crypto.randomUUID()};let r=await call('',{method:'POST',body});assert.equal(r.status,201);id=r.value.id;
 assert.equal((await call('',{method:'POST',body})).value.id,id);assert.match(r.cache,/no-store/);
 assert.equal((await call('/'+id+'/content',{token:null})).status,404);assert.equal((await call('/'+id,{token:ownerB})).status,404);assert.equal((await call('',{token:ownerB})).value.publications.length,0);
 assert.equal((await call('/'+id+'/content')).value.kind,'OhMyTraceStory');
 body.visibility='unlisted';body.idempotencyKey=crypto.randomUUID();r=await call('/'+id,{method:'PUT',body,headers:{'If-Match':'1'}});assert.equal(r.status,200);const key=new URL(r.value.url).hash.slice(5);
 assert.equal((await call('/'+id+'/content',{token:null})).status,404);assert.equal((await call('/'+id+'/content',{token:null,headers:{'X-Story-Key':key}})).status,200);
 body.visibility='public';body.idempotencyKey=crypto.randomUUID();body.artifact.title='Fictional hosted acceptance';r=await call('/'+id,{method:'PUT',body,headers:{'If-Match':'2'}});assert.equal(r.status,200);
 assert.equal((await call('/'+id+'/content',{token:null})).value.title,body.artifact.title);
 assert.equal((await call('/'+id,{method:'PUT',body:{...body,idempotencyKey:crypto.randomUUID()},headers:{'If-Match':'1'}})).status,409);
 assert.equal((await call('/'+id+'/revoke',{token:ownerB,method:'POST'})).status,404);
 const bad=structuredClone(body);bad.idempotencyKey=crypto.randomUUID();bad.artifact.rawEXIF={gps:'forbidden'};assert.equal((await call('',{method:'POST',body:bad})).status,400);
 assert.equal((await call('/'+id+'/revoke',{method:'POST'})).value.status,'revoked');assert.equal((await call('/'+id+'/content',{token:null})).status,404);
 const deleted=await call('/'+id,{method:'DELETE'});assert.equal(deleted.value.deleted,true);id=null;
 const result={result:'PASS',https:true,realD1R2:true,dedicatedAutomationAccounts:true,nativeInteractiveSignInTested:false,privateOwner:true,unlistedCredential:true,publicAnonymous:true,ownerIsolation:true,idempotency:true,cas:true,serverValidation:true,revokeDeniesNewRequests:true,delete:true,noStore:true};
 await writeFile(resolve(output,'hosted-api.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{if(id)await call('/'+id,{method:'DELETE'}).catch(()=>{});}
