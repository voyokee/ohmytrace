import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineLayout} from '../../src/life/timeline-layout.js';
const date=(start,end=start)=>({date:{start:new Date(start).getTime(),end:new Date(end).getTime()}});
test('residences and Chapters cannot add blank years before or after travel records',()=>{
  const layout=timelineLayout([date('2022-10-01'),date('2025-04-01')],{context:[date('2015-01-01','2026-12-31')],viewportWidth:800});
  assert.deepEqual(layout.years,[2022,2025]);assert.equal(new Date(layout.start).getFullYear(),2022);
  assert.equal(new Date(layout.end).getFullYear(),2026);
  assert.ok(layout.position(new Date('2022-10-01').getTime())<50);
  assert.equal(layout.position(new Date('2015-01-01').getTime()),0);
  assert.equal(layout.position(new Date('2026-12-31').getTime()),100);
  assert.equal(layout.overlaps(date('2023-01-01','2024-12-31').date),false);
});
test('sparse record years have evenly spaced slots; long history retains readable spacing',()=>{
  const trips=[2008,2010,2020,2025].map(y=>date(`${y}-06-01`));
  const layout=timelineLayout(trips,{viewportWidth:300});
  assert.deepEqual(layout.years.map(layout.yearPosition),[12.5,37.5,62.5,87.5]);
  assert.equal(layout.width,252,'Four years should fit a phone viewport without cropped edge labels');assert.equal(layout.position(new Date('2015-01-01').getTime()),50);
  assert.equal(timelineLayout(trips,{viewportWidth:1200}).width,1152);
  assert.equal(timelineLayout(Array.from({length:12},(_,i)=>date(`${2010+i}-06-01`)),{viewportWidth:300}).width,672,'Long phone histories retain horizontal scrolling and readable year spacing');
});
test('month view bounds use actual coverage, including cross-year travel',()=>{
  const single=timelineLayout([date('2025-06-01','2025-06-30')],{year:2025});
  assert.deepEqual(single.months,[6]);assert.equal(single.monthPosition(6),50);
  const cross=timelineLayout([date('2024-12-29','2025-02-03')],{year:2025});
  assert.deepEqual(cross.months,[1,2]);assert.ok(cross.position(new Date('2024-12-29').getTime())===0);
});
test('Chapters without trips retain a period band without fabricated travel year ticks',()=>{
  const layout=timelineLayout([],{context:[date('2020-01-01','2024-12-31')],viewportWidth:600});
  assert.deepEqual(layout.years,[]);assert.equal(layout.width,552);assert.equal(layout.position(layout.start),0);
  assert.equal(layout.position(layout.end),100);assert.equal(layout.overlaps(date('2022-01-01').date),true);
  assert.equal(timelineLayout([{}]).years.length,0);
});
