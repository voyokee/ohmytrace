import test from 'node:test';import assert from 'node:assert/strict';
import {createScanPreview} from '../../src/life/media/scan-preview.js';
test('scan preview lights one point per coarse cell, ignores null island and invalid fixes, and stops at its limit',()=>{
 const p=createScanPreview({cellDegrees:0.25,limit:3});
 assert.equal(p.add(30.66,104.06),true);assert.equal(p.add(30.67,104.07),false,'same city cell lights once');
 assert.equal(p.add(0,0),false);assert.equal(p.add(NaN,1),false);assert.equal(p.add(91,0),false);
 assert.equal(p.add(31.23,121.47),true);assert.equal(p.add(39.9,116.4),true);assert.equal(p.add(22.54,114.06),false,'limit reached');
 assert.equal(p.size,3);p.clear();assert.equal(p.size,0);assert.equal(p.add(22.54,114.06),true);
});
