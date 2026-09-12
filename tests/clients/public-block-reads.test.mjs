import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, result, sourceId, transportOptions, blockOne } from './public-chain-reads-fixtures.mjs';

const build = process.env.PUBLIC_BLOCK_READS_BUILD ?? '/home/jack/zcash-public-block-scratch/dist';
const { http } = await import(`${build}/src/http.js`);
const adapter = await import(`${build}/src/clients/public-block-reads.js`).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
// The single txid is verbatim from the pinned verbosity-1 block-one snapshot.
const txids = ['851bf6fbf7a976327817c738c489d7fa657752445430922d94c983c0b9ed4609'];
const block = { ...blockOne.verbose, nTx: 1, tx: txids };
const reply = call => result(call.method === 'getblock' ? block : call.params[1] ? blockOne.verbose : blockOne.raw);
const code = expected => error => error.code === expected;
async function local(t, respond = reply, options = {}) {
  const server = await fixture(respond);
  t.after(async () => { await server.close(); assert.deepEqual(server.unexpected, []); });
  return { ...server, source: { sourceId, transport: http(server.origin + '/rpc', { ...transportOptions, ...options }) } };
}

test('getBlock resolves height once and pins both header calls across a reorg', async t => {
  assert.equal(typeof adapter.getBlock, 'function');
  const f = await local(t, call => {
    // Subsequent height lookups now resolve a different block; hash calls still succeed.
    if (call.method !== 'getblock' && call.params[0] === '1') return result(null);
    return reply(call);
  });
  const before = Date.now();
  const value = await adapter.getBlock(f.source, { height: 1 });
  assert.deepEqual({ ...value, raw: undefined, observedAt: undefined }, {
    point: { height: 1, hash: block.hash }, previousHash: block.previousblockhash,
    time: block.time, txids, sourceId, raw: undefined, observedAt: undefined,
  });
  assert.equal(Buffer.from(value.raw).toString('hex'), blockOne.raw);
  assert.ok(Date.parse(value.observedAt) >= before && Date.parse(value.observedAt) <= Date.now());
  assert.deepEqual(f.calls.map(({ method, params }) => ({ method, params })), [
    { method: 'getblock', params: ['1', 1] },
    { method: 'getblockheader', params: [block.hash, true] },
    { method: 'getblockheader', params: [block.hash, false] },
  ]);
});

test('invalid selector/source rejects without invoking callbacks', async () => {
  let callbacks = 0;
  const source = { sourceId, transport: http('http://127.0.0.1:1', { ...transportOptions,
    headers() { callbacks++; throw Error('private-fixture'); } }) };
  for (const args of [undefined, null, [], {}, { height: 1, hash: block.hash }, { height: 1, hash: undefined },
    { hash: block.hash, height: undefined }, { height: -1 }, { height: 4294967296 }, { height: NaN },
    { height: 1.5 }, { height: 1n }, { height: '1' }, { hash: block.hash.toUpperCase() },
    { hash: '0x' + block.hash }, { hash: block.hash.slice(1) }, { hash: 1 }, { height: 1, extra: true },
    { height: 1, signal: {} }, Object.create({ height: 1 }),
    Object.defineProperty({}, 'height', { get() { throw Error('private-fixture'); } })]) {
    await assert.rejects(adapter.getBlock(source, args), code('INVALID_ARGUMENT'));
  }
  for (const bad of [null, {}, { ...source, sourceId: '' }, { ...source, sourceId: '  ' },
    { ...source, sourceId: 1 }, { ...source, extra: 1 }, { ...source, transport: {} },
    Object.defineProperty({}, 'sourceId', { get() { throw Error('private-fixture'); } })]) {
    await assert.rejects(adapter.getBlock(bad, { height: 1 }), code('INVALID_ARGUMENT'));
  }
  assert.equal(callbacks, 0);
});

