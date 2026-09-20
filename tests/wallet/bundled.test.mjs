import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createWalletClient, defineNetwork } from '@jp4g/zcash.js';
import { packageProving } from '../../dist/src/runtime/package-proving.js';
import { ProvingAssets, saplingAssets } from '../../dist/src/wallet/proving-assets.js';

test('bundled proving files load offline through the canonical integrity checks', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('bundled proving must not fetch external assets'); });
  const options = packageProving();
  const assets = new ProvingAssets(options);
  try {
    const result = await assets.sapling();
    assert.equal(result.spend.length, saplingAssets[0].byteLength);
    assert.equal(result.output.length, saplingAssets[1].byteLength);
  } finally { await assets.close(); }
  const corrupt = new ProvingAssets({ ...options, async loadAsset(args) {
    const bytes = await options.loadAsset(args);
    bytes[0] ^= 1;
    return bytes;
  } });
  try { await assert.rejects(corrupt.sapling(), { code: 'ASSET_INTEGRITY' }); }
  finally { await corrupt.close(); }
});

test('root import opens the shipped engine offline and persists an account without runtime configuration', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('bundled Node wallet must not fetch executable assets'); });
  const parent = new URL('../../.local/tests/', import.meta.url);
  await mkdir(parent, { recursive: true });
  const path = await mkdtemp(new URL('bundled-', parent).pathname);
  t.after(() => rm(path, { recursive: true, force: true }));
  const fixture = JSON.parse(await readFile(new URL('../fixtures/wallet/bundle/tests/views-fixture.json', import.meta.url)));
  const network = await defineNetwork({ identity: 'bundled-test', genesisHash: '03'.repeat(32),
    parametersFormat: 'zcash-js-network/1', parameters: new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}') });
  const options = { network, storage: { kind: 'node-filesystem', path },
    confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true },
    observation: { pollIntervalMs: 1000, maxBufferedUpdates: 16 }, recovery: { mode: 'offline' } };
  let account, address;
  for (const reopen of [false, true]) {
    const wallet = await createWalletClient(options);
    try {
      if (!reopen) {
        account = await wallet.accounts.import({ ...fixture.import, birthday: 'fullScan' });
        address = await wallet.addresses.next({ accountId: account.id, request: { format: 'transparent' } });
      } else {
        assert.deepEqual(await wallet.accounts.get({ accountId: account.id }), account);
        assert.ok((await wallet.addresses.list({ accountId: account.id })).some(item => item.address === address.address));
      }
      assert.equal((await wallet.getBalance({ accountId: account.id })).amounts, null);
    } finally { await wallet.close(); }
  }
});
