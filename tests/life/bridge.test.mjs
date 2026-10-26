import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifeBridge} from '../../src/life/app-bridge.js';
const sceneCSV='日期,行程,地点,坐标\n2025,景观演示,测试森林,"30,110"';
test('scene demos cannot claim successful durable user writes',async()=>{
  const bridge=await createLifeBridge({sceneCSV});
  await assert.rejects(bridge.importCSV(sceneCSV,'replace'),/演示/);
  await assert.rejects(bridge.editRows(bridge.editDraft()),/演示/);
  await assert.rejects(bridge.clear(),/演示/);
  await assert.rejects(bridge.restore(bridge.repository.backup()),/演示/);
  assert.equal(await bridge.repository.store.read(),null);
});