test('verbose block rejects malformed shapes, hashes and txid lists before header lookup', async t => {
  let value;
  const f = await local(t, () => result(value), { maxResponseBytes: 4_000_000 });
  const bads = [null, [], 1, 'raw', {}, { ...block, hash: block.hash.toUpperCase() },
    { ...block, hash: '0x' + block.hash }, { ...block, hash: block.hash.slice(1) },
    { ...block, previousblockhash: null }, { ...block, previousblockhash: 'x'.repeat(64) },
    { ...block, time: null }, { ...block, tx: null }, { ...block, tx: {} }, { ...block, tx: [] },
    { ...block, tx: [null] }, { ...block, tx: [{ txid: txids[0] }] },
    { ...block, tx: [txids[0].toUpperCase()] }, { ...block, tx: ['0x' + txids[0]] },
    { ...block, tx: [txids[0].slice(1)] }, { ...block, nTx: 2 },
    { ...block, nTx: 2, tx: [txids[0], txids[0]] },
    { ...block, nTx: 37038, tx: Array(37038).fill(txids[0]) }];
  for (const field of ['height', 'hash', 'previousblockhash', 'time', 'tx', 'nTx']) {
    const missing = { ...block }; delete missing[field]; bads.push(missing);
  }
  for (value of bads) {
    const start = f.calls.length;
    await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('PROTOCOL_MISMATCH'));
    assert.equal(f.calls.length, start + 1);
  }
});

test('height, time and nTx use lossless integer tokens and source ranges', async t => {
  let payload;
  const f = await local(t, () => `"result":${payload}`);
  for (const field of ['height', 'time', 'nTx']) {
    for (const token of ['-1', '4294967296', '9007199254740993', '1.0', '1e0', '1.2', '"1"', 'null', 'true', '{}', '-0']) {
      payload = JSON.stringify(block).replace(new RegExp(`"${field}":[0-9]+`), `"${field}":${token}`);
      const start = f.calls.length;
      await assert.rejects(adapter.getBlock(f.source, { hash: block.hash }), code('PROTOCOL_MISMATCH'), `${field}:${token}`);
      assert.equal(f.calls.length, start + 1);
    }
  }
});

test('contradictions between selector, resolved point and hash-pinned header reject', async t => {
  let verbose = block, header = blockOne.verbose, raw = blockOne.raw;
  const f = await local(t, call => result(call.method === 'getblock' ? verbose : call.params[1] ? header : raw));
  for (const args of [{ height: 2 }, { hash: 'ab'.repeat(32) }]) {
    await assert.rejects(adapter.getBlock(f.source, args), code('PROTOCOL_MISMATCH'));
  }
  for (const change of [{ height: 2 }, { hash: 'ab'.repeat(32) }, { previousblockhash: 'ab'.repeat(32) }, { time: block.time + 1 }]) {
    header = { ...blockOne.verbose, ...change };
    await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('PROTOCOL_MISMATCH'));
  }
  header = blockOne.verbose;
  for (const change of [{ previousblockhash: 'ab'.repeat(32) }, { time: block.time + 1 }]) {
    verbose = { ...block, ...change };
    await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('PROTOCOL_MISMATCH'));
  }
  verbose = block; raw = '00';
  await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('PROTOCOL_MISMATCH'));
});

test('results own their raw bytes and txid arrays; records follow the frozen API shape', async t => {
  const f = await local(t);
  const a = await adapter.getBlock(f.source, { hash: block.hash });
  a.raw.fill(0);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.point), true);
  assert.equal(Object.isFrozen(a.txids), true);
  assert.throws(() => { a.txids[0] = 'ab'.repeat(32); }, TypeError);
  const b = await adapter.getBlock(f.source, { height: 1 });
  assert.equal(Buffer.from(b.raw).toString('hex'), blockOne.raw);
  assert.deepEqual(b.txids, txids);
  assert.notEqual(a.raw.buffer, b.raw.buffer); assert.notEqual(a.txids, b.txids); assert.notEqual(a.point, b.point);
});

