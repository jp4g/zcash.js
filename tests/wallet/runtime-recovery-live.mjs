// Explicit testnet check on a private COPY of a closed wallet; never submits.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, stat, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { defineNetwork, createLightClient, grpc } from '../../dist/src/index.js';
import { networkBinding } from '../../dist/src/network.js';
import { openWalletRuntime, runtimeOptions } from '../../dist/src/runtime/wallet.js';
import { syncWallet, WalletSync } from '../../dist/src/wallet/sync.js';

assert.ok(process.argv[2], 'closed testnet wallet directory required');
const source = resolve(process.argv[2]);
const mode = process.argv[3] ?? 'revision';
assert.ok(['revision', 'source-change'].includes(mode));
const copy = await mkdtemp(join(tmpdir(), 'zcash-recovery-copy-'));
let runtime;
try {
  // The application's native owner uses the same advisory lock. Only copy a
  // checkpointed, closed database; a hot journal/WAL needs SQLite backup instead.
  for (const suffix of ['-journal', '-wal']) {
    try { assert.equal((await stat(join(source, `wallet.db${suffix}`))).size, 0); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await access(join(source, 'owner.lock'));
  execFileSync('/usr/bin/flock', ['--exclusive', '--nonblock', join(source, 'owner.lock'),
    'cp', '--preserve=mode', join(source, 'wallet.db'), join(copy, 'wallet.db')]);
  const network = await defineNetwork({ identity: 'zcash-testnet',
    genesisHash: '05a60a92d99d85997cce3b87616c089f6124d7342af37106edc76126334a2c38',
    parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode(JSON.stringify({ encoding: 'test',
      Overwinter: 207500, Sapling: 280000, Blossom: 584000, Heartwood: 903800,
      Canopy: 1028500, Nu5: 1842420, Nu6: 2976000, Nu6_1: 3536500,
      Nu6_2: 4052000, Nu6_3: 4134000 })) });
  const light = createLightClient({ network, transport: grpc('https://testnet.zec.rocks:443', {
    sourceId: 'testnet-acceptance', timeoutMs: 30000, readRetry: { attempts: 2, delayMs: 500 },
    maxResponseBytes: 4 * 1024 * 1024,
  }) });
  const bound = networkBinding(network).definition;
  runtime = await openWalletRuntime({ runtime: runtimeOptions(),
    storage: { kind: 'node-filesystem', path: copy },
    network: { identity: bound.identity, genesisHash: bound.genesisHash,
      parametersFormat: bound.parametersFormat, parameters: bound.parameters.bytes } });
  const session = runtime.session;
  const inventory = await session.payments.list({ afterSequence: '0', limit: 200 });
  let before;
  for (const item of inventory.items) {
    const value = await session.payments.get({ operationId: item.operationId });
    if (value.state.steps[0]?.observation && value.state.steps[0]?.txid) { before = value; break; }
  }
  assert.ok(before, 'an observed finalized operation is required');
  const target = await light.getTip();
  assert.ok(target.height > (await session.scan.state()).maxScannedHeight, 'wallet must have new blocks to scan');
  let injected = 0, rejected = 0, ingested = 0, changeHeight, tips = 0;
  const racing = { ...session, scan: { ...session.scan,
    async plan(args) {
      const plan = await session.scan.plan(args);
      if (mode === 'source-change' && !injected && plan.ranges.length) changeHeight = plan.ranges[0].start - 1;
      if (mode === 'revision' && !injected && plan.ranges.length) {
        await session.payments.observe({ operationId: before.state.operationId, stepIndex: 0,
          observation: before.state.steps[0].observation, wallTimeMs: Date.now() });
        assert.notEqual((await session.scan.state()).revision, plan.revision);
        injected++;
      }
      return plan;
    },
    async ingest(args) {
      try { const result = await session.scan.ingest(args); ingested++; return result; }
      catch (error) { if (error.code === 'CURSOR_STALE') rejected++; throw error; }
    },
  } };
  const moving = { ...light,
    async getTip(args) { tips++; return light.getTip(args); },
    async getTreeState(args) {
      const tree = await light.getTreeState(args);
      if (!injected && args.height === changeHeight) {
        // Synthetic changed predecessor metadata must be rejected before native
        // ingestion. Subsequent reads return the real stable source again.
        injected++;
        return { ...tree, point: { ...tree.point,
          hash: (tree.point.hash.startsWith('00') ? '01' : '00') + tree.point.hash.slice(2) } };
      }
      return tree;
    },
  };
  const signal = AbortSignal.timeout(180000);
  const result = mode === 'revision'
    ? await syncWallet(racing, light, target, signal)
    : (await new WalletSync(racing, moving, { pollIntervalMs: 1000, maxBufferedUpdates: 8 }).sync({ signal })).scan;
  assert.equal(injected, 1);
  if (mode === 'revision') assert.equal(rejected, 1, 'actual native ingest must reject the stale plan');
  else assert.equal(tips, 2, 'changed source must trigger a fresh validated pass');
  assert.ok(ingested > 0);
  assert.equal(result.scanComplete, true);
  assert.ok(result.fullyScannedHeight >= target.height);
  const after = await session.payments.get({ operationId: before.state.operationId });
  const identity = value => value.state.steps.map(({ txid, exactBytesSha256, attempts }) => ({ txid, exactBytesSha256, attempts }));
  assert.deepEqual(identity(after), identity(before));
  console.log(JSON.stringify({ mode, runtimeRecovery: 'passed', injected, rejected, ingested,
    fullyScannedHeight: result.fullyScannedHeight, transactionIdentityUnchanged: true, newSubmissions: 0 }));
} finally {
  try { await runtime?.close(); }
  finally { await rm(copy, { recursive: true, force: true }); }
}
