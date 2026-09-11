// HOST CONTROL ONLY: deliberately no WASM, no Rayon execution claim.
import { parentPort } from 'node:worker_threads';
let fault;
parentPort.on('message', data => {
  if (data.type === 'init') {
    fault = data.fault;
    if (data.role === 'owner') parentPort.postMessage({ type: 'pool' });
    else if (fault === 'compute-error' && data.index === 1) throw Error('control compute error');
    else if (fault === 'compute-stall' && data.index === 1) return;
    else parentPort.postMessage({ type: 'loaded' });
  } else if (data.type === 'build') {
    if (fault === 'owner-blocked') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    else parentPort.postMessage({ type: 'ready' });
  }
});
