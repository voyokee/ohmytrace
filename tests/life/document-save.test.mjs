import test from 'node:test';import assert from 'node:assert/strict';import {saveDocument} from '../../src/platform/document-save.js';
test('native saving streams bounded ordered chunks and finishes only after the full payload',async()=>{
 const input=new Uint8Array(800000).map((_,i)=>i%251),calls=[],chunks=[];
 const bridge={async call(method,params){calls.push({method,params});if(method==='saveDocument')return {documentId:'doc'};if(method==='writeDocument'){chunks.push(Uint8Array.from(atob(params.base64),c=>c.charCodeAt(0)));return {written:params.offset+chunks.at(-1).length};}if(method==='finishDocument')return {bytes:input.length};throw Error(method);}};
 const result=await saveDocument('备份.zip',new Blob([input],{type:'application/zip'}),{bridge});assert.equal(result.saved,true);assert.equal(calls[0].params.size,input.length);assert.equal(calls[0].params.mimeType,'application/zip');assert.equal(calls.at(-1).method,'finishDocument');assert.ok(chunks.length>1&&chunks.every(b=>b.length<=262144));const bytes=new Uint8Array(input.length);let offset=0;for(let i=0;i<chunks.length;i++){assert.equal(calls[i+1].params.offset,offset);bytes.set(chunks[i],offset);offset+=chunks[i].length;}assert.deepEqual(bytes,input);
});
test('native cancellation never writes a byte; failed writes clean up the partial document',async()=>{
 const calls=[],cancelled={call:async(method)=>{calls.push(method);return {cancelled:true};}};assert.equal((await saveDocument('a.json','记录',{bridge:cancelled})).saved,false);assert.deepEqual(calls,['saveDocument']);
 const failed={async call(method){calls.push(method);if(method==='saveDocument')return {documentId:'doc'};if(method==='writeDocument')throw Error('disk full');return {};}};await assert.rejects(saveDocument('a.json','记录',{bridge:failed}),/disk full/);assert.equal(calls.at(-1),'cancelDocument');
});
test('Web saving uses the supplied Blob and download name without sending coordinates to a server',async()=>{
 let clicked=0,removed=0,blob;const a={click(){clicked++;},remove(){removed++;}},doc={createElement:()=>a,body:{append(){}}},urls={createObjectURL:b=>{blob=b;return 'blob:local';},revokeObjectURL(){}};
 const result=await saveDocument('足迹.geojson','{"coordinates":[104,30]}',{bridge:null,document:doc,url:urls,mimeType:'application/geo+json'});assert.equal(result.saved,true);assert.equal(a.download,'足迹.geojson');assert.equal(a.href,'blob:local');assert.equal(clicked,1);assert.equal(blob.type,'application/geo+json');assert.equal(await blob.text(),'{"coordinates":[104,30]}');
});