test('selector, signal, transport and source label snapshot precedes async header callbacks', async t => {
  let source, args;
  const controller = new AbortController();
  const f = await local(t, reply, { headers() {
    args.height = 2; args.signal = new AbortController().signal;
    source.sourceId = 'mutated'; source.transport = {};
    return {};
  } });
  source = f.source; args = { height: 1, signal: controller.signal };
  const value = await adapter.getBlock(source, args);
  assert.equal(value.sourceId, sourceId); assert.equal(value.point.height, 1);
  assert.deepEqual(f.calls.map(c => c.params), [['1', 1], [block.hash, true], [block.hash, false]]);
});

for (const stage of [0, 1, 2]) {
  test(`stage ${stage}: only initial qualified absence becomes null; nested failures remain errors`, async t => {
    let errorCode;
    let index = 0;
    const f = await local(t, call => index++ === stage
      ? `"error":{"code":${errorCode},"message":"private-fixture","data":"private-fixture"}` : reply(call));
    for (const [rpc, expected] of [[-32601, 'METHOD_NOT_SUPPORTED'], [-8, 'TRANSPORT_ERROR'], [-5, 'TRANSPORT_ERROR'], [-1, 'TRANSPORT_ERROR']]) {
      errorCode = rpc; index = 0;
      if (stage === 0 && rpc === -8) {
        assert.equal(await adapter.getBlock(f.source, { height: 1 }), null);
        assert.equal(index, 1); continue;
      }
      await assert.rejects(adapter.getBlock(f.source, { height: 1 }), error => {
        assert.equal(error.code, stage === 1 && rpc === -5 ? 'PROTOCOL_MISMATCH' : expected); assert.equal(error.retryable, false);
        assert.doesNotMatch(JSON.stringify(error) + error.message, /private-fixture|127\.0\.0\.1/); return true;
      });
      assert.equal(index, stage + 1);
    }
  });
  test(`stage ${stage}: abort a streaming response and stop subsequent requests`, async t => {
    let arrived;
    const ready = new Promise(resolve => { arrived = resolve; });
    let index = 0;
    const f = await local(t, (call, req, res) => {
      if (index++ !== stage) return reply(call);
      res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); arrived();
    });
    const controller = new AbortController();
    const pending = assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), code('ABORTED'));
    await ready; controller.abort(); await pending; assert.equal(f.calls.length, stage + 1);
  });
  test(`stage ${stage}: timeout and transport byte limit stop composition`, async t => {
    let index = 0, oversize = false;
    const f = await local(t, (call, req, res) => {
      if (index++ !== stage) return reply(call);
      if (oversize) return result('x'.repeat(17000));
      res.writeHead(200, { 'content-type': 'application/json' }); res.write('{');
    }, { timeoutMs: 80 });
    await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('TIMEOUT'));
    index = 0; oversize = true;
    await assert.rejects(adapter.getBlock(f.source, { height: 1 }), code('RESOURCE_LIMIT'));
    assert.equal(index, stage + 1);
  });
  test(`stage ${stage}: callback cancellation uses original signal after input mutation`, async t => {
    let args, index = 0;
    const controller = new AbortController();
    const f = await local(t, reply, { headers() {
      args.signal = new AbortController().signal;
      if (index++ === stage) controller.abort();
      return {};
    } });
    args = { height: 1, signal: controller.signal };
    await assert.rejects(adapter.getBlock(f.source, args), code('ABORTED'));
    assert.equal(f.calls.length, stage);
  });
}

test('pre-aborted operation does not call transport callbacks', async () => {
  let calls = 0;
  const source = { sourceId, transport: http('http://127.0.0.1:1', { ...transportOptions, headers() { calls++; return {}; } }) };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.getBlock(source, { height: 1, signal: controller.signal }), code('ABORTED'));
  assert.equal(calls, 0);
});

