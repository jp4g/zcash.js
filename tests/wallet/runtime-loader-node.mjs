import {shieldingChecks} from './shielding-checks.mjs';
import {accountsChecks} from './accounts-checks.mjs';
import {pcztBuildChecks} from './pczt-build-checks.mjs';
// Real TLS acquisition, reviewed executable bytes, actual worker/Rust filesystem wallet.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { memorySignerChecks, mnemonicWalletChecks, sharedWalletChecks, memoryWalletChecks, offlineSyncChecks, scanChecks, checkBalance, enhancementChecks, emptyCompletionChecks, scanQueryChecks, historyPageChecks } from './scan-checks.mjs';
import { openWalletRuntime, browserThreadingPrerequisites } from '../../dist/src/runtime/wallet.js';

// Capability admission only; actual native runtime qualification follows below.
const capabilityNames = ['isSecureContext', 'crossOriginIsolated', 'Worker', 'Atomics'];
const descriptors = capabilityNames.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
try {
  Object.assign(globalThis, { isSecureContext: true, crossOriginIsolated: true, Worker: function () {} });
  assert.equal(browserThreadingPrerequisites(), true);
  for (const value of [undefined, {}, { wait() {} }, { notify() {} }]) {
    globalThis.Atomics = value;
    assert.equal(browserThreadingPrerequisites(), false, 'missing Atomics wait/notify selects fallback');
  }
} finally {
  capabilityNames.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]) : delete globalThis[name]);
}
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
  const threaded = { mode: 'prefer-threaded', artifact: { manifestUrl: `${origin}/threaded/manifest.json`, manifestSha256: sha(manifestBytes) }, workers: 2, startupTimeoutMs: 1000 };
  for (const [index, value] of [threaded, { ...threaded, workers: 0 }, { ...threaded, startupTimeoutMs: Infinity },
    { ...threaded, artifact: { ...threaded.artifact, manifestUrl: 'http://localhost/manifest.json' } },
    { ...threaded, artifact: { ...threaded.artifact, manifestSha256: 'bad' } },
    { ...threaded, extra: true }, { mode: 'baseline', workers: 2 }].entries()) {
    const input = options(`threaded-${index}`), count = requests.length;
    input.runtime.threading = value;
    await assert.rejects(openWalletRuntime(input), { code: index === 0 ? 'RUNTIME_UNAVAILABLE' : 'INVALID_ARGUMENT' });
    assert.equal(requests.length, count, 'threaded admission performs no fetch');
    assert.equal(existsSync(input.storage.path), false);
  }
  for (const [name, limits] of [['native-only-memory', { maxMemoryBytes: 256 * 1024 * 1024 }],
    ['scan-scratch-memory', { maxMemoryBytes: 384 * 1024 * 1024 }],
    ['query-scratch-memory', { maxMemoryBytes: 416 * 1024 * 1024 }],
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
  assert.ok(process.argv[3], 'source-bound native build directory required');
  const nativeReceipt = await readFile(`${process.argv[3]}/build.json`);
  const metadataBytes = await readFile(`${packet}/build.json`);
  assert.equal(sha(metadataBytes), manifest.buildSha256);
  assert.equal(sha(nativeReceipt), JSON.parse(metadataBytes).nativeBuildSha256);
  const fixtureBytes = await readFile(`${process.argv[3]}/bundle/tests/views-fixture.json`);
  assert.equal(sha(fixtureBytes), JSON.parse(nativeReceipt).artifacts['tests/views-fixture.json']);
  const fixture = JSON.parse(fixtureBytes);
  const nativeBuild=JSON.parse(nativeReceipt);
  const signerBytes=await readFile(`${nativeBuild.work}/source/tests/signer-fixture.json`);
  assert.equal(sha(signerBytes),nativeBuild.sources['tests/signer-fixture.json']);
  const signerFixture=JSON.parse(signerBytes);
  await assert.rejects(openWalletRuntime({...options('memory-invalid'),storage:{kind:'memory',path:'must-not-create'}}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(openWalletRuntime({...options('memory-abort'),storage:{kind:'memory'},signal:AbortSignal.abort()}),{code:'ABORTED'});
  const walletDirectories=await readdir(root);
  for(const populate of [true,false]) {
    const opened=await openWalletRuntime({...options('memory'),storage:{kind:'memory'}});
    try {await memoryWalletChecks(opened.session,fixture,populate);}finally{await opened.close();}
  }
  assert.deepEqual(await readdir(root),walletDirectories,'memory opens create no wallet filesystem directory');
  await sharedWalletChecks((name,signal)=>openWalletRuntime({...options(`shared-${name}`),signal}),fixture);
  await mnemonicWalletChecks(name=>openWalletRuntime(options(`mnemonic-${name}`)));
  await memorySignerChecks(()=>openWalletRuntime(options('complete-signer')),signerFixture,network);
  await accountsChecks(suffix=>openWalletRuntime(options(`accounts-${suffix}`)),{...fixture,signer:signerFixture},network);
  await pcztBuildChecks(suffix=>openWalletRuntime(options(`pczt-${suffix}`)),fixture.pczt,network);
  let account, addresses, previousScan;
  for (const reopen of [false, true]) {
    const input = options('wallet'), diagnostics = [];
    input.runtime.onDiagnostic = event => { diagnostics.push(event); throw Error('ignored diagnostic failure'); };
    const opened = await openWalletRuntime(input);
    assert.deepEqual(diagnostics, [{ code: 'BASELINE_SELECTED', reason: 'requested' }]);
    assert.equal(Object.isFrozen(diagnostics[0]), true);
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
      const query = { accountId: account.id, confirmations: { trusted: 1, untrusted: 1, allowZeroConfirmationShielding: true } };
      const balance = await opened.session.getBalance(query);
      assert.equal(balance.accountId, account.id); assert.equal(balance.amounts, null);
      assert.equal(typeof balance.scan.revision, 'string');
      assert.deepEqual({ ...balance.scan, revision: null }, { revision: null, tipHeight: null, fullyScannedHeight: null, maxScannedHeight: null, scanComplete: null });
      assert.deepEqual(await opened.session.getBalance(query), balance, 'read retains revision');
      if (reopen) assert.notEqual(balance.scan.revision, previousScan.revision, 'reopen changes owner epoch');
      previousScan = balance.scan;
      const closing = opened.close(); assert.equal(opened.close(), closing); await closing;
    } finally { await opened.close(); }
  }
  let emptyRevision;
  const emptyOptions={...options('empty'),network:{...network,genesisHash:Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join('')}};
  for(const reopen of [false,true]) {
    const opened=await openWalletRuntime(emptyOptions);
    try {const revision=await emptyCompletionChecks(opened.session,fixture.scan,emptyOptions.network,reopen);if(reopen)assert.notEqual(revision,emptyRevision);else emptyRevision=revision;}
    finally{await opened.close();}
  }
  let scanned;
  const first = await openWalletRuntime(options('scanned'));
  try { scanned = await scanChecks(first.session, fixture.scan, options('scanned').network); } finally { await first.close(); }
  const reopened = await openWalletRuntime(options('scanned'));
  try {
    const offlineRequests = requests.length;
    await offlineSyncChecks(reopened.session);
    assert.equal(requests.length, offlineRequests, 'offline status does not fetch');
    const balance = await reopened.session.getBalance(scanned.query);
    checkBalance(balance, fixture.scan);
    await scanQueryChecks(reopened.session,fixture.scan,scanned.account.id,scanned.queries);
    assert.notEqual(balance.scan.revision, scanned.balance.scan.revision);
    assert.deepEqual(await reopened.session.accounts.get({ accountId: scanned.account.id }), scanned.account);
  } finally { await reopened.close(); }
  assert.ok(fixture.enhancement,'source-bound native enhancement fixture');
  const enhancedOptions=options('enhanced');
  await mkdir(enhancedOptions.storage.path,{mode:0o700});
  await writeFile(`${enhancedOptions.storage.path}/wallet.db`,Buffer.from(fixture.enhancement.database,'hex'),{mode:0o600,flag:'wx'});
  let enhancedRevision;
  for(const reopen of [false,true]) {
    const opened=await openWalletRuntime(enhancedOptions);
    try {
      const revision=await enhancementChecks(opened.session,fixture.enhancement,reopen);
      if(reopen)assert.notEqual(revision,enhancedRevision);else enhancedRevision=revision;
    } finally {await opened.close();}
  }
  assert.ok(fixture.history,'source-bound native paginated history fixture');
  const historyOptions=options('history');
  await mkdir(historyOptions.storage.path,{mode:0o700});
  await writeFile(historyOptions.storage.path+'/wallet.db',Buffer.from(fixture.history.database,'hex'),{mode:0o600,flag:'wx'});
  let cursor;
  for(const reopen of [false,true]) {
    const opened=await openWalletRuntime(historyOptions);
    try {cursor=await historyPageChecks(opened.session,fixture.history,reopen?cursor:undefined);}
    finally {await opened.close();}
  }
  assert.ok(fixture.shielding,'source-bound native shielding database');
  const shieldingOptions=options('shielding');
  await mkdir(shieldingOptions.storage.path,{mode:0o700});
  await writeFile(shieldingOptions.storage.path+'/wallet.db',Buffer.from(fixture.shielding.database,'hex'),{mode:0o600,flag:'wx'});
  let shielding;
  for(const reopen of [false,true]) {
    const opened=await openWalletRuntime(shieldingOptions);
    try {shielding=await shieldingChecks(opened.session,fixture.shielding,shieldingOptions.network,reopen?shielding:undefined);}
    finally {await opened.close();}
  }
  assert.deepEqual((await readdir('/tmp')).filter(name => name.startsWith('zcash-wallet-runtime-') && !before.has(name)), [], 'owned executable directories removed');
  assert.deepEqual(unexpected, []);
  assert.equal(requests.filter(path => path.startsWith('/good/')).length, 138, 'six pinned assets per owner, including PCZT close/reopen; no execution refetch');
  console.log(JSON.stringify({ pass: true, shielding:true, idempotency:true, accountsApi:true, memorySigner:true, mnemonicAuthority:true, sharedOwner:true, memoryStorage:true, emptyCompleted:true, offlineSync:true, queries:true, inventory:true, pagination:true, watchShared:scanned.watchShared, publicSync:scanned.publicSync, enhancementPending:scanned.enhancementPending, rewoundTo:scanned.rewoundTo, enhanced:true, root, requests: requests.length, tls: 'fixture CA; normal verification', persistence: 'native FS close/reopen' }));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
