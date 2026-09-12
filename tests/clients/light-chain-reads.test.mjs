import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureCodec, revision, hash, display, tipBytes, response, blockBytes, nextHash, scalar, bytesField, concat, frame, base64, trailer, media } from './light-chain-reads-fixtures.mjs';
const { codec } = await fixtureCodec();
const build = process.env.LIGHT_CHAIN_BUILD;
assert.ok(build, 'LIGHT_CHAIN_BUILD must name external tsc output');
const internal = await import(build + '/src/clients/light-chain-reads.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
});
const { createGrpcWebByteTransport } = await import(build + '/src/clients/grpc-web.js');
const transport = () => ({ kind: 'custom-lightwallet', sourceId: 'fixture', protocolRevision: revision,
  ...createGrpcWebByteTransport('https://synthetic.invalid', { timeoutMs: 1000 }) });
test('tip composes actual codec and accepted byte transport, reversing wire hash', async t => {
  assert.equal(typeof internal.getTip, 'function', 'internal getTip exists');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, args) => {
    calls++; assert.equal(new URL(url).pathname.endsWith('/GetLatestBlock'), true);
    assert.equal(args.body, 'AAAAAAA='); // framed empty ChainSpec
    return response(tipBytes());
  });
  const before = Date.now();
  const result = await internal.getTip(codec, transport());
  assert.deepEqual({ ...result, observedAt: undefined }, { height: 7, hash: display(hash), sourceId: 'fixture', observedAt: undefined });
  assert.ok(Date.parse(result.observedAt) >= before && Date.parse(result.observedAt) <= Date.now());
  assert.equal(new Date(result.observedAt).toISOString(), result.observedAt);
  assert.equal(calls, 1);
});

const errorCode = code => error => error?.name === 'ZcashError' && error.code === code && !String(error).includes('private-secret');
test('tip rejects schema mismatch before any transport call', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('must not fetch'); });
  for (const protocolRevision of ['', 'v0.5.0', revision + 'x']) {
    await assert.rejects(internal.getTip(codec, { ...transport(), protocolRevision }), errorCode('PROTOCOL_MISMATCH'));
  }
  assert.equal(fetch.mock.callCount(), 0);
});
test('tip validates uint64 before narrowing, defaults and malformed hashes/wire', async t => {
  let bytes;
  t.mock.method(globalThis, 'fetch', async () => response(bytes));
  for (bytes of [tipBytes(4294967296n), tipBytes(9007199254740993n), tipBytes(18446744073709551615n),
    new Uint8Array(), tipBytes(7, new Uint8Array(31)), tipBytes(7, new Uint8Array(33)), new Uint8Array([8, 128])]) {
    await assert.rejects(internal.getTip(codec, transport()), errorCode('PROTOCOL_MISMATCH'));
  }
  for (const height of [0, 4294967295]) {
    bytes = tipBytes(height); assert.equal((await internal.getTip(codec, transport())).height, height);
  }
});
test('tip sanitizes transport failure without retries', async () => {
  let calls = 0;
  await assert.rejects(internal.getTip(codec, { ...transport(), unary() { calls++; throw Error('private-secret'); } }), errorCode('TRANSPORT_ERROR'));
  assert.equal(calls, 1);
});
test('tip rejects unknown options and invalid labels without transport', async () => {
  for (const args of [null, { extra: 1 }, { signal: {} }]) {
    await assert.rejects(internal.getTip(codec, transport(), args), errorCode('INVALID_ARGUMENT'));
  }
  await assert.rejects(internal.getTip(codec, { ...transport(), sourceId: '' }), errorCode('INVALID_ARGUMENT'));
});

const range = { fromHeight: 7, toHeight: 8 };
const collect = async values => { const result = []; for await (const value of values) result.push(value); return result; };
test('compact range uses exact inclusive request and preserves full encoded bytes', async t => {
  assert.equal(typeof internal.streamCompactBlocks, 'function');
  const extra = concat(bytesField(8, scalar(3, 19)), bytesField(99, new Uint8Array([1, 2, 3])));
  const first = blockBytes(7, hash, nextHash, extra), second = blockBytes(8, nextHash, hash);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_, args) => {
    calls++;
    assert.equal(args.body, base64(frame(new Uint8Array([10, 2, 8, 7, 18, 2, 8, 8]))));
    return response(first, second);
  });
  const values = await collect(internal.streamCompactBlocks(codec, transport(), range));
  assert.equal(values.length, 2);
  assert.deepEqual(values.map(v => v.point), [{ height: 7, hash: display(hash) }, { height: 8, hash: display(nextHash) }]);
  assert.equal(values[1].previousHash, values[0].point.hash);
  assert.deepEqual(values[0].encoded, first);
  assert.equal(values[0].sourceId, 'fixture');
  assert.equal(new Date(values[0].observedAt).toISOString(), values[0].observedAt);
  values[0].encoded.fill(255); assert.deepEqual(values[1].encoded, second);
  assert.equal(calls, 1);
});