test('verbatim pinned verbosity-1 snapshot composes with A block-one header bytes', async t => {
  const { readFile } = await import('node:fs/promises');
  const file = process.env.PUBLIC_BLOCK_SNAPSHOT ?? '/tmp/zakura-upstream-review/crates/zakura-rpc/src/methods/tests/snapshots/get_block_verbose_height_verbosity_1@mainnet_10.snap';
  const snapshot = (await readFile(file, 'utf8')).split('---\n').at(-1);
  const f = await local(t, call => call.method === 'getblock' ? `"result":${snapshot}` : reply(call));
  const value = await adapter.getBlock(f.source, { height: 1 });
  assert.deepEqual(value.txids, txids); assert.equal(Buffer.from(value.raw).toString('hex'), blockOne.raw);
});

for (const stage of [1, 2]) {
  test(`native digest ${stage}: cancellation remains ABORTED`, async t => {
    const f = await local(t);
    const controller = new AbortController();
    const digest = crypto.subtle.digest;
    let calls = 0;
    t.mock.method(crypto.subtle, 'digest', async function (...args) {
      const value = await digest.apply(this, args);
      if (++calls === stage) controller.abort();
      return value;
    });
    await assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), code('ABORTED'));
    assert.equal(calls, stage);
  });
}

test('module stays internal and import graph has no eager runtime dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = await import(`${build}/src/index.js`);
  assert.equal('getBlock' in root, false); assert.equal('createPublicClient' in root, false);
  const source = await readFile(`${build}/src/clients/public-block-reads.js`, 'utf8');
  assert.doesNotMatch(source, /WebAssembly|new Worker|transaction-codec|bindings|from ['"].*index/);
});

test('ordered canonical txids at the source allocation bound remain bounded source observations', async t => {
  // Structural response test only: these hashes are not a transaction/merkle proof oracle.
  const ordered = Array.from({ length: 37037 }, (_, i) => i.toString(16).padStart(64, '0')).reverse();
  const f = await local(t, call => call.method === 'getblock' ? result({ ...block, tx: ordered, nTx: ordered.length }) : reply(call),
    { maxResponseBytes: 4_000_000, timeoutMs: 5000 });
  const value = await adapter.getBlock(f.source, { height: 1 });
  assert.deepEqual(value.txids, ordered);
});

test('cancellation queued between header completion and block completion wins', async t => {
  const f = await local(t);
  const controller = new AbortController();
  const digest = crypto.subtle.digest;
  let calls = 0;
  t.mock.method(crypto.subtle, 'digest', async function (...args) {
    const value = await digest.apply(this, args);
    if (++calls === 2) queueMicrotask(() => queueMicrotask(() => controller.abort()));
    return value;
  });
  await assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), code('ABORTED'));
});

