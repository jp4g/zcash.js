// Synthetic orchestration controls only; no SQLite/crypto execution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { lifecycle, assertSchemaAbsent } = require('./lifecycle.cjs');
test('schema absence rejects query failure and existing table', () => {
  assertSchemaAbsent(0);
  for (const result of [-1, 1, undefined]) assert.throws(() => assertSchemaAbsent(result));
});
test('replacement starts only after original worker terminates', async () => {
  const workers = [];
  await lifecycle(scenario => {
    if (workers.length) assert.equal(workers[0].threadId, -1);
    const worker = new Worker(`require('node:worker_threads').parentPort.postMessage({ok:true}); setInterval(()=>{},1000)`, {eval:true});
    workers.push(worker);
    assert.equal(scenario, workers.length === 1 ? 'destruction' : 'destruction-fresh');
    return worker;
  });
  assert.equal(workers.length, 2);
  for (const worker of workers) assert.equal(worker.threadId, -1);
});