test('range admission rejects invalid/oversized ranges before transport', async () => {
  let calls = 0;
  const custom = { ...transport(), stream() { calls++; return { async *[Symbol.asyncIterator]() {} }; } };
  for (const args of [null, {}, { fromHeight: 0, toHeight: 1024 }, { fromHeight: 8, toHeight: 7 },
    { fromHeight: -1, toHeight: 1 }, { fromHeight: 0.1, toHeight: 1 }, { fromHeight: 0, toHeight: Infinity },
    { fromHeight: 4294967296, toHeight: 4294967296 }, { ...range, poolTypes: [] }]) {
    await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, custom, args)), errorCode('INVALID_ARGUMENT'));
  }
  await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, { ...custom, protocolRevision: 'v0.5.0' }, range)), errorCode('PROTOCOL_MISMATCH'));
  assert.equal(calls, 0);
});
test('stream checks order, count, linkage, points and terminal failure without replay', async t => {
  let items, terminal = trailer(), calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; return new Response(base64(concat(...items.map(b => frame(b)), terminal)), { headers: { 'content-type': media } });
  });
  const first = blockBytes(), second = blockBytes(8, nextHash, hash);
  const cases = [[], [first], [second, first], [first, first], [first, blockBytes(8)], [first, second, second],
    [blockBytes(4294967296n)], [blockBytes(9007199254740993n)], [new Uint8Array()],
    [blockBytes(7, new Uint8Array(31))], [blockBytes(7, hash, new Uint8Array(33))], [new Uint8Array([16, 128])]];
  for (items of cases) await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, transport(), range)), errorCode('PROTOCOL_MISMATCH'));
  items = [first, second]; terminal = new Uint8Array();
  const stream = internal.streamCompactBlocks(codec, transport(), range);
  assert.equal((await stream.next()).value.point.height, 7);
  assert.equal((await stream.next()).value.point.height, 8);
  await assert.rejects(stream.next(), errorCode('PROTOCOL_MISMATCH'));
  terminal = trailer('grpc-status: 13\r\ngrpc-message: private-secret\r\n');
  await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, transport(), range)), errorCode('TRANSPORT_ERROR'));
  assert.equal(calls, cases.length + 2);
});
test('custom stream is pull bounded, owns payload and sanitizes late errors', async () => {
  let pulls = 0, releases = 0;
  const bytes = blockBytes();
  const custom = { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; },
    async next() { if (++pulls === 1) return { done: false, value: bytes }; throw Error('private-secret'); },
    async return() { releases++; return { done: true }; } }; } };
  const stream = internal.streamCompactBlocks(codec, custom, range);
  assert.equal(pulls, 0);
  const first = await stream.next(); assert.equal(pulls, 1);
  bytes.fill(255); assert.deepEqual(first.value.encoded, blockBytes());
  await assert.rejects(stream.next(), errorCode('TRANSPORT_ERROR'));
  assert.equal(pulls, 2); assert.equal(releases, 1);
});
test('custom message bytes are bounded before copying and reject non-byte payloads', async () => {
  for (const value of [[], new Uint8Array(4 * 1024 * 1024 + 1), new Uint8Array(new SharedArrayBuffer(80))]) {
    const custom = { ...transport(), stream() { return { async *[Symbol.asyncIterator]() { yield value; } }; } };
    await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, custom, range)),
      errorCode(value instanceof Uint8Array && value.length > 4 * 1024 * 1024 ? 'RESOURCE_LIMIT' : 'PROTOCOL_MISMATCH'));
  }
});

