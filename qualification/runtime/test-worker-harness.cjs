// Synthetic worker controls only; no WASM, SQL or crypto qualification.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { runWorker } = require('./worker-harness.cjs');
for (const mode of ['deadline', 'cancel', 'exit-zero', 'exit-nonzero', 'success', 'error']) {
  test(mode, { timeout: 3000 }, async () => {
    const controller = new AbortController();
    const source = mode.startsWith('exit') ? `process.exit(${mode === 'exit-zero' ? 0 : 2})` :
      mode === 'success' ? `require('node:worker_threads').parentPort.postMessage({ok:true}); setInterval(()=>{},1000)` :
      mode === 'error' ? `throw new Error('control error')` : 'while(true) {}';
    const worker = new Worker(source, { eval: true });
    const result = runWorker(worker, { signal: controller.signal, deadlineMs: 150 });
    if (mode === 'cancel') setTimeout(() => controller.abort(), 50);
    if (mode === 'success') assert.deepEqual(await result, {ok:true});
    else await assert.rejects(result, mode.startsWith('exit') ? /premature worker exit/ :
      mode === 'error' ? /control error/ : /deadline|abort/i);
    assert.equal(worker.threadId, -1, 'settlement must await worker teardown');
  });
}