// In-process transport boundary: actual parser/header/native digests, no socket permission needed.
function boundary(t, options = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const call = JSON.parse(request.body); calls.push(call);
    return new Response(`{"jsonrpc":"2.0","id":${JSON.stringify(call.id)},${reply(call)}}`);
  });
  return { calls, source: { sourceId, transport: http('http://127.0.0.1:1', { ...transportOptions, ...options }) } };
}
const sanitized = expected => error => {
  assert.equal(error.code, expected); assert.equal(error.message, expected === 'INVALID_ARGUMENT' ? 'Invalid argument.' : 'Request aborted.');
  assert.doesNotMatch(String(error) + JSON.stringify(error), /private-fixture/); return true;
};
for (const location of ['source', 'args']) test(`boundary: ${location} descriptors captured once without property reads`, async t => {
  const f = boundary(t); const reads = new Map();
  const target = location === 'source' ? f.source : { height: 1 };
  const proxy = new Proxy(target, {
    get() { throw Error('private-fixture'); },
    getOwnPropertyDescriptor(target, key) {
      reads.set(key, (reads.get(key) ?? 0) + 1);
      return reads.get(key) === 1 ? Reflect.getOwnPropertyDescriptor(target, key) : undefined;
    },
  });
  const value = await adapter.getBlock(location === 'source' ? proxy : f.source, location === 'args' ? proxy : { height: 1 });
  assert.equal(value.sourceId, sourceId); assert.equal(value.point.height, 1);
  assert.ok([...reads.values()].every(n => n === 1)); assert.equal(f.calls.length, 3);
});
for (const location of ['source', 'args']) test(`boundary: ${location} reflection failures reject before callbacks`, async t => {
  let callbacks = 0; const f = boundary(t, { headers() { callbacks++; return {}; } });
  const target = location === 'source' ? f.source : { height: 1 };
  const revoked = Proxy.revocable(target, {}); revoked.revoke();
  for (const bad of [revoked.proxy, new Proxy(target, { getOwnPropertyDescriptor() { return undefined; } }),
    ...['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'].map(trap => new Proxy(target, { [trap]() { throw Error('private-fixture'); } }))]) {
    await assert.rejects(adapter.getBlock(location === 'source' ? bad : f.source, location === 'args' ? bad : { height: 1 }), sanitized('INVALID_ARGUMENT'));
  }
  assert.equal(callbacks, 0); assert.equal(f.calls.length, 0);
});
test('boundary: hostile signals reject before callbacks', async t => {
  let callbacks = 0; const f = boundary(t, { headers() { callbacks++; return {}; } });
  const revoked = Proxy.revocable(new AbortController().signal, {}); revoked.revoke();
  for (const signal of [{}, Object.create(AbortSignal.prototype), revoked.proxy,
    new Proxy(new AbortController().signal, {}),
    Object.defineProperty(new AbortController().signal, 'aborted', { get() { throw Error('private-fixture'); } })]) {
    await assert.rejects(adapter.getBlock(f.source, { height: 1, signal }), sanitized('INVALID_ARGUMENT'));
  }
  assert.equal(callbacks, 0); assert.equal(f.calls.length, 0);
});
for (const mode of ['throw', 'false-abort', 'throw-abort']) test(`boundary: final native cancellation ${mode}`, async t => {
  const f = boundary(t); const controller = new AbortController(); const digest = crypto.subtle.digest; let digests = 0;
  t.mock.method(crypto.subtle, 'digest', async function (...args) {
    const value = await digest.apply(this, args);
    if (++digests === 2) queueMicrotask(() => queueMicrotask(() => {
      Object.defineProperty(controller.signal, 'aborted', mode === 'false-abort' ? { value: false } : { get() { throw Error('private-fixture'); } });
      if (mode !== 'throw') controller.abort();
    }));
    return value;
  });
  await assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), sanitized(mode === 'throw' ? 'INVALID_ARGUMENT' : 'ABORTED'));
  assert.equal(digests, 2); assert.equal(f.calls.length, 3);
});

