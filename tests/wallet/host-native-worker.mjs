// Test entry: real accepted Rust owner, with the production SDK message bridge.
import { installWalletWorker } from '../../dist/src/wallet/worker.js';
const node = typeof process !== 'undefined' && process.versions?.node;
async function initialize(options, reply) {
  const { initializeViews } = await import(new URL('views.mjs', options.bundle));
  const { acquire } = await import(new URL(`wallet-host/${node ? 'node-fs' : 'opfs'}.mjs`, options.bundle));
  const backend = await acquire(options.root, { create: options.create });
  const wasmUrl = new URL('bindings_bg.wasm', options.bundle);
  const wasm = node ? new Uint8Array(await (await import('node:fs/promises')).readFile(wasmUrl))
    : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  const owner = await initializeViews(wasm, backend, options.format, options.parameters, options.genesis);
  installWalletWorker(owner, options.port);
  reply({ ready: true });
}
if (node) {
  const { parentPort, workerData } = await import('node:worker_threads');
  await initialize(workerData, value => parentPort.postMessage(value));
} else self.onmessage = ({ data }) => {
  self.onmessage = null;
  void initialize(data, value => self.postMessage(value)).catch(error => { self.postMessage({ error: String(error) }); });
};
