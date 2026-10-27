import {test} from 'node:test';import assert from 'node:assert/strict';
import {PopupStoryPublisher} from '../../src/life/story/publishing/popup-publisher.js';
test('popup transport rejects foreign source/nonce, cancels before and after pairing, then recovers',async()=>{
 const previous=globalThis.window,listeners=new Set(),messages=[];let nonce;
 const popup={closed:false,focus(){},postMessage(value){messages.push(value);},close(){this.closed=true;}};
 globalThis.window={addEventListener(_,fn){listeners.add(fn);},removeEventListener(_,fn){listeners.delete(fn);},open(url){nonce=new URL(url).hash.slice(1);return popup;}};
 const origin='https://stories.example',emit=(data,extra={})=>{for(const fn of listeners)fn({origin,source:popup,data:{nonce,...data},...extra});},tick=()=>new Promise(setImmediate);
 let publisher;
 try{
  publisher=new PopupStoryPublisher({origin});const before=new AbortController(),waiting=publisher.listPublications({signal:before.signal});before.abort();await assert.rejects(waiting,{name:'AbortError'});assert.equal(messages.length,0);
  const pending=publisher.listPublications();emit({type:'publisher-ready'},{origin:'https://evil.example'});emit({type:'publisher-ready'},{source:{}});emit({type:'publisher-ready',nonce:'wrong'});await tick();assert.equal(messages.length,0);
  emit({type:'publisher-ready'});await tick();const request=messages.at(-1);assert.equal(request.type,'publisher-request');
  emit({id:request.id,result:['forged']},{origin:'https://evil.example'});emit({id:request.id,result:['owned']});assert.deepEqual(await pending,['owned']);
  const after=new AbortController(),inFlight=publisher.getPublication('id',{signal:after.signal});await tick();const stale=messages.at(-1);after.abort();await assert.rejects(inFlight,{name:'AbortError'});assert.equal(messages.at(-1).type,'publisher-cancel');
  emit({id:stale.id,result:{status:'published'}});const recover=publisher.listPublications();await tick();emit({id:messages.at(-1).id,result:[{status:'published'}]});assert.deepEqual(await recover,[{status:'published'}]);
 }finally{publisher?.dispose();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
