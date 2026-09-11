import { Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs';
import { suite } from './suite.mjs';
await suite({
  root: () => mkdtempSync('/home/jack/zcash-storage-scratch/suite-'),
  start(root, create) {
    const worker = new Worker(new URL('./node-worker.mjs', import.meta.url), { workerData: { root, create } });
    // Retain startup errors until a request attaches; no unhandled worker errors.
    let startupError; worker.on('error', e => { startupError = e; });
    return {
      call(command) {
        return new Promise((resolve, reject) => {
          if (startupError) return reject(startupError);
          const timer = setTimeout(() => { worker.terminate(); done(Error('external worker request timeout')); }, 15000);
          const done = (e, value) => {
            clearTimeout(timer); worker.off('message', message); worker.off('error', error); worker.off('exit', exit);
            e ? reject(e) : resolve(value);
          };
          const message = v => done(null, v);
          const error = e => done(e);
          const exit = code => done(Error(`unexpected exit ${code}`));
          worker.once('message', message); worker.once('error', error); worker.once('exit', exit); worker.postMessage(command);
        });
      },
      async destroy() { await worker.terminate(); },
    };
  },
}, r => console.log(JSON.stringify(r)));
