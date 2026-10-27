import assert from 'node:assert/strict';
import {readAccessInput} from './access-input.mjs';
const {ownerA,ownerB}=await readAccessInput(),origin='https://ohmytrace-stories.whiteduck3.chatgpt.site';
for(const token of [ownerA,ownerB]){
 const response=await fetch(origin+'/api/publications?credential-check='+crypto.randomUUID(),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
 let value;try{value=await response.json();}catch{}
 console.log(JSON.stringify({status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),error:value?.error,publicationCount:value?.publications?.length,finalPath:new URL(response.url).pathname}));
 assert.equal(response.status,401);assert.equal(value?.error,'sign_in');
}
