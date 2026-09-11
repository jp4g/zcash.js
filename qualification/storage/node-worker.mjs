import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { acquire } from './node-fs.mjs';
import { dispatch } from './dispatch.mjs';
let host, runtime, failure;
try {
  host = acquire(workerData.root, { create: workerData.create, crash: v => parentPort.postMessage(v) });
  const bundle = workerData.bundle ?? '/home/jack/zcash-storage-scratch/bundle';
  const { load } = await import(pathToFileURL(`${bundle}/load.mjs`));
  runtime = await load(readFileSync(`${bundle}/storage_bg.wasm`), host);
} catch (e) { host?.release(); failure = { error: e.message, code: e.code ?? e.name }; }
parentPort.on('message', command => {
  if (failure) { parentPort.postMessage(failure); return; }
  try { parentPort.postMessage(dispatch(runtime.e, runtime.state, host, command)); }
  catch (e) { failure = { error: e.stack }; parentPort.postMessage(failure); }
});
