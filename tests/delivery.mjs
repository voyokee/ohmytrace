import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('assets/earth/manifest.json', root), 'utf8'));
for (const entry of manifest) {
  const bytes = await readFile(new URL('assets/earth/' + entry.file, root));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.file + ' must match the downloaded original');
}
const html = await readFile(new URL('index.html', root), 'utf8');
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
  assert.ok(!/^https?:/.test(match[1]), 'Startup scripts and styles must be bundled locally');
  await access(new URL(match[1].split('?')[0], root));
}
for (const path of ['vendor/cesium/Workers/createEllipsoidGeometry.js', 'vendor/cesium/Assets/approximateTerrainHeights.json',
  'vendor/cesium/LICENSE.md', 'vendor/cesium/ThirdParty.json', 'assets/clouds-nasa.jpg']) await access(new URL(path, root));
console.log('PASS: asset integrity, local engine/bootstrap, worker assets and license notices');
