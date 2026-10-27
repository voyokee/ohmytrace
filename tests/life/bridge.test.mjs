import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifeBridge} from '../../src/life/app-bridge.js';
import {MemoryStore} from '../../src/life/repository.js';
const sceneCSV='日期,行程,地点,坐标\n2025,景观演示,测试森林,"30,110"';
test('scene demos cannot claim successful durable user writes',async()=>{
  const bridge=await createLifeBridge({sceneCSV});
  await assert.rejects(bridge.importCSV(sceneCSV,'replace'),/演示/);
  await assert.rejects(bridge.editRows(bridge.editDraft()),/演示/);
  await assert.rejects(bridge.clear(),/演示/);
  await assert.rejects(bridge.restore(bridge.repository.backup()),/演示/);
  assert.equal(await bridge.repository.store.read(),null);
});
const sampleCSV='日期,行程,地点,坐标\n2024-08,示例旅行,示例地点,"30,110"';
test('first visits start empty and the fictional sample is opt-in, ephemeral and reversible',async()=>{
  const bridge=await createLifeBridge({defaultCSV:sampleCSV,store:new MemoryStore()});
  assert.equal(bridge.repository.getDataset().meta.origin,'new');
  assert.equal(bridge.repository.getDataset().visits.length,0);
  assert.equal(bridge.canPreviewDemo(),true);
  assert.equal(bridge.previewDemo(),true);
  assert.equal(bridge.repository.getDataset().meta.origin,'demo');
  assert.equal(bridge.repository.getDataset().visits.length,1);
  assert.equal(await bridge.repository.store.read(),null);
  assert.equal(bridge.exitDemo(),true);
  assert.equal(bridge.repository.getDataset().meta.origin,'new');
  assert.equal(bridge.repository.getDataset().visits.length,0);
  assert.equal(await bridge.repository.store.read(),null);
});
test('the sample cannot replace saved personal data',async()=>{
  const bridge=await createLifeBridge({defaultCSV:sampleCSV,store:new MemoryStore()});
  await bridge.importCSV('日期,行程,地点,坐标\n2025-01,真实旅行,真实地点,"31,121"','replace');
  assert.equal(bridge.canPreviewDemo(),false);
  assert.equal(bridge.previewDemo(),false);
  assert.equal(bridge.exitDemo(),false);
  assert.equal(bridge.repository.getDataset().meta.origin,'user');
});
test('importing while the sample is shown replaces it with personal data',async()=>{
  const bridge=await createLifeBridge({defaultCSV:sampleCSV,store:new MemoryStore()});
  bridge.previewDemo();
  await bridge.importCSV('日期,行程,地点,坐标\n2025-01,真实旅行,真实地点,"31,121"','append');
  const saved=await bridge.repository.store.read();
  assert.equal(saved.meta.origin,'user');
  assert.deepEqual(saved.trips.map(t=>t.title),['真实旅行']);
});
