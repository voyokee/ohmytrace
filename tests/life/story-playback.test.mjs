import test from 'node:test';import assert from 'node:assert/strict';
import {StoryPlayback} from '../../src/life/story/playback.js';
const story={cameraPreferences:{speed:1,motion:'system'},orderedScenes:[{id:'a',duration:1},{id:'b',duration:2},{id:'c',duration:1}]};
function clock(){let time=0,n=0;const timers=new Map();return {now:()=>time,setTimer:(fn,ms)=>{const id=++n;timers.set(id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),
  async advance(ms){const target=time+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;timers.delete(next[0]);time=next[1].at;next[1].fn();await Promise.resolve();await Promise.resolve();}time=target;await Promise.resolve();},timers};}
test('pause/resume, speed, seek, next/previous, end and stop respect elapsed dwell time',async()=>{
  const c=clock(),seen=[],p=new StoryPlayback({...c,enter:async s=>seen.push(s.id)});p.load(story);await p.play();
  await c.advance(400);p.pause();assert.equal(p.snapshot().status,'paused');await c.advance(5000);assert.equal(p.index,0);
  p.setSpeed(2);p.resume();await c.advance(299);assert.equal(p.index,0);await c.advance(1);assert.equal(p.index,1);
  await p.seek(2);assert.equal(p.index,2);await c.advance(500);assert.equal(p.status,'ended');
  await p.play();assert.equal(p.index,0);p.pause();await p.next();assert.equal(p.index,1);assert.equal(p.status,'paused');await p.previous();assert.equal(p.index,0);
  p.stop();assert.equal(p.status,'stopped');assert.equal(c.timers.size,0);assert.throws(()=>p.setSpeed(0));await assert.rejects(p.seek(-1));
});
test('rapid scene changes abort old camera work; late completion never schedules stale scenes',async()=>{
  const c=clock(),pending=[],events=[];let cancelled=0;
  const p=new StoryPlayback({...c,enter:(s,options)=>new Promise(resolve=>pending.push({s,options,resolve})),cancel:()=>cancelled++});
  p.subscribe(e=>events.push(e));p.load(story);const first=p.play();const second=p.seek(2);
  assert.equal(pending[0].options.signal.aborted,true);pending[0].resolve();await first;assert.equal(p.index,2);
  pending[1].resolve();await second;await c.advance(999);assert.equal(p.index,2);await c.advance(1);assert.equal(p.status,'ended');
  assert.ok(cancelled>=3);assert.deepEqual(events.filter(e=>e.type==='scenechanged').map(e=>e.scene.id),['a','c']);
});
test('pause during flight and explicit cancellation cannot leak timers; failed and stalled renderers settle',async()=>{
  const c=clock();let signal;const p=new StoryPlayback({...c,enter:(s,o)=>{signal=o.signal;return new Promise(()=>{});},transitionTimeout:50});
  p.load(story);const flight=p.play();p.pause();assert.equal(signal.aborted,true);await flight;assert.equal(c.timers.size,0);
  const resumed=p.resume();await c.advance(50);await resumed;assert.equal(p.status,'playing');await c.advance(999);assert.equal(p.index,0);p.stop();assert.equal(c.timers.size,0);
  const fail=new StoryPlayback({...c,enter:async()=>{throw new Error('render failure');}});fail.load(story);await fail.play();assert.equal(fail.status,'error');assert.equal(c.timers.size,0);
});
test('reduced motion reaches renderer and empty stories remain safe',async()=>{
  const c=clock();let options;const p=new StoryPlayback({...c,reducedMotion:true,enter:async(s,o)=>options=o});p.load(story);await p.play();assert.equal(options.instant,true);p.stop();
  p.load({...story,orderedScenes:[]});await p.play();assert.equal(p.status,'idle');assert.equal(c.timers.size,0);
});
test('late old transition cannot clear the current scene fallback deadline',async()=>{
  const c=clock();const p=new StoryPlayback({...c,enter:()=>new Promise(()=>{}),transitionTimeout:50});p.load(story);
  const old=p.play(),current=p.seek(1);await old;await c.advance(50);
  assert.equal(p.started,50,'Current scene must become ready after its own fallback deadline');
  await current;p.stop();assert.equal(c.timers.size,0);
});
