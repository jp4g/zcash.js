// Actual packaged bootstrap + Rust owner; no injected module/worker implementation.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once, on } from 'node:events';
import { Worker, MessageChannel } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { attachWalletWorker } from '../../dist/src/wallet/host.js';

assert.ok(process.argv[2], 'supply the actual wallet package directory');
const packet = resolve(process.argv[2]);
const manifestBytes = await readFile(`${packet}/manifest.json`);
const manifest = JSON.parse(manifestBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of manifest.files) {
  const bytes = await readFile(`${packet}/${file.url}`);
  assert.equal(bytes.length, file.byteLength); assert.equal(digest(bytes), file.sha256, file.url);
}
assert.equal(digest(await readFile(`${packet}/build.json`)), manifest.buildSha256);
assert.equal(digest(await readFile(`${packet}/dependency-graph.json`)), manifest.dependencyGraphSha256);
const { format, files, ...expected } = manifest;
const wasm = new Uint8Array(await readFile(`${packet}/bindings_bg.wasm`));
const parameters = new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
const fixtureBytes = await readFile('/home/jack/zakura-account-compose-scratch/fixes/r1/balance-build-03/bundle/tests/views-fixture.json');
assert.equal(digest(fixtureBytes), '731843024627c13dd4a7b56a8b70220b1eac1ce56d2b56e0f883a1695ea18f44');
const fixture = JSON.parse(fixtureBytes);
const root = await mkdtemp('/tmp/wallet-runtime-node-');
let destructions = 0;
const initialize = { type: 'initialize', moduleUrl: pathToFileURL(`${packet}/wallet.mjs`).href,
  wasm, expected, maxMemoryBytes: 4096 * 65536 };
function start() {
  const worker = new Worker(pathToFileURL(`${packet}/worker.mjs`), { trackUnmanagedFds: true });
  const messages = []; worker.on('message', value => messages.push(value));
  return { worker, messages,
    async request(value, transfer = []) {
      const pending = once(worker, 'message', { signal: AbortSignal.timeout(10000) });
      worker.postMessage(value, transfer); return (await pending)[0];
    },
    async stop() { await worker.terminate(); destructions++; },
  };
}
function openRequest(path, port, genesis = new Uint8Array(32).fill(3)) {
  return { type: 'open', hostUrl: pathToFileURL(`${packet}/node-fs.mjs`).href,
    storage: { kind: 'node-filesystem', path }, parametersFormat: 'zcash-js-network/1', parameters, genesis, port };
}
for (const [name, change, code] of [
  ['memory', { maxMemoryBytes: 65536 }, 'RESOURCE_LIMIT'],
  ['profile', { expected: { ...expected, contractRevision: 'incompatible' } }, 'PROTOCOL_MISMATCH'],
]) {
  const owner = start(), { port1, port2 } = new MessageChannel();
  try {
    assert.deepEqual(await owner.request({ ...initialize, ...change }), { type: 'failure', code });
    assert.deepEqual(await owner.request(openRequest(`${root}/${name}`, port2), [port2]), { type: 'failure', code: 'PROTOCOL_MISMATCH' });
    assert.equal(existsSync(`${root}/${name}`), false, 'failed initialization cannot acquire storage');
  } finally { port1.close(); await owner.stop(); }
}
for (const name of ['genesis', 'before-ready', 'pending-initialize']) {
  const owner = start(), { port1, port2 } = new MessageChannel();
  try {
    if (name === 'genesis') {
      assert.equal((await owner.request(initialize)).type, 'ready');
      assert.equal(existsSync(`${root}/${name}`), false, 'handshake has not created storage');
    } else if (name === 'pending-initialize') {
      const replies = on(owner.worker, 'message', { signal: AbortSignal.timeout(10000) });
      owner.worker.postMessage(initialize);
      owner.worker.postMessage({ type: 'invalid-control' });
      // Startup may finish first. Either scheduling order must remain terminal after failure.
      for await (const [reply] of replies) {
        if (reply.type === 'failure') { assert.equal(reply.code, 'PROTOCOL_MISMATCH'); break; }
        assert.equal(reply.type, 'ready');
      }
    }
    assert.deepEqual(await owner.request(openRequest(`${root}/${name}`, port2,
      name === 'genesis' ? new Uint8Array(1) : undefined), [port2]),
    { type: 'failure', code: name === 'genesis' ? 'INVALID_ARGUMENT' : 'PROTOCOL_MISMATCH' });
    assert.equal(existsSync(`${root}/${name}`), false, 'invalid input must precede directory/lock creation');
    if (name === 'pending-initialize') assert.ok(owner.messages.every(message => message.type !== 'opened'));
  } finally { port1.close(); await owner.stop(); }
}
let savedAccount, savedAddresses;
for (const reopened of [false, true]) {
  const owner = start(), { port1, port2 } = new MessageChannel();
  let host;
  try {
    const ready = await owner.request(initialize);
    assert.equal(ready.type, 'ready'); assert.equal(ready.identity.buildSha256, manifest.buildSha256);
    if (!reopened) assert.equal(existsSync(`${root}/wallet`), false);
    assert.deepEqual(await owner.request(openRequest(`${root}/wallet`, port2), [port2]), { type: 'opened' });
    host = attachWalletWorker(port1, () => owner.stop(), { maxQueuedJobs: 8, maxQueuedBytes: 65536 });
    owner.worker.on('error', host.crashed); owner.worker.on('exit', host.crashed);
    if (!reopened) {
      savedAccount = await host.accounts.import({ ...fixture.import, birthday: 'fullScan' });
      const address = await host.addresses.next({ accountId: savedAccount.id, request: { format: 'transparent' } });
      savedAddresses = await host.addresses.list({ accountId: savedAccount.id });
      assert.ok(savedAddresses.some(item => item.address === address.address));
    } else {
      assert.deepEqual(await host.accounts.get({ accountId: savedAccount.id }), savedAccount);
      assert.deepEqual(await host.addresses.list({ accountId: savedAccount.id }), savedAddresses);
    }
    const balance = await host.getBalance({ accountId: savedAccount.id,
      confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } });
    assert.equal(balance.accountId, savedAccount.id); assert.equal(balance.amounts, null);
    assert.equal(typeof balance.scan.revision, 'string'); assert.equal(balance.scan.scanComplete, null);
    const closed = host.close(); assert.equal(host.close(), closed); await closed;
  } finally { if (host) await host.close().catch(() => {}); else { port1.close(); await owner.stop(); } }
}
assert.equal(destructions, 7);
console.log(JSON.stringify({ pass: true, packet, manifestSha256: digest(manifestBytes), root,
  cases: ['memory', 'profile', 'genesis', 'before-ready', 'pending-initialize', 'native-persist-reopen'], destructions }));
