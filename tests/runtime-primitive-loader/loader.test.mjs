import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = '/home/jack/zcash-primitive-loader-scratch';
const packet = process.env.PRIMITIVE_PACKET ?? root + '/packet-63d08ed';
const artifact = { manifestUrl: 'https://fixture.invalid/release/manifest.json', manifestSha256: JSON.parse(readFileSync(new URL('./pin.json', import.meta.url))).manifestSha256 };
export function fixture(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    const name = new URL(url).pathname.split('/').at(-1); calls.push(name);
    return new Response(readFileSync(packet + '/' + name), { headers: { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
  });
  return calls;
}
const vectorsPath = existsSync(new URL('./transaction-vectors.json', import.meta.url))
  ? new URL('./transaction-vectors.json', import.meta.url)
  : new URL('../../qualification/transaction-codec/fixtures/vectors.json', import.meta.url);
const compiled = (process.env.PRIMITIVE_SDK ?? root + '/sdk') + '/src/runtime/primitive-loader.js';
export const doc = new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
test('verified bytes execute real checked network and transaction methods in owned Node worker', async t => {
  assert.ok(existsSync(compiled), 'internal primitive loader must exist');
  const { openPrimitive } = await import(pathToFileURL(compiled));
  const calls = fixture(t);
  const runtime = await openPrimitive(artifact);
  try {
    assert.deepEqual(await runtime.consensusContext('zcash-js-network/1', doc, 20), { height: 20, branchId: 1991772603 });
    const vectors = JSON.parse(readFileSync(vectorsPath));
    for (const v of vectors) {
      const raw = new Uint8Array(Buffer.from(v.hex, 'hex'));
      const result = await runtime.decodeTransaction(raw, v.branch);
      assert.equal(Buffer.from(result.bytes).toString('hex'), v.hex);
      assert.equal(Buffer.from(result.txid).toString('hex'), v.txid);
      assert.equal(result.display, v.display);
      assert.ok(Object.isFrozen(result));
      assert.notEqual(raw.buffer, result.bytes.buffer);
    }
    assert.deepEqual(calls, ['manifest.json', 'primitive.mjs', 'worker.mjs', 'bindings_bg.wasm']);
  } finally { await runtime.close(); await runtime.close(); }
});

test('native caller abort races worker startup and requests; close is cached and terminal', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  const calls = fixture(t);
  const before = new AbortController(); before.abort('private detail');
  await assert.rejects(openPrimitive(artifact, { signal: before.signal }).then(async r => { await r.close(); return r; }), e => e.code === 'ABORTED');
  assert.equal(calls.length, 0);
  const { Worker } = await import('node:worker_threads');
  const original = Worker.prototype.postMessage;
  const startup = new AbortController(); let captured;
  t.mock.method(Worker.prototype, 'postMessage', function(message, ...rest) {
    captured = this;
    original.call(this, message, ...rest);
    if (message.type === 'init') startup.abort('private startup');
  });
  await assert.rejects(openPrimitive(artifact, { signal: startup.signal }), e => e.code === 'ABORTED');
  assert.equal(captured.threadId, -1, 'startup worker terminated before rejection');
  Worker.prototype.postMessage.mock.restore();
  const runtime = await openPrimitive(artifact);
  const controller = new AbortController();
  const work = runtime.consensusContext('zcash-js-network/1', doc, 20, { signal: controller.signal });
  controller.abort('private request');
  await assert.rejects(work, e => e.code === 'ABORTED');
  assert.equal(runtime.close(), runtime.close());
  await runtime.close();
  await assert.rejects(runtime.consensusContext('zcash-js-network/1', doc, 20), e => e.code === 'ABORTED');
});

