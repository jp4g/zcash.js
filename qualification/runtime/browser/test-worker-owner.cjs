// Synthetic lifecycle controls only. These do not establish browser execution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runOwnedWorker } = require('./worker-owner.cjs');

test('success waits for observed worker close before replacement', async () => {
  const worker = new EventEmitter();
  let exited = false;
  const result = await runOwnedWorker({ worker, operation: async () => 42,
    terminate: async () => setTimeout(() => { exited = true; worker.emit('close'); }, 10),
    timeoutMs: 500 });
  assert.equal(result, 42);
  assert.equal(exited, true);
  assert.equal(worker.listenerCount('close'), 0);
});

test('deadline terminates a hung worker and waits for close', async () => {
  const worker = new EventEmitter();
  let terminated = false;
  await assert.rejects(runOwnedWorker({ worker, operation: () => new Promise(() => {}),
    terminate: async () => { terminated = true; worker.emit('close'); }, timeoutMs: 20 }),
  /worker operation deadline/);
  assert.equal(terminated, true);
  assert.equal(worker.listenerCount('close'), 0);
});

test('worker exception still triggers observed destruction', async () => {
  const worker = new EventEmitter();
  let exited = false;
  await assert.rejects(runOwnedWorker({ worker, operation: async () => { throw Error('fixture failed'); },
    terminate: async () => { exited = true; worker.emit('close'); }, timeoutMs: 100 }), /fixture failed/);
  assert.equal(exited, true);
});

test('termination request without observed death cannot pass', async () => {
  const worker = new EventEmitter();
  await assert.rejects(runOwnedWorker({ worker, operation: async () => 42,
    terminate: async () => {}, timeoutMs: 20 }), /worker destruction deadline/);
  assert.equal(worker.listenerCount('close'), 0);
});

test('premature death cannot count as success', async () => {
  const worker = new EventEmitter();
  await assert.rejects(runOwnedWorker({ worker, operation: async () => {
    worker.emit('close'); return 42;
  }, terminate: async () => {}, timeoutMs: 100 }), /worker closed before result/);
});
