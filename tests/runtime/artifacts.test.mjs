import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireArtifacts } from '../../dist/src/runtime/artifacts.js';
import { isZcashError } from '../../dist/src/errors.js';
import { fixture, canonical, encode, sha } from './artifacts-browser.mjs';

async function repin(f, text = canonical(f.manifest)) { f.bytes = encode(text); f.artifact.manifestSha256 = await sha(f.bytes); }
function route(t, f, change = () => undefined) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    const path = decodeURIComponent(new URL(url).pathname.split('/release/')[1]);
    const bytes = path === 'manifest.json' ? f.bytes : f.assets.get(path);
    assert.ok(bytes, 'only listed assets requested');
    return change(path, bytes, options) ?? new Response(bytes, { headers: { 'content-type': path === 'manifest.json' ? 'application/json' : path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
  });
  return calls;
}
async function rejects(work, code) {
  await assert.rejects(work, e => {
    assert.ok(isZcashError(e)); assert.equal(e.code, code);
    assert.equal(e.retryable, false);
    assert.ok(!JSON.stringify([e, e.message, e.stack]).includes('private-fixture'));
    assert.equal(e.cause, undefined); return true;
  });
}

test('acquires every asset, owns bytes, freezes metadata, disposes idempotently', async t => {
  const f = await fixture(); const calls = route(t, f);
  const result = await acquireArtifacts(f.artifact, f.policy);
  assert.deepEqual(result.manifest, f.manifest);
  for (const [url, bytes] of f.assets) {
    assert.deepEqual(result.copyFile(url), bytes);
    result.copyFile(url).fill(255);
    assert.deepEqual(result.copyFile(url), bytes);
  }
  assert.deepEqual(result.copyManifest(), f.bytes);
  result.copyManifest().fill(255);
  assert.deepEqual(result.copyManifest(), f.bytes);
  assert.throws(() => { result.manifest.files[0].url = 'changed'; });
  assert.equal(calls.length, f.assets.size + 1);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.cache, 'no-store');
  }
  assert.throws(() => result.copyFile('unlisted'), e => e.code === 'INVALID_ARGUMENT');
  result.dispose(); result.dispose();
  assert.throws(() => result.copyFile('entry.mjs'), e => e.code === 'CLOSED');
});

test('pin is checked before malformed manifest fields or asset requests', async t => {
  const f = await fixture(); f.bytes = encode('{"private-fixture":'); const calls = route(t, f);
  await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE'); assert.equal(calls.length, 1);
});

