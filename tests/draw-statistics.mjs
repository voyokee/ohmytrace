import assert from 'node:assert/strict';
import {createDrawStatistics} from '../src/performance/draw-statistics.js';
const callbacks=new Set(),scene={postRender:{addEventListener(fn){callbacks.add(fn);return()=>callbacks.delete(fn);}}};
let calls=0;const program={},shader={};
const gl={TRIANGLES:4,TRIANGLE_STRIP:5,CURRENT_PROGRAM:99,SHADER_TYPE:1,FRAGMENT_SHADER:2,
 getParameter:()=>program,getAttachedShaders:()=>[shader],getShaderParameter:()=>2,
 getShaderSource:()=> 'uniform float u_autumn;',
 drawElements(){calls++;},drawArrays(){calls++;},drawElementsInstanced(){calls++;},drawArraysInstanced(){calls++;}};
const original=gl.drawElements;
const stats=createDrawStatistics(gl,scene);
gl.drawElements(4,30,5123,0);gl.drawArrays(4,0,12);
gl.drawElementsInstanced(4,9,5123,0,4);gl.drawArraysInstanced(5,0,5,2);
for(const fn of callbacks)fn();
const result=stats.details();assert.equal(result.gpuDrawCounts.vegetation,4);
assert.equal(result.gpuTriangles.vegetation,10+4+3*4+3*2);
assert.equal(calls,4,'Diagnostics must still submit each original draw exactly once');
assert.deepEqual(stats.details().gpuDrawCounts,{},'Sample windows must reset counts');
stats.dispose();assert.equal(gl.drawElements,original);assert.equal(callbacks.size,0);
console.log('PASS: opt-in real draw counts, triangle/instance accounting, reset and GL callback restoration');
