import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMarkerActivation} from '../../src/ui/footprint-overlay.js';
const pointer=(type,values={})=>Object.assign(new Event(type,{cancelable:true}),{isPrimary:true,pointerId:1,pointerType:'touch',button:0,clientX:100,clientY:100,...values});
test('touch retains its initial cluster through jitter and suppresses compatibility double activation',()=>{
  const el=new EventTarget(),values=[];let value=['a','b'],presses=0,releases=0;
  const binding=bindMarkerActivation(el,{readValue:()=>[...value],activate:v=>values.push(v),onPress:()=>presses++,onRelease:()=>releases++});
  el.dispatchEvent(pointer('pointerdown'));value=['c','d'];el.dispatchEvent(pointer('pointermove',{clientX:103,clientY:102}));el.dispatchEvent(pointer('pointerup'));
  el.dispatchEvent(Object.assign(new Event('click'),{detail:1}));assert.deepEqual(values,[['a','b']]);assert.equal(presses,1);assert.equal(releases,1);
  el.dispatchEvent(Object.assign(new Event('click'),{detail:0}));assert.deepEqual(values,[['a','b'],['c','d']],'Keyboard and assistive activation remain supported');
  binding.dispose();el.dispatchEvent(Object.assign(new Event('click'),{detail:0}));assert.equal(values.length,2);
});
test('drag, cancellation, capture loss and data invalidation never select a stale cluster',()=>{
  for(const type of ['drag','pointercancel','lostpointercapture','invalidate']){
    const el=new EventTarget();let activations=0,releases=0;
    const binding=bindMarkerActivation(el,{readValue:()=>['a','b'],activate:()=>activations++,onRelease:()=>releases++});
    el.dispatchEvent(pointer('pointerdown'));
    if(type==='drag')el.dispatchEvent(pointer('pointermove',{clientX:130}));else if(type==='invalidate')binding.cancel();else el.dispatchEvent(pointer(type));
    el.dispatchEvent(pointer('pointerup'));el.dispatchEvent(Object.assign(new Event('click'),{detail:1}));
    assert.equal(activations,0,type);assert.equal(releases,1,type);
    el.dispatchEvent(pointer('pointerdown'));el.dispatchEvent(pointer('pointerup'));el.dispatchEvent(Object.assign(new Event('click'),{detail:1}));
    assert.equal(activations,1,'The next independent tap works once');binding.dispose();
  }
});
