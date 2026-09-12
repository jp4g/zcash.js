import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageChannel } from 'node:worker_threads';
import { attachWalletWorker } from '../../dist/src/wallet/host.js';
import { installWalletWorker } from '../../dist/src/wallet/worker.js';
import { isZcashError } from '../../dist/src/errors.js';

function local(t, call, close = () => {}, limits = { maxQueuedJobs: 4, maxQueuedBytes: 4096 }) {
  const { port1, port2 } = new MessageChannel(); let destructions = 0;
  installWalletWorker({ generation: 1, instance: 'fixture', call, close }, port2);
  const host = attachWalletWorker(port1, async () => { destructions++; port2.close(); }, limits);
  t.after(async () => { await host.close().catch(() => {}); });
  return { host, destructions: () => destructions };
}

test('host snapshots inputs, serializes operations and drains close once', async t => {
  const calls = [];
  const { host, destructions } = local(t, (_g, _i, op, args) => { calls.push([op, args]); return args; }, () => calls.push(['close']));
  const args = { accountId: 'original', request: { format: 'transparent' } };
  const first = host.addresses.next(args); args.accountId = 'changed'; args.request.format = 'changed';
  const second = host.accounts.list();
  const closing = host.close(); assert.equal(host.close(), closing);
  await assert.rejects(host.accounts.list(), { code: 'CLOSED' });
  assert.deepEqual(await first, { accountId: 'original', request: { format: 'transparent' } });
  await second; await closing;
  assert.deepEqual(calls.map(c => c[0]), ['address_next', 'account_list', 'close']);
  assert.equal(destructions(), 1);
});

test('queued cancellation and limits invoke no rejected native calls', async t => {
  const calls = [];
  const { host } = local(t, (_g, _i, op) => { calls.push(op); return []; }, undefined,
    { maxQueuedJobs: 2, maxQueuedBytes: 300 });
  const signal = new AbortController();
  const first = host.accounts.list();
  const second = host.accounts.get({ accountId: 'test', signal: signal.signal });
  const limited = host.accounts.list();
  signal.abort();
  await assert.rejects(limited, error => error.code === 'RESOURCE_LIMIT' && host.completion(error).completion === 'none');
  await assert.rejects(second, error => error.code === 'ABORTED' && host.completion(error).completion === 'none');
  await first;
  await assert.rejects(host.accounts.get({ accountId: 'x'.repeat(300) }), { code: 'RESOURCE_LIMIT' });
  let getters = 0;
  await assert.rejects(host.accounts.get({ get accountId() { getters++; return 'test'; } }), { code: 'INVALID_ARGUMENT' });
  assert.equal(getters, 0); assert.deepEqual(calls, ['account_list']);
});

test('in-flight cancellation waits for native completion and retains successful write privately', async t => {
  const controller = new AbortController();
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  let writes = 0;
  const { host } = local(t, () => { writes++; controller.abort(); return { address: 'private-fixture' }; });
  await assert.rejects(host.addresses.next({ accountId: 'test', signal: controller.signal }), error => {
    assert.equal(isZcashError(error), true); assert.equal(error.code, 'ABORTED');
    assert.deepEqual(host.completion(error), { completion: 'committed', value: { address: 'private-fixture' } });
    assert.doesNotMatch(JSON.stringify(error), /private-fixture/); return true;
  });
  assert.equal(writes, 1);
});

test('native failure completion is preserved, unknown failures invalidate and destroy', async t => {
  const { host, destructions } = local(t, (_g, _i, op) => {
    if (op === 'address_next') throw Object.assign(Error('ABORTED'), { commit: 'committed' });
    throw Error('private SQL fixture');
  });
  await assert.rejects(host.addresses.next({ accountId: 'test' }), error => {
    assert.equal(error.code, 'ABORTED'); assert.deepEqual(host.completion(error), { completion: 'committed' }); return true;
  });
  await assert.rejects(host.accounts.list(), error => {
    assert.equal(error.code, 'RUNTIME_UNAVAILABLE'); assert.doesNotMatch(error.message, /private/);
    assert.equal(host.completion(error).completion, 'unknown'); return true;
  });
  await host.close().catch(() => {}); assert.equal(destructions(), 1);
});