test('startup and in-flight deadlines terminate actual workers, including lost replies', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  fixture(t);
  const { Worker } = await import('node:worker_threads');
  const original = Worker.prototype.postMessage; let captured;
  t.mock.method(Worker.prototype, 'postMessage', function(message, ...rest) {
    captured = this;
    if (message.type !== 'init') return; // Transport fault, real worker remains alive.
    original.call(this, message, ...rest);
  });
  const runtime = await openPrimitive(artifact);
  try {
    const promise = runtime.consensusContext('zcash-js-network/1', doc, 20, { timeoutMs: 10 });
    const deadline = new Promise((_, reject) => setTimeout(() => reject(Error('test guard')), 500));
    await assert.rejects(Promise.race([promise, deadline]), e => e.code === 'TIMEOUT');
  } finally { await runtime.close(); }
  assert.equal(captured.threadId, -1);
});

test('malformed or oversized worker results invalidate the owner with sanitized errors', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  fixture(t);
  const { Worker } = await import('node:worker_threads');
  const original = Worker.prototype.postMessage;
  t.mock.method(Worker.prototype, 'postMessage', function(message, ...rest) {
    if (message.type === 'init') return original.call(this, message, ...rest);
    queueMicrotask(() => this.emit('message', { type: 'result', id: message.id,
      result: { bytes: new Uint8Array(2097153), txid: new Uint8Array(32), display: 'private leak' } }));
  });
  const runtime = await openPrimitive(artifact);
  try {
    await assert.rejects(runtime.decodeTransaction(Uint8Array.of(1), 0), e => e.code === 'WORKER_CRASHED' && !e.message.includes('private'));
  } finally { await runtime.close(); }
});

test('every initial hash mismatch and repinned extra import fails before executable namespace creation', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  const { createHash } = await import('node:crypto');
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const sha = b => createHash('sha256').update(b).digest('hex');
  const original = fs.mkdtempSync; let namespaces = 0;
  t.mock.method(fs, 'mkdtempSync', (...args) => { namespaces++; return original(...args); });
  syncBuiltinESMExports();
  t.after(() => { fs.mkdtempSync.mock.restore(); syncBuiltinESMExports(); });
  let assets;
  const pristine = () => new Map(['manifest.json', 'primitive.mjs', 'worker.mjs', 'bindings_bg.wasm'].map(n => [n, Buffer.from(readFileSync(packet + '/' + n))]));
  t.mock.method(globalThis, 'fetch', async url => {
    const name = new URL(url).pathname.split('/').at(-1);
    return new Response(assets.get(name), { headers: { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
  });
  for (const name of pristine().keys()) {
    assets = pristine(); assets.get(name)[0] ^= 1;
    await assert.rejects(openPrimitive(artifact), e => e.code === 'RUNTIME_UNAVAILABLE');
    assert.equal(namespaces, 0, name);
  }
  for (const name of ['primitive.mjs', 'worker.mjs']) {
    assets = pristine();
    assets.set(name, Buffer.concat([assets.get(name), Buffer.from('\nimport "https://fixture.invalid/unlisted.mjs";\n')]));
    const m = JSON.parse(assets.get('manifest.json'));
    const f = m.files.find(f => f.url === name); f.sha256 = sha(assets.get(name)); f.byteLength = assets.get(name).length;
    // Original is sorted canonical. Parsing/stringifying keeps that key order.
    assets.set('manifest.json', Buffer.from(JSON.stringify(m)));
    await assert.rejects(openPrimitive({ ...artifact, manifestSha256: sha(assets.get('manifest.json')) }), e => e.code === 'RUNTIME_UNAVAILABLE');
    assert.equal(namespaces, 0, 'repinned executable closure rejected');
  }
});

test('startup timeout, abort-ignoring acquisition, invalid and shadowed native options', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests++; return new Promise(() => {}); });
  const controller = new AbortController();
  Object.defineProperties(controller.signal, { aborted: { value: false }, addEventListener: { value() { throw Error('shadow'); } } });
  const start = openPrimitive(artifact, { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(start, e => e.code === 'ABORTED');
  await assert.rejects(openPrimitive(artifact, { timeoutMs: 10 }), e => e.code === 'TIMEOUT');
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 2 ** 32 }, { timeoutMs: NaN }, { signal: {} }, { backend: 'mock' }, null]) {
    await assert.rejects(openPrimitive(artifact, options), e => e.code === 'INVALID_ARGUMENT');
  }
  assert.equal(requests, 2);
});

