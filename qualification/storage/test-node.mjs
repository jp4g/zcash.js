// Tracer bullet: each reopen uses a new actual worker and the same disk directory.
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs';
const root = mkdtempSync('/home/jack/zcash-storage-scratch/node-');
const active = new Set();
async function start(create = false) {
  const worker = new Worker(new URL('./node-worker.mjs', import.meta.url), { workerData: { root, create } });
  active.add(worker);
  return worker;
}
function call(worker, command) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(Error('worker deadline')); }, 15000);
    const done = (err, value) => {
      clearTimeout(timer); worker.off('message', message); worker.off('error', error); worker.off('exit', exit);
      err ? reject(err) : resolve(value);
    };
    const message = value => value.error ? done(Error(value.error)) : done(null, value);
    const error = err => done(err);
    const exit = code => done(Error(`unexpected worker exit ${code}`));
    worker.once('message', message); worker.once('error', error); worker.once('exit', exit);
    worker.postMessage(command);
  });
}
async function destroy(worker) { await worker.terminate(); active.delete(worker); }
try {
  let worker = await start(true);
  assert.equal((await call(worker, { op: 'open' })).rc, 0);
  assert.equal((await call(worker, { op: 'seed' })).rc, 0);
  assert.equal((await call(worker, { op: 'close' })).rc, 0);
  await destroy(worker);
  worker = await start();
  assert.equal((await call(worker, { op: 'open' })).rc, 0);
  assert.equal((await call(worker, { op: 'verify' })).rc, 0);
  assert.equal((await call(worker, { op: 'close' })).rc, 0);
  console.log(JSON.stringify({ test: 'commit-close-destroy-fresh-reopen', root, pass: true }));
} finally { await Promise.all([...active].map(destroy)); }
