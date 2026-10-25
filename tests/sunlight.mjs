import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {syncCameraSun,SUN_EC} from '../src/rendering/sunlight.js';
const context={console,setTimeout,clearTimeout,performance,URL,TextDecoder,TextEncoder,atob,btoa,TransformStream,ReadableStream,WritableStream};
context.global=context;context.self=context;vm.createContext(context);vm.runInContext(readFileSync(new URL('../vendor/cesium/Cesium.js',import.meta.url),'utf8'),context);
const C=globalThis.Cesium=context.Cesium,eye=new C.Cartesian3(),world=new C.Cartesian3();
const expected=C.Cartesian3.normalize(C.Cartesian3.fromArray(SUN_EC),new C.Cartesian3());
for(const angle of [0,.7,1.8,Math.PI,5.9]) {
 const rotation=C.Matrix3.fromRotationZ(angle),inverseView=C.Matrix4.fromRotationTranslation(rotation,new C.Cartesian3(6e6,-4e6,2e6));
 syncCameraSun(inverseView,eye,world);
 assert.ok(C.Cartesian3.distance(eye,expected)<1e-12);
 const view=C.Matrix4.inverseTransformation(inverseView,new C.Matrix4()),back=C.Matrix4.multiplyByPointAsVector(view,world,new C.Cartesian3());
 assert.ok(C.Cartesian3.distance(back,eye)<1e-12,'Camera/world light directions must remain consistent through rotations');
 assert.ok(Math.abs(C.Cartesian3.magnitude(world)-1)<1e-12);
 const noTranslation=C.Matrix4.fromRotationTranslation(rotation,C.Cartesian3.ZERO),other=new C.Cartesian3();
 syncCameraSun(noTranslation,new C.Cartesian3(),other);
 assert.ok(C.Cartesian3.distance(other,world)<1e-12,'Earth-scale camera translations must not move a light direction');
}
console.log('PASS: common unit light through camera rotations and Earth-scale translations');
