import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import * as sdk from 'zcash.js';

const internal = await import('../../dist/src/http.js').catch(() => ({}));
const options = (extra = {}) => ({ sourceId: 'synthetic', timeoutMs: 1000,
  readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4096, ...extra });
const call = (transport, signal) => internal.readRpc(transport, 'getblockchaininfo', [], signal);
const response = (request, result = 'ok') => new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));

function mockFetch(t, callback) { t.mock.method(globalThis, 'fetch', callback); }

test('http is lazy, opaque, validates every option and snapshots policy', async (t) => {
  let calls = 0;
  mockFetch(t, async (_url, init) => { calls++; return response(JSON.parse(init.body)); });
  const policy = options();
  const transport = sdk.http('https://synthetic.invalid/token?secret=hidden', policy);
  assert.deepEqual(Object.keys(transport), []);
  assert.equal(calls, 0);
  policy.readRetry.attempts = 0;
  assert.equal(await call(transport), 'ok');
  assert.equal(calls, 1);
  for (const url of ['', '/relative', 'ftp://synthetic.invalid', 'https://user:pass@synthetic.invalid',
    'https://synthetic.invalid/#fragment']) assert.throws(() => sdk.http(url, options()), { code: 'INVALID_ARGUMENT' });
  for (const extra of [{ sourceId: '' }, { timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 1.2 },
    { timeoutMs: Number.MAX_SAFE_INTEGER + 1 }, { maxResponseBytes: 0 }, { headers: {} },
    { readRetry: { attempts: 0, delayMs: 0 } }, { readRetry: { attempts: 1, delayMs: -1 } },
    { readRetry: { attempts: 1, delayMs: 0, unknown: true } }, { unknown: true }, { [Symbol()]: true }]) {
    assert.throws(() => sdk.http('https://synthetic.invalid', options(extra)), { code: 'INVALID_ARGUMENT' });
  }
  await assert.rejects(call({}), { code: 'INVALID_ARGUMENT' });
});

test('wire requests use POST, distinct string IDs, explicit credentials, no redirect/cache and exact params', async (t) => {
  const requests = [];
  mockFetch(t, async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    assert.equal(url, 'https://synthetic.invalid/');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.get('content-type'), 'application/json');
    assert.equal(init.headers.get('authorization'), 'synthetic-token');
    await new Promise(resolve => setTimeout(resolve, requests.length === 1 ? 15 : 0));
    return response(body, body.params);
  });
  const transport = sdk.http('https://synthetic.invalid', options({ headers: async () => ({ Authorization: 'synthetic-token' }) }));
  const results = await Promise.all([internal.readRpc(transport, 'getblockhash', [0]), internal.readRpc(transport, 'getblockhash', [123])]);
  assert.equal(results[0][0].text, '0');
  assert.equal(results[1][0].text, '123');
  assert.equal(requests[0].jsonrpc, '2.0');
  assert.equal(requests[0].method, 'getblockhash');
  assert.equal(typeof requests[0].id, 'string');
  assert.notEqual(requests[0].id, requests[1].id);
  await assert.rejects(internal.readRpc(transport, 'sendrawtransaction', ['00']), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(internal.readRpc(transport, 'getblockhash', [1n]), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(internal.readRpc(transport, 'getblockhash', [Number.MAX_SAFE_INTEGER + 1]), { code: 'INVALID_ARGUMENT' });
});

test('malformed replies and mismatched IDs never become successful/absent results', async (t) => {
  const malformed = [
    id => ({ jsonrpc: '1.0', id, result: null }), id => ({ jsonrpc: '2.0', id: `${id}x`, result: null }),
    id => ({ jsonrpc: '2.0', id: Number(id), result: null }), id => ({ jsonrpc: '2.0', id }),
    id => ({ jsonrpc: '2.0', id, result: null, error: null }), id => ({ jsonrpc: '2.0', id, result: 1, extra: true }),
    id => ({ jsonrpc: '2.0', id, error: { code: '-32601', message: 'foreign' } }),
    id => ({ jsonrpc: '2.0', id, error: { code: -32601 } }), () => [], () => null,
  ];
  let current;
  mockFetch(t, async (_url, init) => new Response(JSON.stringify(current(JSON.parse(init.body).id))));
  const transport = sdk.http('https://synthetic.invalid', options());
  for (current of malformed) await assert.rejects(call(transport), { code: 'PROTOCOL_MISMATCH' });
});