test('native signals, snapshots, one request bound, terminal exits and temporary files', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled));
  fixture(t);
  const { Worker } = await import('node:worker_threads');
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const original = Worker.prototype.postMessage; let worker, modulePath;
  t.mock.method(Worker.prototype, 'postMessage', function(message, ...rest) {
    worker = this; if (message.type === 'init') modulePath = fileURLToPath(message.moduleUrl);
    return original.call(this, message, ...rest);
  });
  const runtime = await openPrimitive(artifact);
  try {
    const controller = new AbortController(); controller.signal.dispatchEvent(new Event('abort'));
    const input = doc.slice();
    const work = runtime.consensusContext('zcash-js-network/1', input, 20, { signal: controller.signal });
    input.fill(0);
    await assert.rejects(runtime.consensusContext('zcash-js-network/1', doc, 20), e => e.code === 'RESOURCE_LIMIT');
    assert.equal((await work).branchId, 1991772603);
    assert.ok(existsSync(modulePath));
    await worker.terminate();
    await new Promise(resolve => setTimeout(resolve, 10));
    await assert.rejects(runtime.consensusContext('zcash-js-network/1', doc, 20), e => e.code === 'WORKER_CRASHED');
    await runtime.close(); assert.equal(existsSync(modulePath), false);
  } finally { await runtime.close(); }
});

test('original accepted network corpus and transaction vectors/context controls over real worker', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const runtime = await openPrimitive(artifact);
  try {
    const network = await import('./network-cases.mjs');
    const transaction = await import('./transaction-cases.mjs');
    const vectors = JSON.parse(readFileSync(vectorsPath));
    const n = await network.run(runtime.consensusContext);
    const tx = await transaction.run(runtime.decodeTransaction, vectors);
    assert.equal(n.cases, 196); assert.equal(tx.vectors, 13); assert.equal(tx.baselineAdapterCalls, 208); assert.equal(tx.truncated, 1472);
    console.log(JSON.stringify({ network: n, transaction: tx }));
  } finally { await runtime.close(); }
});

test('explicit null timeout is invalid before acquisition', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); const calls = fixture(t);
  await assert.rejects(openPrimitive(artifact, { timeoutMs: null }).then(async r => { await r.close(); return r; }), e => e.code === 'INVALID_ARGUMENT');
  assert.equal(calls.length, 0);
});

test('cleanup failure rejects cached close with a sanitized error', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const runtime = await openPrimitive(artifact);
  const original = fs.rmSync; let ownedPath;
  t.mock.method(fs, 'rmSync', (path) => { ownedPath = path; throw Error('private path'); }); syncBuiltinESMExports();
  try {
    const close = runtime.close(); assert.equal(close, runtime.close());
    await assert.rejects(close, e => e.code === 'RUNTIME_UNAVAILABLE' && !e.message.includes('private'));
  } finally { fs.rmSync.mock.restore(); syncBuiltinESMExports(); if (ownedPath) original(ownedPath, { recursive: true, force: true }); }
});

test('native worker startup deadline destroys the unresponsive bootstrap', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const { Worker } = await import('node:worker_threads'); let worker;
  t.mock.method(Worker.prototype, 'postMessage', function() { worker = this; });
  await assert.rejects(openPrimitive(artifact, { timeoutMs: 100 }), e => e.code === 'TIMEOUT');
  assert.equal(worker.threadId, -1);
});

