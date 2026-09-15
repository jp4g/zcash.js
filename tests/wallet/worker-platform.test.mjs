import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stageWalletWorkers } from '../../dist/src/runtime/worker-platform.js';

test('staged workers share messaging, transfer, termination, and asset cleanup', async () => {
  const code = new TextEncoder().encode(`
    import { parentPort } from 'node:worker_threads';
    parentPort.on('message', ({ port }) => port.postMessage('ready'));
  `);
  const copied = [];
  const platform = await stageWalletWorkers(name => { copied.push(name); return code; }, true, () => {});
  const workers = [], channels = [];
  try {
    assert.deepEqual(copied, ['wallet.mjs', 'worker.mjs', 'node-fs.mjs', 'thread-bootstrap.mjs']);
    for (const name of ['worker.mjs', 'thread-bootstrap.mjs']) {
      const channel = platform.channels();
      channels.push(channel);
      const ready = new Promise((resolve, reject) => {
        channel.port1.onmessage = event => resolve(event.data);
        const worker = platform.spawn(name, { message: resolve, error: reject, messageerror: reject });
        workers.push(worker);
        worker.postMessage({ port: channel.port2 }, [channel.port2]);
      });
      assert.equal(await ready, 'ready');
    }
  } finally {
    for (const worker of workers) {
      worker.removeEvents();
      await worker.terminate();
    }
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    platform.dispose();
  }
  for (const url of Object.values(platform.urls)) assert.equal(existsSync(fileURLToPath(url)), false);
  await assert.rejects(stageWalletWorkers(() => assert.fail('must not stage'), false, () => {
    throw new Error('cancelled');
  }), /cancelled/);
});
