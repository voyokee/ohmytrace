import assert from 'node:assert/strict';
import { sampleVegetation } from '../src/scenery/vegetation-sampling.js';
import { prepareVegetation } from '../src/scenery/prepare-vegetation.js';
import { createRenderPolicy } from '../src/performance/render-policy.js';

const width = 128;
const pixels = (r, g, b) => {
  const data = new Uint8ClampedArray(width * width * 4);
  for (let k = 0; k < data.length; k += 4) data.set([r, g, b, 255], k);
  return data;
};
const options = { width, darkV: 0.3, blossom: false, cpx: width / 2, cpy: width / 2,
  mPerPx: 5, radius: 3000, x0: 8000, y0: 6000, n: 16384, seed: 42, treeCap: 80, flowerCap: 20 };
const forest = await sampleVegetation({ ...options, data: pixels(20, 60, 25) });
assert.equal(forest.length, options.treeCap, 'Dense forest must obey the budget');
assert.ok(forest.every(p => p.kind === 'tree' && Number.isFinite(p.lat) && Number.isFinite(p.lon)));
assert.deepEqual(forest, await sampleVegetation({ ...options, data: pixels(20, 60, 25) }), 'Placement must be deterministic');
assert.deepEqual(await sampleVegetation({ ...options, data: pixels(20, 40, 180) }), [], 'Water must not generate plants');
const meadow = await sampleVegetation({ ...options, data: pixels(70, 140, 60) });
assert.equal(meadow.length, options.flowerCap);
assert.ok(meadow.every(p => p.kind === 'flower'));
assert.deepEqual(await sampleVegetation({ ...options, flowerCap: 0, data: pixels(70, 140, 60) }), [], 'Winter has no wildflowers');
// Node has no browser Worker: this also exercises the cooperative fallback.
const signal = new AbortController().signal;
assert.deepEqual(await prepareVegetation(options, () => pixels(20, 60, 25), signal), forest);
const cancellation = new AbortController();
const work = prepareVegetation(options, () => pixels(20, 60, 25), cancellation.signal);
setTimeout(() => cancellation.abort(), 0);
await assert.rejects(work, error => error.name === 'AbortError', 'Leaving a place must cancel pixel analysis');

let now = 0, requests = 0;
const events = new Map();
globalThis.window = { devicePixelRatio: 2, addEventListener: (name, fn) => events.set(name, fn) };
globalThis.document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn) };
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
const viewer = { useDefaultRenderLoop: true, scene: { globe: { maximumScreenSpaceError: 2 },
  postProcessStages: { fxaa: { enabled: true } }, requestRender: () => requests++ } };
const policy = createRenderPolicy(viewer, { mobile: false, reducedMotion: false });
assert.equal(viewer.scene.requestRenderMode, true);
assert.equal(viewer.scene.maximumRenderTimeChange, Infinity);
assert.equal(viewer.targetFrameRate, undefined, 'Native input/update cadence must not be double-throttled');
assert.equal(policy.tick(1000), true);
assert.equal(policy.tick(1001), false);
assert.equal(policy.tick(1034), true);
assert.equal(viewer.resolutionScale, 0.75, 'Retina must not automatically quadruple the pixel budget');
for (let i = 0; i < 400; i++) { now += 34; policy.frame(now, true); }
assert.ok(policy.details().pixelRatio < 1.5, 'Sustained slow animation must reduce rendering resolution');
for (let i = 0; i < 1400; i++) { now += 70; policy.frame(now, true, 40); }
assert.equal(policy.details().pixelRatio, 0.85, 'Pixel resolution must stay above the lower bound');
assert.equal(viewer.scene.globe.maximumScreenSpaceError, 3, 'Persistent slow drawing must preserve a reasonable terrain detail floor');
const scaled = policy.details().pixelRatio;
policy.still(true);
assert.equal(policy.details().pixelRatio, 2, 'A settled globe must regain retina detail');
assert.equal(policy.details().quality, 'still');
assert.equal(viewer.scene.postProcessStages.fxaa.enabled, false, 'Retina stills must preserve surface detail without FXAA softening');
const stillRequests = requests;
policy.still(true);
assert.equal(requests, stillRequests, 'A settled globe must not start a new render loop');
policy.still(false);
assert.equal(viewer.scene.postProcessStages.fxaa.enabled, true, 'Motion must restore inexpensive edge antialiasing');
assert.equal(policy.details().pixelRatio, scaled, 'Motion must return to its adaptive pixel budget');
for (let i = 0; i < 400; i++) { now += 3000; policy.frame(now, false); }
assert.equal(policy.details().pixelRatio, scaled, 'Intentional idle gaps must not lower quality');
policy.home();
assert.equal(policy.details().pixelRatio, 1.5, 'Returning to the globe must restore its clear presentation');
assert.equal(viewer.scene.globe.maximumScreenSpaceError, 2);
document.hidden = true; events.get('visibilitychange')();
assert.equal(viewer.useDefaultRenderLoop, false);
document.hidden = false; events.get('visibilitychange')();
assert.equal(viewer.useDefaultRenderLoop, true);
assert.ok(requests > 0);
const phone = { scene: { globe: {}, requestRender() {} } };
const phonePolicy = createRenderPolicy(phone, { mobile: true, reducedMotion: false });
assert.equal(phonePolicy.details().pixelRatio, 1);
phonePolicy.still(true);
assert.equal(phonePolicy.details().pixelRatio, 1.5, 'Settled phone views must use a bounded clear presentation');
phonePolicy.home();
assert.equal(phonePolicy.details().pixelRatio, 1, 'Phone flights must keep the smaller animation budget');
console.log('PASS: bounded vegetation, terrain exclusions, deterministic placement, fallback/cancellation, adaptive resolution, still/motion quality, idle and visibility');