test('worker loss rejects dispatched and queued calls with distinct completion', async t => {
  const { port1, port2 } = new MessageChannel();
  let posted;
  const seen = new Promise(resolve => { posted = resolve; });
  port2.on('message', posted);
  const host = attachWalletWorker(port1, async () => port2.close(), { maxQueuedJobs: 2, maxQueuedBytes: 4096 });
  t.after(async () => { await host.close().catch(() => {}); });
  const one = host.accounts.list(), two = host.accounts.list();
  await seen;
  host.crashed();
  await assert.rejects(one, error => error.code === 'WORKER_CRASHED' && host.completion(error).completion === 'unknown');
  await assert.rejects(two, error => error.code === 'WORKER_CRASHED' && host.completion(error).completion === 'none');
});

test('native close failure still destroys the worker and remains the cached outcome', async t => {
  const { host, destructions } = local(t, () => [], () => { throw Error('STORAGE_CLOSE_FAILED'); });
  const close = host.close(); await assert.rejects(close, { code: 'STORAGE_ERROR' });
  assert.equal(host.close(), close); assert.equal(destructions(), 1);
});

test('cancellation does not hide a native storage failure', async t => {
  const controller = new AbortController();
  const { host } = local(t, () => { controller.abort(); throw Error('STORAGE_ERROR'); });
  await assert.rejects(host.addresses.next({ accountId: 'test', signal: controller.signal }), error => {
    assert.equal(error.code, 'STORAGE_ERROR'); assert.equal(host.completion(error).completion, 'unknown'); return true;
  });
});

test('malformed worker failure invalidates rather than leaving a pending request', async t => {
  const { port1, port2 } = new MessageChannel();
  port2.on('message', ({ id }) => port2.postMessage({ id, completion: 'unknown', invalid: false, outcome: { ok: false } }));
  const host = attachWalletWorker(port1, async () => port2.close(), { maxQueuedJobs: 2, maxQueuedBytes: 4096 });
  t.after(async () => { await host.close().catch(() => {}); });
  await assert.rejects(host.accounts.list(), error => error.code === 'WORKER_CRASHED' && host.completion(error).completion === 'unknown');
});

test('scan batches own binary inputs and share queue bounds and committed cancellation', async t => {
  const target = { height: 100, hash: '03'.repeat(32) };
  const controller = new AbortController(); let calls = 0;
  const { host } = local(t, (_g, _i, operation, args) => {
    calls++; assert.equal(operation, 'scan_ingest_batch');
    assert.equal(args.blocks.length, 16); assert.equal(args.blocks[0][0], 7);
    assert.equal(args.priorTreeState[0], 8); assert.deepEqual(args.target, target);
    controller.abort(); return { revision: 'next', start: 100, endExclusive: 101, blocks: 16 };
  }, undefined, { maxQueuedJobs: 4, maxQueuedBytes: 65536 });
  const bytes = new Uint8Array([7]), prior = new Uint8Array([8]);
  const args = { target, revision: 'old', blocks: Array.from({ length: 16 }, () => bytes), priorTreeState: prior, signal: controller.signal };
  const pending = host.scan.ingest(args); bytes.fill(9); prior.fill(9);
  await assert.rejects(pending, error => error.code === 'ABORTED'
    && host.completion(error).completion === 'committed' && host.completion(error).value.revision === 'next');
  await assert.rejects(host.scan.ingest({ ...args, signal: undefined, blocks: [new Uint8Array(65536)] }), { code: 'RESOURCE_LIMIT' });
  await assert.rejects(host.scan.ingest({ ...args, signal: undefined, blocks: [new Uint8Array(new SharedArrayBuffer(1))] }), { code: 'INVALID_ARGUMENT' });
  assert.equal(calls, 1);
});
test('native scan admission errors retain completion and allow replanning', async t => {
  let calls = 0;
  const { host } = local(t, () => {
    if (++calls === 1) throw Object.assign(Error('STALE_REVISION'), { commit: 'none' });
    return { revision: 'new', target: { height: 100, hash: '03'.repeat(32) }, ranges: [] };
  });
  const args = { target: { height: 100, hash: '03'.repeat(32) } };
  await assert.rejects(host.scan.plan(args), error => error.code === 'CURSOR_STALE' && error.stage === 'sync'
    && error.recovery === 'sync' && host.completion(error).completion === 'none');
  assert.equal((await host.scan.plan(args)).revision, 'new');
});