test('RPC errors are distinct from absence, sanitized, and not retried', async (t) => {
  let calls = 0;
  let code = -32601;
  mockFetch(t, async (_url, init) => {
    calls++;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: JSON.parse(init.body).id,
      error: { code, message: 'private-server-text', data: 'private-server-data' } }));
  });
  const transport = sdk.http('https://synthetic.invalid/private-path', options({ readRetry: { attempts: 3, delayMs: 0 } }));
  await assert.rejects(call(transport), { code: 'METHOD_NOT_SUPPORTED', retryable: false });
  code = -5;
  await assert.rejects(call(transport), error => {
    assert.equal(error.code, 'TRANSPORT_ERROR');
    assert.equal(error.retryable, false);
    assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /private-/);
    return true;
  });
  assert.equal(calls, 2);
});

test('read retry attempts include first dispatch, keep one endpoint, and use fresh IDs', async (t) => {
  const ids = [];
  const urls = [];
  mockFetch(t, async (url, init) => {
    urls.push(url);
    const request = JSON.parse(init.body);
    ids.push(request.id);
    return ids.length < 3 ? new Response('private-server-error', { status: 503 }) : response(request);
  });
  assert.equal(await call(sdk.http('https://synthetic.invalid', options({ readRetry: { attempts: 3, delayMs: 1 } }))), 'ok');
  assert.equal(new Set(ids).size, 3);
  assert.equal(new Set(urls).size, 1);
});

test('caller abort and timeout bound both headers and fetch, ignoring private abort reasons', async (t) => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return new Promise(() => {}); });
  const aborted = new AbortController();
  aborted.abort('private-abort-reason');
  await assert.rejects(call(sdk.http('https://synthetic.invalid', options()), aborted.signal), { code: 'ABORTED' });
  assert.equal(calls, 0);
  const timeoutTransport = sdk.http('https://synthetic.invalid', options({ timeoutMs: 20 }));
  await assert.rejects(call(timeoutTransport), { code: 'TIMEOUT' });
  const hangingHeaders = sdk.http('https://synthetic.invalid', options({ timeoutMs: 20, headers: async () => new Promise(() => {}) }));
  await assert.rejects(call(hangingHeaders), { code: 'TIMEOUT' });
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = call(timeoutTransport, controller.signal);
  controller.abort(new Error('private-abort-reason'));
  await assert.rejects(pending, error => error.code === 'ABORTED' && !error.message.includes('private'));
});

test('body byte limits and UTF-8 validation apply to actual stream bytes and release the reader', async (t) => {
  let cancelled = 0;
  let mode = 'large';
  mockFetch(t, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(mode === 'large' ? new Uint8Array(65) : new Uint8Array([0xff])); },
    cancel() { cancelled++; },
  })));
  const transport = sdk.http('https://synthetic.invalid', options({ maxResponseBytes: 64, timeoutMs: 30 }));
  await assert.rejects(call(transport), { code: 'RESOURCE_LIMIT' });
  mode = 'invalid';
  await assert.rejects(call(transport), { code: 'PROTOCOL_MISMATCH' });
  assert.equal(cancelled, 2);
});

test('isolated HTTP server exercises real serialization, streaming, precision and abort', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    requests.push(body);
    if (body.params[0] === 'stall') { res.writeHead(200); res.write('{'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(`{"jsonrpc":"2.0","id":${JSON.stringify(body.id)},"result":{"value":`);
    res.end('9007199254740993}}');
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip(`Loopback denied (${error.code}); coordinator: node --test --test-name-pattern="isolated HTTP" tests/sdk/http.test.mjs`);
      return;
    }
    throw error;
  }
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const transport = sdk.http(`http://127.0.0.1:${server.address().port}`, options({ timeoutMs: 200 }));
  assert.equal((await call(transport)).value.text, '9007199254740993');
  await assert.rejects(internal.readRpc(transport, 'getblockchaininfo', ['stall']), { code: 'TIMEOUT' });
  assert.equal(requests.length, 2);
});
