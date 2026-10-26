import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';

test('existing marker driver counts a returning Trip once per Place while retaining every Stop',()=>{
  const app=readFileSync(new URL('../../app.js',import.meta.url),'utf8'),start=app.indexOf('function renderMarkers() {'),end=app.indexOf('function markerTarget(',start);
  assert.ok(start>=0&&end>start);
  const trips=[{id:'return',stops:[{place:'A'},{place:'B'},{place:'A'}]},{id:'other',stops:[{place:'B'},{place:'A'}]}];
  // Exercise the actual app aggregation; only GPU/DOM setup and rendering are
  // stubbed. The Stop sequence remains available to the real replay caller.
  const info=vm.runInNewContext(app.slice(start,end)+'\nrenderMarkers(); markerInfo;',{
    viewer:{},mapChooser:{},footprintOverlay:{},markerInfo:new Map(),trips,homes:[],syncLights(){},updateMarkerClasses(){}});
  assert.equal(info.get('A').trips.length,2,'A-B-A must not count as two separate Trips to A');assert.equal(info.get('B').trips.length,2);assert.equal(trips[0].stops.length,3);
});
