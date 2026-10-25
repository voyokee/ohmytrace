import assert from 'node:assert/strict';
import {clusterFootprints,layoutFootprints} from '../src/ui/footprint-layout.js';
import {inYear,yearOptions,scopedDays,timelineBuckets} from '../src/ui/year-scope.js';
import {footprintIntroDelay} from '../src/performance/render-policy.js';
for(const count of [1,4,128,600]) {
 const delays=Array.from({length:count},(_,i)=>footprintIntroDelay(i,count));
 assert.equal(delays[0],0);assert.ok(delays.at(-1)<=3200.001,'Large journals must not animate for nearly a minute');
 assert.ok(delays.slice(1).every((d,i)=>d>delays[i]));
}
assert.equal(footprintIntroDelay(3,4),1260,'Keep the established rhythm for small journals');

const trips=[
 {id:'cross',kind:'trip',date:{start:new Date(2025,11,31).getTime(),end:new Date(2026,0,2).getTime(),days:3}},
 {id:'spring',kind:'trip',date:{start:new Date(2026,3,1).getTime(),end:new Date(2026,3,3).getTime(),days:3}},
 {id:'same-month',kind:'trip',date:{start:new Date(2026,3,20).getTime(),end:new Date(2026,3,20).getTime(),days:1}},
 {id:'unknown',kind:'trip',date:null},
];
assert.deepEqual(yearOptions(trips),[2025,2026]);
assert.ok(inYear(trips[0],2025)&&inYear(trips[0],2026)&&!inYear(trips[0],2024));
assert.equal(scopedDays(trips[0],2025),1);assert.equal(scopedDays(trips[0],2026),2);assert.equal(scopedDays(trips[0],null),3);
assert.equal(inYear(trips[3],2026),false);assert.equal(inYear(trips[3],null),true);
assert.equal(inYear({kind:'home',date:null},2020),true,'Undated residence remains a context anchor');
assert.equal(inYear({kind:'past',date:{start:new Date(2020,0,1).getTime(),end:new Date(2023,11,31).getTime()}},2026),false);
assert.deepEqual(timelineBuckets(trips).map(b=>[b.key,b.items.length]),[[2025,1],[2026,3]],'Annual buckets must include trips that continue across New Year');
assert.deepEqual(timelineBuckets(trips,2026).map(b=>[b.key,b.items.length]),[[1,1],[4,2]],'A cross-year trip belongs in January in the later year');

const dense=Array.from({length:128},(_,i)=>({id:'place-'+String(i).padStart(3,'0'),x:110+(i%16)*5,y:240+Math.floor(i/16)*5,priority:0,labelWidth:110,labelHeight:25}));
const original=JSON.stringify(dense),groups=clusterFootprints(dense);
assert.equal(groups.flatMap(g=>g.members).length,dense.length,'Aggregation must preserve every place');
assert.equal(new Set(groups.flatMap(g=>g.members.map(p=>p.id))).size,dense.length);
assert.ok(groups.length<15,'A dense group must not remain 128 overlapping markers');
assert.equal(JSON.stringify(dense),original,'Layout must not mutate projected source coordinates');
assert.deepEqual(clusterFootprints(dense.slice().reverse()),groups,'Input order must not change seeds');
for(const g of groups)assert.ok(g.members.every(p=>Math.hypot(p.x-g.x,p.y-g.y)<=28.001),'Clusters stay compact around a real place');
const chain=Array.from({length:20},(_,i)=>({id:'c'+i,x:20+i*25,y:100,priority:0}));
assert.ok(clusterFootprints(chain).length>=8,'A chain of neighbours must not merge an entire region');
const home={id:'home',x:120,y:250,priority:500,labelWidth:120,labelHeight:25};
assert.equal(clusterFootprints([...dense,home])[0].key,'home','The current residence keeps its real map anchor');
const jitter=dense.map(p=>({...p,x:p.x+1,y:p.y-1}));
const steady=clusterFootprints(jitter,{previousSeeds:groups.map(g=>g.key)});
assert.deepEqual(new Set(steady.map(g=>g.key)),new Set(groups.map(g=>g.key)),'Small motion should retain existing seeds');

const intersect=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
for(const [width,height]of [[390,844],[803,954],[1448,1086]]) {
 const obstacles=[{left:0,top:0,right:width,bottom:170},{left:0,top:height-140,right:width,bottom:height}];
 const points=Array.from({length:80},(_,i)=>({id:'p'+i,x:16+(i%10)*(width-32)/10,y:190+Math.floor(i/10)*50,priority:i===0?500:0,labelWidth:105,labelHeight:25}));
 const layout=layoutFootprints(points,{width,height,obstacles,labelLimit:width<500?4:8});
 const labels=layout.map(g=>g.label).filter(Boolean);assert.ok(labels.length>0&&labels.length<=(width<500?4:8));
 labels.forEach((l,i)=>{
  assert.ok(l.left>=10&&l.right<=width-10&&l.top>=10&&l.bottom<=height-10);
  assert.ok(!obstacles.some(o=>intersect(l,o)),'Labels must avoid header and playback controls');
  assert.ok(!labels.slice(i+1).some(o=>intersect(l,o)),'Automatic labels must not overlap each other');
 });
}
console.log('PASS: inclusive year/residence scopes, cross-year days/months, unknown dates, compact deterministic clusters, no dropped places, stable home/seed anchors, responsive label and HUD collision budgets');