const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('did not settle')), 200); })]); }
  finally { clearTimeout(timer); }
};
test('tip aborts pending custom call and rejects pre-abort before dispatch', async () => {
  let calls = 0, signal;
  const custom = { ...transport(), unary(args) { calls++; signal = args.signal; return new Promise(() => {}); } };
  const pre = new AbortController(); pre.abort();
  await assert.rejects(bounded(internal.getTip(codec, custom, { signal: pre.signal })), errorCode('ABORTED'));
  assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = internal.getTip(codec, custom, { signal: controller.signal }); controller.abort('private-secret');
  await assert.rejects(bounded(pending), errorCode('ABORTED')); assert.equal(signal.aborted, true);
});
test('stream return releases a pending read and concurrent next is rejected', async () => {
  let pulls = 0, released = 0, signal;
  const custom = { ...transport(), stream(args) { signal = args.signal; return { [Symbol.asyncIterator]() { return this; },
    next() { pulls++; return new Promise(() => {}); }, return() { released++; return new Promise(() => {}); } }; } };
  const stream = internal.streamCompactBlocks(codec, custom, range);
  const pending = stream.next();
  await assert.rejects(bounded(stream.next()), errorCode('INVALID_ARGUMENT'));
  assert.deepEqual(await bounded(stream.return()), { done: true, value: undefined });
  await assert.rejects(bounded(pending), errorCode('ABORTED'));
  assert.equal(pulls, 1); assert.equal(released, 1); assert.equal(signal.aborted, true);
});
test('native cancellation ignores synthetic events and survives earlier listener suppression', async () => {
  const controller = new AbortController();
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  let resolve, released = 0;
  const custom = { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; },
    next() { return new Promise(r => { resolve = r; }); }, async return() { released++; return { done: true }; } }; } };
  const stream = internal.streamCompactBlocks(codec, custom, { ...range, signal: controller.signal });
  const first = stream.next();
  controller.signal.dispatchEvent(new Event('abort'));
  resolve({ done: false, value: blockBytes() });
  assert.equal((await bounded(first)).value.point.height, 7);
  const pending = stream.next(); controller.abort();
  await assert.rejects(bounded(pending), errorCode('ABORTED'));
  assert.equal(released, 1);
});
test('final async boundary observes cancellation even after custom result resolution', async () => {
  const controller = new AbortController();
  const custom = { ...transport(), unary() { const result = Promise.resolve(tipBytes()); queueMicrotask(() => controller.abort()); return result; } };
  await assert.rejects(internal.getTip(codec, custom, { signal: controller.signal }), errorCode('ABORTED'));
  const c = new AbortController();
  const stream = internal.streamCompactBlocks(codec, { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; },
    next() { const result = Promise.resolve({ done: false, value: blockBytes() }); queueMicrotask(() => c.abort()); return result; },
    async return() { return { done: true }; } }; } }, { ...range, signal: c.signal });
  await assert.rejects(stream.next(), errorCode('ABORTED'));
});

test('overridden native signal state is rejected before custom transport', async () => {
  for (const value of [true, false]) {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'aborted', { value });
    let calls = 0;
    await assert.rejects(internal.getTip(codec, { ...transport(), unary() { calls++; return tipBytes(); } }, { signal: controller.signal }), errorCode('INVALID_ARGUMENT'));
    assert.equal(calls, 0);
  }
});
test('abort during stream acquisition still releases the acquired iterator', async () => {
  const controller = new AbortController(); let released = 0, pulls = 0;
  const custom = { ...transport(), stream() {
    controller.abort(); return { [Symbol.asyncIterator]() { return this; }, async next() { pulls++; return { done: true }; },
      async return() { released++; return { done: true }; } };
  } };
  await assert.rejects(internal.streamCompactBlocks(codec, custom, { ...range, signal: controller.signal }).next(), errorCode('ABORTED'));
  assert.equal(released, 1); assert.equal(pulls, 0);
});
test('range arguments and source label are captured before caller mutation', async () => {
  const args = { ...range }, custom = { ...transport(), stream() { return { async *[Symbol.asyncIterator]() {
    yield blockBytes(); yield blockBytes(8, nextHash, hash);
  } }; } };
  const stream = internal.streamCompactBlocks(codec, custom, args);
  args.toHeight = 100; custom.sourceId = 'changed';
  const values = await collect(stream); assert.equal(values.length, 2); assert.equal(values[0].sourceId, 'fixture');
});