test('wallet-wide state reads and rewind preserve native points and commit receipts', async t => {
  const controller = new AbortController();
  const point = { height: 80, hash: '04'.repeat(32) };
  const { host } = local(t, (_g, _i, command, args) => {
    if (command === 'scan_state') return { revision: 'before', fullyScannedHeight: 100 };
    if (command === 'scan_block_hash') { assert.equal(args.height, 80); return { revision: 'before', point }; }
    assert.equal(command, 'scan_rewind');
    assert.equal(args.revision, 'before'); assert.deepEqual(args.requestedPoint, point);
    controller.abort();
    return { revision: 'after', point: { height: 64, hash: '05'.repeat(32) } };
  });
  assert.equal((await host.scan.state()).fullyScannedHeight, 100);
  assert.deepEqual((await host.scan.block({ height: 80 })).point, point);
  const args = { revision: 'before', requestedPoint: { ...point }, signal: controller.signal };
  const pending = host.scan.rewind(args); args.requestedPoint.height = 99;
  await assert.rejects(pending, error => error.code === 'ABORTED'
    && host.completion(error).completion === 'committed'
    && host.completion(error).value.point.height === 64);
});

test('enhancement application owns full transaction bytes and preserves stale-request failure', async t => {
  const request = { kind: 'enhancement', txid: '06'.repeat(32) };
  let writes = 0;
  const { host } = local(t, (_g, _i, command, args) => {
    if (command === 'enhancement_requests') return { revision: 'r1', requests: [request] };
    assert.equal(command, 'enhancement_apply');
    if (writes++) throw Object.assign(Error('STALE_REVISION'), { commit: 'none' });
    assert.deepEqual(args.request, request);
    assert.deepEqual([...args.result.transactions[0].bytes], [1, 2, 3]);
    return { revision: 'r2' };
  });
  assert.deepEqual((await host.enhancement.requests()).requests, [request]);
  const bytes = new Uint8Array([1, 2, 3]);
  const args = { revision: 'r1', request, result: { transactions: [{ bytes, minedHeight: 100 }] } };
  const pending = host.enhancement.apply(args); bytes.fill(9);
  assert.equal((await pending).revision, 'r2');
  await assert.rejects(host.enhancement.apply(args), error => error.code === 'CURSOR_STALE'
    && error.stage === 'sync' && host.completion(error).completion === 'none');
});

test('completed tree snapshots own bytes and retain committed cancellation receipts', async t => {
  const controller=new AbortController(),target={height:99,hash:'03'.repeat(32)};
  const {host}=local(t,(_g,_i,command,args)=>{
    assert.equal(command,'scan_complete');assert.equal(args.treeState[0],7);assert.equal(args.target.height,99);
    controller.abort();return{revision:'completed'};
  });
  const treeState=new Uint8Array([7]),pending=host.scan.complete({revision:'before',target,treeState,signal:controller.signal});
  treeState[0]=8;target.height=100;
  await assert.rejects(pending,error=>error.code==='ABORTED'&&host.completion(error).completion==='committed'
    &&host.completion(error).value.revision==='completed');
});
