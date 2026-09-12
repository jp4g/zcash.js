import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Worker, MessageChannel } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { attachWalletWorker } from '../../dist/src/wallet/host.js';

const packet = '/home/jack/zakura-account-compose-scratch/fixes/r1/balance-build-03';
const bundle = pathToFileURL(`${packet}/bundle/`).href;
const build = JSON.parse(await readFile(`${packet}/build.json`));
for (const name of ['bindings.js', 'bindings_bg.wasm', 'views.mjs', 'wallet.mjs', 'bytes.mjs',
  'wallet-host/storage-host.mjs', 'wallet-host/node-fs.mjs', 'tests/views-fixture.json']) {
  assert.equal(createHash('sha256').update(await readFile(new URL(name, bundle))).digest('hex'), build.artifacts[name], name);
}
const fixture = JSON.parse(await readFile(new URL('tests/views-fixture.json', bundle)));
const { initialize } = await import(new URL('tests/wallet-support.mjs', bundle));

test('production port bridge uses real Rust filesystem account/address/balance persistence', async () => {
  const root = await mkdtemp('/tmp/zcash-wallet-host-');
  let destructions = 0;
  async function open(create) {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(new URL('./host-native-worker.mjs', import.meta.url), {
      workerData: { ...initialize(), bundle, root, create, port: port2 }, transferList: [port2], trackUnmanagedFds: true,
    });
    const host = attachWalletWorker(port1, async () => { await worker.terminate(); destructions++; },
      { maxQueuedJobs: 8, maxQueuedBytes: 65536 });
    worker.on('error', host.crashed); worker.on('exit', host.crashed);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('native startup deadline')), 10000);
        worker.once('message', value => { clearTimeout(timer); value.ready ? resolve() : reject(Error('native startup failed')); });
        worker.once('error', error => { clearTimeout(timer); reject(error); });
      });
    } catch (error) { host.crashed(); await host.close().catch(() => {}); throw error; }
    return host;
  }
  let host = await open(true), account, addresses;
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(host.accounts.import({ ...fixture.import, birthday: 'fullScan', signal: controller.signal }), { code: 'ABORTED' });
    assert.deepEqual(await host.accounts.list(), []);
    account = await host.accounts.import({ ...fixture.import, birthday: 'fullScan' });
    const initial = await host.addresses.list({ accountId: account.id });
    const next = await host.addresses.next({ accountId: account.id, request: { format: 'transparent' } });
    addresses = await host.addresses.list({ accountId: account.id });
    assert.ok(addresses.length > initial.length);
    assert.ok(addresses.some(item => item.address === next.address));
    assert.deepEqual(await host.getBalance({ accountId: account.id,
      confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } }), { accountId: account.id, amounts: null });
  } finally { await host.close(); }
  host = await open(false);
  try {
    assert.deepEqual(await host.accounts.get({ accountId: account.id }), account);
    assert.deepEqual(await host.addresses.list({ accountId: account.id }), addresses);
  } finally { await host.close(); }
  assert.equal(destructions, 2);
});
