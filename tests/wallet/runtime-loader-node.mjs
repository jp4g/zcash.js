// Real TLS acquisition, reviewed executable bytes, actual worker/Rust filesystem wallet.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { openWalletRuntime } from '../../dist/src/runtime/wallet.js';

assert.ok(process.argv[2], 'actual reviewed package directory required');
const packet = process.argv[2], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(`${packet}/manifest.json`), manifest = JSON.parse(manifestBytes);
const assets = new Map([['manifest.json', manifestBytes]]);
for (const file of manifest.files) {
  const bytes = await readFile(`${packet}/${file.url}`);
  assert.equal(sha(bytes), file.sha256); assets.set(file.url, bytes);
}
const canonical = value => value && typeof value === 'object' ? Array.isArray(value)
  ? `[${value.map(canonical)}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)}}` : JSON.stringify(value);
const alteredWorker = Buffer.concat([assets.get('worker.mjs'), Buffer.from('\n// unreviewed closure\n')]);
const altered = structuredClone(manifest), workerFile = altered.files.find(file => file.url === 'worker.mjs');
workerFile.sha256 = sha(alteredWorker); workerFile.byteLength = alteredWorker.length;
const alteredManifest = Buffer.from(canonical(altered));
const requests = [], unexpected = [];
let stalled;
const stalledRequest = new Promise(resolve => { stalled = resolve; });
const certificate = '/home/jack/zcash-runtime-artifacts-scratch';
const server = createServer({ key: await readFile(`${certificate}/server.key`), cert: await readFile(`${certificate}/server.crt`) }, (req, res) => {
  requests.push(req.url);
  if (req.headers.cookie || req.headers.authorization) unexpected.push('credentials');
  const [, mode, name] = req.url.split('/');
  if (!assets.has(name)) { unexpected.push(req.url); res.writeHead(404).end(); return; }
  if (mode === 'stall') { res.writeHead(200); res.write('{'); stalled(); return; }
  let bytes = assets.get(name);
  if (mode === 'tamper' && name === 'wallet.mjs') bytes = Buffer.from('invalid executable');
  if (mode === 'unreviewed') bytes = name === 'manifest.json' ? alteredManifest : name === 'worker.mjs' ? alteredWorker : bytes;
  res.writeHead(200, { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : name === 'manifest.json' ? 'application/json' : 'text/javascript' });
  res.end(bytes);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `https://127.0.0.1:${server.address().port}`;
const root = await mkdtemp('/tmp/verified-wallet-node-');
const before = new Set((await readdir('/tmp')).filter(name => name.startsWith('zcash-wallet-runtime-')));
const network = { identity: 'fixture', genesisHash: '03'.repeat(32), parametersFormat: 'zcash-js-network/1',
  parameters: new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}') };
const options = (name, mode = 'good') => ({ network, storage: { kind: 'node-filesystem', path: `${root}/${name}` }, runtime: {
  baseline: { manifestUrl: `${origin}/${mode}/manifest.json`, manifestSha256: sha(mode === 'unreviewed' ? alteredManifest : manifestBytes) },
  threading: { mode: 'baseline' }, maxMemoryBytes: 512 * 1024 * 1024, maxQueuedBytes: 65536,
  maxQueuedJobs: 8, scanBatchSize: 10, maxPcztBytes: 1048576,
} });
try {
  for (const [name, limits] of [['native-only-memory', { maxMemoryBytes: 256 * 1024 * 1024 }],
    ['oversize-queue', { maxQueuedBytes: Number.MAX_SAFE_INTEGER }],
    ['oversize-control', { maxQueuedJobs: Number.MAX_SAFE_INTEGER }]]) {
    const input = options(name), before = requests.length;
    Object.assign(input.runtime, limits);
    await assert.rejects(openWalletRuntime(input), { code: 'RESOURCE_LIMIT' });
    assert.equal(requests.length, before, 'memory admission precedes fetch');
    assert.equal(existsSync(`${root}/${name}`), false, 'memory admission precedes storage');
  }
  for (const [mode, code] of [['tamper', 'RUNTIME_UNAVAILABLE'], ['unreviewed', 'PROTOCOL_MISMATCH']]) {
    await assert.rejects(openWalletRuntime(options(mode, mode)), { code });
    assert.equal(existsSync(`${root}/${mode}`), false);
  }
  const abort = new AbortController();
  abort.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const pending = assert.rejects(openWalletRuntime({ ...options('cancel-fetch', 'stall'), signal: abort.signal }), { code: 'ABORTED' });
  await stalledRequest; abort.signal.dispatchEvent(new Event('abort')); assert.equal(abort.signal.aborted, false);
  abort.abort(); await pending; assert.equal(existsSync(`${root}/cancel-fetch`), false);
  const readyAbort = new AbortController(), startup = options('cancel-ready');
  startup.signal = readyAbort.signal; startup.runtime.onDiagnostic = () => readyAbort.abort();
  await assert.rejects(openWalletRuntime(startup), { code: 'ABORTED' });
  assert.equal(existsSync(`${root}/cancel-ready`), false);
  const fixtureBytes = await readFile('/home/jack/zakura-account-compose-scratch/fixes/r1/balance-build-03/bundle/tests/views-fixture.json');
  assert.equal(sha(fixtureBytes), '731843024627c13dd4a7b56a8b70220b1eac1ce56d2b56e0f883a1695ea18f44');
  const fixture = JSON.parse(fixtureBytes);
  let account, addresses;
  for (const reopen of [false, true]) {
    const opened = await openWalletRuntime(options('wallet'));
    try {
      assert.equal(opened.identity.buildSha256, manifest.buildSha256);
      if (!reopen) {
        account = await opened.session.accounts.import({ ...fixture.import, birthday: 'fullScan' });
        await opened.session.addresses.next({ accountId: account.id, request: { format: 'transparent' } });
        addresses = await opened.session.addresses.list({ accountId: account.id });
      } else {
        assert.deepEqual(await opened.session.accounts.get({ accountId: account.id }), account);
        assert.deepEqual(await opened.session.addresses.list({ accountId: account.id }), addresses);
      }
      assert.deepEqual(await opened.session.getBalance({ accountId: account.id,
        confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } }), { accountId: account.id, amounts: null });
      const closing = opened.close(); assert.equal(opened.close(), closing); await closing;
    } finally { await opened.close(); }
  }
  assert.deepEqual((await readdir('/tmp')).filter(name => name.startsWith('zcash-wallet-runtime-') && !before.has(name)), [], 'owned executable directories removed');
  assert.deepEqual(unexpected, []);
  assert.equal(requests.filter(path => path.startsWith('/good/')).length, 18, 'six pinned assets per open; no execution refetch');
  console.log(JSON.stringify({ pass: true, root, requests: requests.length, tls: 'fixture CA; normal verification', persistence: 'native FS close/reopen' }));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
