import assert from 'node:assert/strict';
import { presentationState, geographicUV, TERRAIN_END, HERO_START, TERRAIN_PRELOAD } from '../src/rendering/presentation-state.js';
import { earthTexturePlan, constrainedDevice } from '../src/rendering/texture-policy.js';

const desktop = earthTexturePlan({ coarsePointer: false, maxTextureSize: 16384 });
assert.equal(desktop.surfaceWidth, 5400, 'A fine-pointer desktop must retain native surface detail, including in narrow panels');
assert.equal(desktop.previewWidth, 2048, 'Detailed textures must not delay the lightweight first presentation');
assert.equal(constrainedDevice({ coarsePointer: false }), false);
assert.equal(earthTexturePlan({ coarsePointer: true, maxTextureSize: 8192 }).surfaceWidth, 4096,
  'Touch devices should receive surface detail without the full desktop memory budget');
assert.equal(earthTexturePlan({ memoryGB: 2, maxTextureSize: 8192 }).surfaceWidth, 2048,
  'Known low-memory devices must retain the small texture budget');
assert.equal(earthTexturePlan({ maxTextureSize: 1024 }).surfaceWidth, 1024, 'Respect actual GPU texture limits');
assert.equal(earthTexturePlan({ maxTextureSize: 4096 }).surfaceWidth, 4096);
const flagship=earthTexturePlan({coarsePointer:true,memoryGB:8,maxTextureSize:8192});
assert.equal(flagship.surfaceWidth,5400,'High-memory touch devices can retain full surface detail');
assert.equal(flagship.constrained,true,'Sharper textures must not silently increase phone vegetation budgets');

for (const altitude of [0, 10000, TERRAIN_END, 1000000, HERO_START, TERRAIN_PRELOAD, 35000000]) {
  const pending = presentationState(altitude, false);
  assert.equal(pending.terrain, true, 'Unready presentation assets must leave the real globe available');
  assert.equal(pending.surface, false);
  const ready = presentationState(altitude, true);
  assert.ok(ready.surface || ready.terrain, 'A camera transition must never hide both Earth renderers');
}
assert.equal(presentationState(TERRAIN_END, true).phase, 'terrain');
assert.equal(presentationState(HERO_START, true).phase, 'earth');
assert.equal(presentationState(HERO_START + 1, true).terrain, true, 'Terrain must preload behind the fully opaque presentation before descent');
assert.equal(presentationState(TERRAIN_PRELOAD, true).terrain, false, 'Distant views must stop rendering terrain tiles');
let previous = -1;
for (let altitude = 0; altitude <= 5000000; altitude += 10000) {
  const { mix } = presentationState(altitude, true);
  assert.ok(mix >= previous && mix >= 0 && mix <= 1);
  previous = mix;
}
assert.deepEqual(geographicUV(0, 0), [0.5, 0.5]);
assert.deepEqual(geographicUV(-180, 90), [0, 1]);
assert.deepEqual(geographicUV(180, -90), [0, 0]);
assert.deepEqual(geographicUV(540, -90), geographicUV(180, -90));
const shanghai = geographicUV(121.4737, 31.2304);
assert.ok(shanghai[0] > 0.83 && shanghai[0] < 0.84 && shanghai[1] > 0.67 && shanghai[1] < 0.68,
  'Shanghai must align with east Asia in the global data, without a longitude or north/south flip');
console.log('PASS: device/GPU texture budgets, global/terrain handoff, asset fallback, preload, monotonic fading and geographic alignment');