const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
for (const position of ['callback-0', 'callback-1', 'callback-2', 'digest-1', 'digest-2']) {
  for (const realAbort of [false, true]) test(`boundary: synthetic ${position}, later native abort ${realAbort}`, async t => {
    const { getEventListeners } = await import('node:events');
    const controller = new AbortController();
    let callbacks = 0, digests = 0, events = 0;
    const dispatch = () => {
      events++;
      controller.signal.dispatchEvent(new Event('abort'));
      assert.equal(nativeAborted.call(controller.signal), false);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
      if (realAbort) controller.abort();
    };
    const f = boundary(t, { headers() {
      if (position === `callback-${callbacks++}`) dispatch();
      return {};
    } });
    const digest = crypto.subtle.digest;
    t.mock.method(crypto.subtle, 'digest', async function (...args) {
      const value = await digest.apply(this, args);
      if (position === `digest-${++digests}`) dispatch();
      return value;
    });
    const pending = adapter.getBlock(f.source, { height: 1, signal: controller.signal });
    if (realAbort) await assert.rejects(pending, sanitized('ABORTED'));
    else assert.equal((await pending).point.height, 1);
    assert.equal(events, 1);
    assert.equal(nativeAborted.call(controller.signal), realAbort);
    assert.equal(f.calls.length, realAbort && position.startsWith('callback') ? Number(position.at(-1)) : 3);
    assert.equal(digests, realAbort ? (position.startsWith('callback') ? 0 : Number(position.at(-1))) : 2);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  });
}
for (const stage of [0, 1, 2]) test(`boundary: false event then native abort of active RPC ${stage}`, async t => {
  const { getEventListeners } = await import('node:events');
  const controller = new AbortController();
  let arrived, calls = 0;
  const ready = new Promise(resolve => { arrived = resolve; });
  const f = boundary(t, { headers() {
    controller.signal.dispatchEvent(new Event('abort'));
    assert.equal(nativeAborted.call(controller.signal), false);
    return {};
  } });
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const call = JSON.parse(request.body);
    if (calls++ !== stage) return new Response(`{"jsonrpc":"2.0","id":${JSON.stringify(call.id)},${reply(call)}}`);
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{'));
      request.signal.addEventListener('abort', () => stream.error(new DOMException('Aborted', 'AbortError')), { once: true });
      arrived();
    } }));
  });
  const pending = assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), sanitized('ABORTED'));
  await ready; controller.abort(); await pending;
  assert.equal(nativeAborted.call(controller.signal), true);
  assert.equal(calls, stage + 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

// R3-B1: native cancellation must survive an earlier listener suppressing delivery.
for (const position of ['callback-0', 'callback-1', 'callback-2', 'response-0', 'digest-1', 'digest-2', 'reject-1', 'reject-2']) {
  test(`suppressed native abort: ${position}`, async t => {
    const { getEventListeners } = await import('node:events');
    const controller = new AbortController();
    controller.signal.addEventListener('abort', event => event.stopImmediatePropagation(), { once: true });
    let callbacks = 0, digests = 0;
    const responses = [], calls = [];
    const f = boundary(t, { headers() {
      if (position === `callback-${callbacks++}`) controller.abort();
      return {};
    } });
    t.mock.method(globalThis, 'fetch', async (_url, request) => {
      const call = JSON.parse(request.body); calls.push(call);
      const response = new Response(`{"jsonrpc":"2.0","id":${JSON.stringify(call.id)},${reply(call)}}`);
      responses.push(response);
      if (position === 'response-0' && calls.length === 1) controller.abort();
      return response;
    });
    const digest = crypto.subtle.digest;
    t.mock.method(crypto.subtle, 'digest', async function (...args) {
      const value = await Reflect.apply(digest, this, args);
      digests++;
      if (position === `digest-${digests}` || position === `reject-${digests}`) {
        controller.abort();
        if (position.startsWith('reject')) throw Error('private-fixture');
      }
      return value;
    });
    await assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), sanitized('ABORTED'));
    assert.equal(calls.length, position.startsWith('callback') ? Number(position.at(-1)) : position === 'response-0' ? 1 : 3);
    assert.equal(digests, /^(digest|reject)/.test(position) ? Number(position.at(-1)) : 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.ok(responses.every(response => !response.body.locked));
  });
}
for (const stage of [0, 1, 2]) test(`suppressed native abort: active RPC ${stage} after false event`, async t => {
  const { getEventListeners } = await import('node:events');
  const controller = new AbortController();
  const suppress = event => event.stopImmediatePropagation();
  controller.signal.addEventListener('abort', suppress);
  let arrived, calls = 0, cancelled = 0;
  const responses = [];
  const ready = new Promise(resolve => { arrived = resolve; });
  const f = boundary(t, { timeoutMs: 100 });
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const call = JSON.parse(request.body);
    const response = calls++ !== stage
      ? new Response(`{"jsonrpc":"2.0","id":${JSON.stringify(call.id)},${reply(call)}}`)
      : new Response(new ReadableStream({
        start(stream) { stream.enqueue(new TextEncoder().encode('{')); arrived(); },
        cancel() { cancelled++; },
      }));
    responses.push(response); return response;
  });
  const pending = assert.rejects(adapter.getBlock(f.source, { height: 1, signal: controller.signal }), sanitized('ABORTED'));
  await ready;
  controller.signal.dispatchEvent(new Event('abort'));
  assert.equal(nativeAborted.call(controller.signal), false);
  controller.abort(); await pending;
  assert.equal(cancelled, 1); assert.equal(calls, stage + 1);
  assert.ok(responses.every(response => !response.body.locked));
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [suppress]);
});