test('canonical UTF8, duplicate/unknown keys, numbers, controls and scalar ordering', async t => {
  const f = await fixture(); route(t, f);
  const base = canonical(f.manifest);
  const invalid = [base + '\n', '\ufeff' + base, base.replace('{', '{ '), base.replace('"format":', '"format":"zcash-artifact/1","format":'),
    base.replace('"files":', '"extra":1,"files":'), base.replace('"byteLength":8', '"byteLength":8.0'),
    base.replace('"byteLength":8', '"byteLength":8e0'), base.replace('"byteLength":8', '"byteLength":0'),
    base.replace('synthetic-contract', '\\ud800'), base.replace('synthetic-contract', '\\u0073ynthetic-contract')];
  for (const bytes of invalid) { await repin(f, bytes); await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT'); }
  f.bytes = new Uint8Array([0xff]); f.artifact.manifestSha256 = await sha(f.bytes);
  await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
  f.manifest.schemas.operations = { '\ue000': 'bmp', '😀': 'astral', '2': 'digit', '10': 'digit', '\u0000\n\t"\\': 'control\r\b\f' };
  f.policy.schemas = structuredClone(f.manifest.schemas); await repin(f);
  const good = await acquireArtifacts(f.artifact, f.policy); good.dispose();
  await repin(f, canonical(f.manifest).replace('\\u000a', '\\n'));
  await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
});

test('manifest URL rejects credentials and normalization hazards before fetch', async t => {
  const f = await fixture(); const calls = route(t, f);
  for (const manifestUrl of ['http://fixture.invalid/a', '/a', 'https://u:private-fixture@fixture.invalid/a', 'https://@fixture.invalid/a', 'https://fixture.invalid/a?', 'https://fixture.invalid/a#', ' https://fixture.invalid/a', 'https://fixture.invalid/\\a', 'https://fixture.invalid/a\nb']) {
    await rejects(acquireArtifacts({ ...f.artifact, manifestUrl }, f.policy), 'INVALID_ARGUMENT');
  }
  assert.equal(calls.length, 0);
});

test('all schema and compatibility checks run before fetching any asset', async t => {
  const f = await fixture(); const calls = route(t, f); const original = structuredClone(f.manifest);
  const mutations = [m => delete m.buildSha256, m => m.dependencyGraphSha256 = 'A'.repeat(64), m => m.files[0].sha256 = 'x',
    m => m.files[0].byteLength = Number.MAX_SAFE_INTEGER + 1, m => m.files[0].byteLength = -1, m => m.files[0].mediaType = 'application/wasm',
    m => m.schemas.extra = 'unknown', m => m.schemas.operations.x = 1, m => m.files[0].extra = true, m => m.format = 'zcash-artifact/2',
    m => m.files = [], m => m.mode = 'unknown', m => m.files[0].kind = 'unknown'];
  for (const mutate of mutations) { f.manifest = structuredClone(original); mutate(f.manifest); await repin(f); await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT'); }
  for (const field of ['contractRevision', 'abiVersion', 'mode']) {
    f.manifest = structuredClone(original); f.manifest[field] = field === 'mode' ? 'threaded' : 'other'; await repin(f);
    await rejects(acquireArtifacts(f.artifact, f.policy), 'PROTOCOL_MISMATCH');
  }
  for (const field of Object.keys(original.schemas)) {
    f.manifest = structuredClone(original); f.manifest.schemas[field] = typeof original.schemas[field] === 'object' ? {} : 'other'; await repin(f);
    await rejects(acquireArtifacts(f.artifact, f.policy), 'PROTOCOL_MISMATCH');
  }
  assert.ok(calls.every(c => c.url === f.artifact.manifestUrl));
});

test('contained unique paths and complete required kind inventory', async t => {
  const f = await fixture(); const calls = route(t, f); const original = structuredClone(f.manifest);
  for (const url of ['https://else.invalid/a', '/a', '//else.invalid/a', '../a', './a', 'a/../b', 'a//b', 'a/', 'a\\b', 'a?private-fixture', 'a#b', '%61', 'a/%2e/b', '', 'worker.mjs']) {
    f.manifest = structuredClone(original); f.manifest.files[0].url = url; await repin(f);
    await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
  }
  for (const kind of ['module', 'worker', 'wasm']) {
    f.manifest = structuredClone(original); f.manifest.files = f.manifest.files.filter(file => file.kind !== kind); await repin(f);
    await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
  }
  f.manifest = structuredClone(original); f.manifest.files[3].kind = 'module'; await repin(f);
  await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
  assert.ok(calls.every(c => c.url === f.artifact.manifestUrl));
});

test('threaded policy requires bootstrap and verifies its bytes', async t => {
  const f = await fixture('threaded'); route(t, f);
  (await acquireArtifacts(f.artifact, f.policy)).dispose();
  f.assets.get('bootstrap.mjs')[0] ^= 1;
  await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE');
  f.manifest.files.pop(); await repin(f);
  await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
});

test('media, status, length, digest, streamed limits and aggregate admission', async t => {
  const f = await fixture(); let mode;
  route(t, f, (path, bytes) => {
    if (path !== 'entry.mjs') return;
    if (mode === 'status') return new Response('private-fixture', { status: 403 });
    if (mode === 'media') return new Response(bytes, { headers: { 'content-type': 'text/html' } });
    const data = mode === 'short' ? bytes.slice(1) : mode === 'long' ? new Uint8Array(bytes.length + 1) : mode === 'hash' ? new Uint8Array(bytes.length) : bytes;
    return new Response(data, { headers: { 'content-type': 'text/javascript; charset=utf-8', ...(mode === 'header' ? { 'content-length': '99999' } : {}) } });
  });
  for (const [value, code] of [['status', 'RUNTIME_UNAVAILABLE'], ['media', 'INVALID_ARGUMENT'], ['short', 'RUNTIME_UNAVAILABLE'], ['long', 'RUNTIME_UNAVAILABLE'], ['hash', 'RUNTIME_UNAVAILABLE'], ['header', 'RESOURCE_LIMIT']]) {
    mode = value; await rejects(acquireArtifacts(f.artifact, f.policy), code);
  }
  for (const limits of [{ maxManifestBytes: 10 }, { maxAssetBytes: 10 }, { maxTotalAssetBytes: 10 }, { maxFiles: 1 }]) {
    await rejects(acquireArtifacts(f.artifact, { ...f.policy, ...limits }), 'RESOURCE_LIMIT');
  }
});

test('abort, deadline, late response cancellation and foreign failures are bounded', async t => {
  const f = await fixture(); let canceled = 0, signal, resolveFetch;
  t.mock.method(globalThis, 'fetch', (_url, options) => { signal = options.signal; return new Promise(resolve => { resolveFetch = resolve; }); });
  const controller = new AbortController();
  const pending = acquireArtifacts(f.artifact, f.policy, controller.signal); controller.abort(new Error('private-fixture'));
  await rejects(pending, 'ABORTED'); assert.equal(signal.aborted, true);
  resolveFetch(new Response(new ReadableStream({ cancel() { canceled++; } })));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(canceled, 1);
  await rejects(acquireArtifacts(f.artifact, { ...f.policy, timeoutMs: 15 }), 'TIMEOUT');
  t.mock.method(globalThis, 'fetch', async () => { throw { get message() { throw Error('private-fixture'); } }; });
  await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE');
});

test('stalled streaming cancels without awaiting foreign cancellation', async t => {
  const f = await fixture(); let canceled = 0;
  route(t, f, () => new Response(new ReadableStream({ start(c) { c.enqueue(f.bytes.slice(0, 10)); }, cancel() { canceled++; return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } }));
  await rejects(acquireArtifacts(f.artifact, { ...f.policy, timeoutMs: 15 }), 'TIMEOUT');
  assert.equal(canceled, 1);
});

test('actual Node HTTPS acquisition (explicit scoped certificate trust)', { skip: !process.env.ARTIFACT_TLS_CERT || !process.env.ARTIFACT_TLS_KEY }, async () => {
  const { serveFixture, networkChecks } = await import('./artifacts-browser.mjs');
  const server = await serveFixture({ cert: process.env.ARTIFACT_TLS_CERT, key: process.env.ARTIFACT_TLS_KEY });
  try {
    assert.equal((await networkChecks(acquireArtifacts, server.origin)).length, 12);
    assert.deepEqual(server.unexpected, []);
    assert.ok(server.requests.every(r => !r.cookie && !r.authorization && !r.referer));
    assert.deepEqual(server.requests.filter(r => r.scenario === 'good').map(r => r.path), ['manifest.json', 'entry.mjs', 'worker.mjs', 'runtime.wasm', 'deps/雪.mjs']);
  } finally { await server.close(); }
});

test('snapshots policy before await and never aliases supplied stream chunks', async t => {
  const f = await fixture(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  route(t, f, async (path, bytes) => {
    await gate;
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }), { headers: { 'content-type': path === 'manifest.json' ? 'application/json' : path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
  });
  const pending = acquireArtifacts(f.artifact, f.policy);
  f.policy.schemas.operations.runtime_init = 'caller-mutated'; f.policy.maxAssetBytes = 1;
  f.artifact.manifestSha256 = '0'.repeat(64); f.artifact.manifestUrl = 'http://private-fixture.invalid';
  release(); const result = await pending;
  const expected = result.copyFile('entry.mjs'); f.assets.get('entry.mjs').fill(0);
  assert.deepEqual(result.copyFile('entry.mjs'), expected);
  result.dispose();
});

test('zeroes all retained partial bytes on late asset failure and success disposal', async t => {
  const f = await fixture(); route(t, f);
  const digest = crypto.subtle.digest.bind(crypto.subtle); const observed = [];
  t.mock.method(crypto.subtle, 'digest', (algorithm, bytes) => { observed.push(bytes); return digest(algorithm, bytes); });
  f.assets.get('deps/雪.mjs')[0] ^= 1;
  await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE');
  assert.equal(observed.length, 5);
  assert.ok(observed.every(bytes => bytes.every(n => n === 0)), 'manifest and all retained assets cleared');
  f.assets.get('deps/雪.mjs')[0] ^= 1; observed.length = 0;
  const result = await acquireArtifacts(f.artifact, f.policy); const output = result.copyFile('entry.mjs'); result.dispose();
  assert.ok(observed.every(bytes => bytes.every(n => n === 0)));
  assert.ok(output.some(n => n !== 0), 'caller owns independently returned copy');
});

test('aborts during digest, clears partial bytes, and pre-abort never fetches', async t => {
  const f = await fixture(); const calls = route(t, f);
  const prior = new AbortController(); prior.abort('private-fixture');
  await rejects(acquireArtifacts(f.artifact, f.policy, prior.signal), 'ABORTED'); assert.equal(calls.length, 0);
  const digest = crypto.subtle.digest.bind(crypto.subtle); const controller = new AbortController(); let retained;
  t.mock.method(crypto.subtle, 'digest', (algorithm, bytes) => {
    if (bytes.length === f.assets.get('entry.mjs').length) { retained = bytes; controller.abort('private-fixture'); return new Promise(() => {}); }
    return digest(algorithm, bytes);
  });
  await rejects(acquireArtifacts(f.artifact, f.policy, controller.signal), 'ABORTED');
  assert.ok(retained.every(n => n === 0)); assert.equal(calls.length, 2);
});

test('bad length headers, redirected responses, invalid policy and hostile input sanitize', async t => {
  const f = await fixture(); let headers = { 'content-type': 'application/json', 'content-length': 'private-fixture' };
  route(t, f, () => new Response(f.bytes, { headers }));
  await rejects(acquireArtifacts(f.artifact, f.policy), 'INVALID_ARGUMENT');
  headers['content-length'] = '1'; await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE');
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await rejects(acquireArtifacts(f.artifact, { ...f.policy, timeoutMs: value }), 'INVALID_ARGUMENT');
  }
  for (const manifestUrl of ['https://fixture.invalid/a\u0000', 'https://fixture.invalid/\u0001a']) await rejects(acquireArtifacts({ ...f.artifact, manifestUrl }, f.policy), 'INVALID_ARGUMENT');
  await rejects(acquireArtifacts({ get manifestUrl() { throw Error('private-fixture'); }, manifestSha256: f.artifact.manifestSha256 }, f.policy), 'INVALID_ARGUMENT');
  t.mock.method(globalThis, 'fetch', async () => {
    const response = new Response(f.bytes, { headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'redirected', { value: true }); return response;
  });
  await rejects(acquireArtifacts(f.artifact, f.policy), 'RUNTIME_UNAVAILABLE');
});

test('checks decoded streamed length when wire response is compressed', async t => {
  const f = await fixture();
  route(t, f, (path, bytes) => new Response(bytes, { headers: { 'content-type': path === 'manifest.json' ? 'application/json' : path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', 'content-encoding': 'gzip', 'content-length': '1' } }));
  (await acquireArtifacts(f.artifact, f.policy)).dispose();
});

test('tiny and empty streamed chunks do not retain cancellation listeners', async t => {
  const { getEventListeners } = await import('node:events');
  const f = await fixture(); let maximum = 0;
  route(t, f, (path, bytes, options) => {
    let offset = 0, empty = true;
    return new Response(new ReadableStream({ pull(c) {
      maximum = Math.max(maximum, getEventListeners(options.signal, 'abort').length);
      if (empty) { c.enqueue(new Uint8Array()); empty = false; }
      else if (offset < bytes.length) { c.enqueue(bytes.subarray(offset, ++offset)); empty = true; }
      else c.close();
    } }), { headers: { 'content-type': path === 'manifest.json' ? 'application/json' : path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' } });
  });
  (await acquireArtifacts(f.artifact, f.policy)).dispose();
  assert.ok(maximum <= 1);
});

test('manifest is authenticated as bytes independently of MIME; absolute authority is required', async t => {
  const f = await fixture(); const calls = route(t, f, (path, bytes) => path === 'manifest.json' ? new Response(bytes) : undefined);
  (await acquireArtifacts(f.artifact, f.policy)).dispose();
  const count = calls.length;
  await rejects(acquireArtifacts({ ...f.artifact, manifestUrl: 'https:///fixture.invalid/a' }, f.policy), 'INVALID_ARGUMENT');
  assert.equal(calls.length, count);
});