test('shared backing stores and spoofed views never enter the worker, while Buffer subviews are copied', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const runtime = await openPrimitive(artifact);
  try {
    for (const raw of [new Uint8Array(new SharedArrayBuffer(doc.length)), new Uint8Array(2097153), Object.create(Uint8Array.prototype)]) {
      await assert.rejects(runtime.decodeTransaction(raw, 0), e => e.code === 'INVALID_ARGUMENT');
      await assert.rejects(runtime.consensusContext('zcash-js-network/1', raw, 20), e => e.code === 'INVALID_ARGUMENT');
    }
    const backing = new SharedArrayBuffer(doc.length), shared = new Uint8Array(backing); shared.set(doc);
    Object.setPrototypeOf(backing, ArrayBuffer.prototype);
    await assert.rejects(runtime.consensusContext('zcash-js-network/1', shared, 20), e => e.code === 'INVALID_ARGUMENT');
    await assert.rejects(runtime.decodeTransaction(shared, 0), e => e.code === 'INVALID_ARGUMENT');
    const pooled = Buffer.allocUnsafe(doc.length + 2); pooled.set(doc, 1);
    const result = runtime.consensusContext('zcash-js-network/1', pooled.subarray(1, -1), 20); pooled.fill(0);
    assert.equal((await result).branchId, 1991772603);
  } finally { await runtime.close(); }
});

test('real bootstrap initialization failure is unavailable before readiness', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const { Worker } = await import('node:worker_threads'); const original = Worker.prototype.postMessage;
  t.mock.method(Worker.prototype, 'postMessage', function(message, ...rest) {
    if (message.type === 'init') message.wasm.fill(0); // Deliberate transport corruption after verification.
    return original.call(this, message, ...rest);
  });
  await assert.rejects(openPrimitive(artifact), e => e.code === 'RUNTIME_UNAVAILABLE');
});

const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('unsettled admission')), 200); })]); }
  finally { clearTimeout(timer); }
};
for (const operation of ['context', 'transaction']) {
  for (const trigger of ['signal getter', 'timeout getter', 'getPrototypeOf', 'ownKeys', 'get']) {
    for (const action of ['close', 'reenter']) {
      test(`admission ${operation}: ${trigger} ${action}`, async t => {
        const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
        const { Worker } = await import('node:worker_threads');
        const original = Worker.prototype.postMessage; let posts = 0, worker;
        t.mock.method(Worker.prototype, 'postMessage', function(m, ...rest) {
          worker = this; if (m.type !== 'init') posts++;
          return original.call(this, m, ...rest);
        });
        const runtime = await openPrimitive(artifact);
        const invoke = options => operation === 'context' ? runtime.consensusContext('zcash-js-network/1', doc, 20, options)
          : runtime.decodeTransaction(Uint8Array.of(1), 0, options);
        let inner, fired = false;
        const callback = () => { if (fired) return; fired = true; inner = action === 'close' ? runtime.close() : invoke(); inner.catch(() => {}); };
        let options = { timeoutMs: 20 };
        if (trigger.endsWith('getter')) Object.defineProperty(options, trigger === 'signal getter' ? 'signal' : 'timeoutMs', { get() { callback(); return trigger === 'signal getter' ? undefined : 20; } });
        else options = new Proxy(options, { [trigger](...args) { callback(); return Reflect[trigger](...args); } });
        try {
          await assert.rejects(bounded(invoke(options)), e => e.code === (action === 'close' ? 'CLOSED' : 'RESOURCE_LIMIT'));
          if (action === 'close') { await inner; assert.equal(posts, 0); assert.equal(worker.threadId, -1); }
          else {
            if (operation === 'context') assert.equal((await bounded(inner)).branchId, 1991772603);
            else await assert.rejects(bounded(inner), e => e.code === 'INVALID_ARGUMENT');
            assert.equal(posts, 1);
            await new Promise(resolve => setTimeout(resolve, 30)); // An unadmitted deadline must not close the real owner.
            assert.equal((await runtime.consensusContext('zcash-js-network/1', doc, 20)).branchId, 1991772603);
          }
        } finally { await runtime.close(); }
      });
    }
  }
}