test('accessor options and signal proxies reject without running caller accessors', async () => {
  let reads = 0;
  const args = { get signal() { reads++; throw Error('private-secret'); } };
  await assert.rejects(internal.getTip(codec, transport(), args), errorCode('INVALID_ARGUMENT'));
  assert.equal(reads, 0);
  const signal = new Proxy(new AbortController().signal, {});
  await assert.rejects(internal.getTip(codec, { ...transport(), unary() { return tipBytes(); } }, { signal }), errorCode('INVALID_ARGUMENT'));
});
test('maximum inclusive range is finite and total compact bytes are capped', async () => {
  let pulls = 0, releases = 0;
  const custom = { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; }, async next() {
    if (pulls === 1024) { pulls++; return { done: true }; }
    return { done: false, value: blockBytes(pulls++, hash, hash) };
  }, async return() { releases++; return { done: true }; } }; } };
  const values = await collect(internal.streamCompactBlocks(codec, custom, { fromHeight: 0, toHeight: 1023 }));
  assert.equal(values.length, 1024); assert.equal(pulls, 1025); assert.equal(releases, 1);
  const extra = bytesField(99, new Uint8Array(1024 * 1024));
  let count = 0;
  const large = { ...transport(), stream() { return { async *[Symbol.asyncIterator]() {
    for (;;) { yield blockBytes(count++, hash, hash, extra); }
  } }; } };
  await assert.rejects(async () => collect(internal.streamCompactBlocks(codec, large, { fromHeight: 0, toHeight: 100 })), errorCode('RESOURCE_LIMIT'));
  assert.equal(count, 64);
});
test('original compact bytes retain real golden Ironwood fields and unknown fields', async () => {
  const { acceptedArtifacts } = await import('./light-chain-reads-fixtures.mjs');
  const { golden } = await acceptedArtifacts();
  const vector = golden.find(v => v.method === 'GetBlockRange' && v.direction === 'item');
  assert.ok(vector.dto.vtx[0].ironwood_actions.length > 0);
  // The independent oracle's full-field message has max uint64 height. Scalar-last is protobuf behavior.
  const original = concat(Uint8Array.from(vector.hex.match(/../g), h => parseInt(h, 16)), scalar(2, 7), bytesField(99, new Uint8Array([42])));
  assert.equal(codec.decodeItem('GetBlockRange', original).height, '7');
  const custom = { ...transport(), stream() { return { async *[Symbol.asyncIterator]() { yield original; } }; } };
  const [block] = await collect(internal.streamCompactBlocks(codec, custom, { fromHeight: 7, toHeight: 7 }));
  assert.deepEqual(block.encoded, original);
});

test('unused stream return does not acquire transport; native dependent listeners are removed', async t => {
  const { getEventListeners } = await import('node:events');
  const originalAny = AbortSignal.any;
  const dependent = [];
  t.mock.method(AbortSignal, 'any', signals => { const signal = originalAny(signals); dependent.push(signal); return signal; });
  let calls = 0;
  const custom = { ...transport(), unary() { calls++; return tipBytes(); }, stream() {
    calls++; return { async *[Symbol.asyncIterator]() { yield blockBytes(); } };
  } };
  const unused = internal.streamCompactBlocks(codec, custom, range);
  await unused.return(); assert.equal((await unused.next()).done, true); assert.equal(calls, 0);
  await internal.getTip(codec, custom, { signal: new AbortController().signal });
  const iterator = internal.streamCompactBlocks(codec, custom, { fromHeight: 7, toHeight: 7, signal: new AbortController().signal });
  await collect(iterator);
  assert.equal(dependent.length, 2);
  for (const signal of dependent) assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('cancellation during final cleanup cannot become successful completion', async () => {
  const controller = new AbortController();
  const custom = { ...transport(), unary({ signal }) {
    signal.addEventListener('abort', () => controller.abort()); return tipBytes();
  } };
  await assert.rejects(internal.getTip(codec, custom, { signal: controller.signal }), errorCode('ABORTED'));
  const terminal = new AbortController(); let pulls = 0;
  const customStream = { ...transport(), stream() { return { [Symbol.asyncIterator]() { return this; }, async next() {
    return pulls++ ? { done: true } : { done: false, value: blockBytes() };
  }, async return() { terminal.abort(); return { done: true }; } }; } };
  const iterator = internal.streamCompactBlocks(codec, customStream, { fromHeight: 7, toHeight: 7, signal: terminal.signal });
  await iterator.next(); await assert.rejects(iterator.next(), errorCode('ABORTED'));
});