for (const operation of ['context', 'transaction']) for (const action of ['close', 'reenter', 'abort', 'throw', 'deadline']) {
  test(`native signal registration ${operation} ${action} cannot strand or poison admission`, async t => {
    const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
    const { getEventListeners } = await import('node:events');
    const runtime = await openPrimitive(artifact), controller = new AbortController();
    const existing = () => {}; controller.signal.addEventListener('abort', existing);
    const key = Object.getOwnPropertySymbols(AbortSignal.prototype).find(k => k.description === 'kNewListener');
    assert.ok(key, 'Node native registration hook');
    let inner;
    Object.defineProperty(controller.signal, key, { configurable: true, value() {
      delete controller.signal[key];
      if (action === 'close') inner = runtime.close();
      if (action === 'reenter') inner = runtime.consensusContext('zcash-js-network/1', doc, 20);
      if (action === 'abort') controller.abort();
      if (action === 'throw') throw Error('caller registration failure');
      if (action === 'deadline') { const end = performance.now() + 25; while (performance.now() < end) {} }
      inner?.catch(() => {});
    } });
    try {
      const options = { signal: controller.signal, timeoutMs: 20 };
      const work = operation === 'context' ? runtime.consensusContext('zcash-js-network/1', doc, 20, options)
        : runtime.decodeTransaction(Uint8Array.of(1), 0, options);
      await assert.rejects(bounded(work), e => e.code === ({ close: 'CLOSED', reenter: 'RESOURCE_LIMIT', abort: 'ABORTED', throw: 'INVALID_ARGUMENT', deadline: 'TIMEOUT' })[action]);
      await inner;
      assert.deepEqual(getEventListeners(controller.signal, 'abort'), [existing]);
      if (action !== 'close') {
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal((await runtime.consensusContext('zcash-js-network/1', doc, 20)).branchId, 1991772603);
      }
    } finally { await runtime.close(); }
  });
}

for (const action of ['close', 'reenter', 'throw']) {
  test(`native signal removal ${action} preserves resolver ownership`, async t => {
    const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
    const runtime = await openPrimitive(artifact), controller = new AbortController();
    const key = Object.getOwnPropertySymbols(AbortSignal.prototype).find(k => k.description === 'kRemoveListener');
    assert.ok(key);
    let inner;
    Object.defineProperty(controller.signal, key, { configurable: true, value() {
      delete controller.signal[key];
      if (action === 'close') inner = runtime.close();
      if (action === 'reenter') inner = runtime.consensusContext('zcash-js-network/1', doc, 20);
      if (action === 'throw') throw Error('caller cleanup failure');
      inner?.catch(() => {});
    } });
    try {
      assert.equal((await bounded(runtime.consensusContext('zcash-js-network/1', doc, 20, { signal: controller.signal }))).branchId, 1991772603);
      if (action === 'reenter') assert.equal((await bounded(inner)).branchId, 1991772603);
      else await inner;
      if (action === 'throw') assert.equal((await runtime.consensusContext('zcash-js-network/1', doc, 20)).branchId, 1991772603);
    } finally { await runtime.close(); }
  });
}

test('close is latched before caller signal cleanup reenters it', async t => {
  const { openPrimitive } = await import(pathToFileURL(compiled)); fixture(t);
  const runtime = await openPrimitive(artifact), controller = new AbortController();
  const key = Object.getOwnPropertySymbols(AbortSignal.prototype).find(k => k.description === 'kRemoveListener');
  let inner;
  Object.defineProperty(controller.signal, key, { value() { inner = runtime.close(); } });
  const work = runtime.consensusContext('zcash-js-network/1', doc, 20, { signal: controller.signal });
  const rejected = assert.rejects(bounded(work), e => e.code === 'CLOSED');
  const closing = runtime.close();
  await closing; await rejected;
  assert.equal(inner, closing);
  assert.equal(runtime.close(), closing);
});
