// Exact runner source, injected OS boundaries only; these are not browser acceptance tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
const source = await readFile(new URL('./grpc-web-browser.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function probe(mode) {
  const writes = new Map([['/historical/firefox.json', '{"ok":true}']]);
  const proc = new EventEmitter();
  Object.assign(proc, { pid: 900, env: {}, versions: process.versions, exitCode: 0 });
  let closed = 0, alive = true, served, spawnCount = 0, browserAlive = false;
  let receiptBeforeAcquisition = false;
  const killed = [];
  proc.kill = (pid, signal) => {
    assert.ok(pid === -123 || pid === 124); killed.push([pid, signal]);
    if (pid === 124) { browserAlive = false; return; }
    if (mode === 'group-kill-fails' && signal) throw Error('injected group kill');
    if (!alive) throw Object.assign(Error('gone'), { code: 'ESRCH' });
    if (signal) alive = false;
  };
  const read = path => {
    if (String(path).startsWith('/proc/')) {
      if (String(path).includes('/124/') && browserAlive) {
        const fields = Array(22).fill('0'); fields[0] = 'S'; fields[2] = '124'; fields[19] = '457';
        return '124 (browser) ' + fields.join(' ');
      }
      if (!alive || !String(path).includes('/123/')) throw Object.assign(Error('gone'), { code: 'ENOENT' });
      const fields = Array(22).fill('0'); fields[0] = 'S'; fields[2] = '123'; fields[19] = '456';
      return '123 (driver) ' + fields.join(' ');
    }
    receiptBeforeAcquisition ||= [...writes].some(([p, b]) => p !== '/historical/firefox.json' && p.endsWith('.json') && JSON.parse(b).ok === false);
    if (mode === 'asset') throw Error('injected asset');
    return Buffer.from('asset');
  };
  const fs = { mkdir: async () => {}, mkdtemp: async () => '/owned/run', readFile: async p => read(p),
    writeFile: async (p, b) => writes.set(p, b), mkdirSync() {}, mkdtempSync: () => '/owned/run',
    readFileSync: read, writeFileSync: (p, b) => writes.set(p, b), readdirSync: () => alive ? ['123'] : [] };
  const deps = { fs, crypto, assert: { default: assert }, options: { firefoxOptions: () => ({}) }, child: {
    spawn() {
      spawnCount++;
      if (mode === 'spawn') throw Error('injected spawn');
      const child = new EventEmitter(); child.pid = 123;
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      if (mode === 'spawn-error') setTimeout(() => child.emit('error', Error('injected spawn error')), 1);
      if (mode !== 'startup') setTimeout(() => child.stdout.emit('data', 'Listening on 127.0.0.1:1234'), 1);
      return child;
    },
  } };
  const fixture = async (assets, options = {}) => {
    served = assets;
    const owned = { origin: 'http://fixture', requests: [], closed: [], async close() {
      closed++; if (mode === 'close-hang') return new Promise(() => {});
      if (mode === 'cleanup') throw Error('injected close');
    } };
    options.onCreate?.(owned);
    if (mode === 'listen') throw Error('injected listen');
    if (mode === 'listen-hang') return new Promise(() => {});
    return owned;
  };
  const fetch = async (_url, options) => {
    if (['delete-hang', 'group-kill-fails'].includes(mode)) {
      let value = {};
      if (_url.endsWith('/session')) { browserAlive = true; value = { sessionId: 'owned', capabilities: { 'moz:processID': 124, browserVersion: 'test-only', 'moz:geckodriverVersion': 'test-only', acceptInsecureCerts: false } }; }
      if (_url.endsWith('/execute/sync')) {
        const body = JSON.parse(options.body);
        value = new Function('window', body.script)({ grpcWebResult: { ok: false, error: 'injected page' } });
      }
      if (options.method === 'DELETE') return new Promise(() => {});
      return { ok: true, json: async () => ({ value }) };
    }
    if (mode === 'SIGINT' || mode === 'SIGTERM') setTimeout(() => proc.emit(mode), 1);
    if (['session-hang', 'SIGINT', 'SIGTERM'].includes(mode)) return new Promise(() => {});
    throw Error('injected session');
  };
  let runner = source.slice(source.indexOf('async function runFirefox()'), source.lastIndexOf("if (typeof window"));
  for (const [name, key] of [['node:fs/promises', 'fs'], ['node:fs', 'fs'], ['node:child_process', 'child'],
    ['node:crypto', 'crypto'], ['node:assert/strict', 'assert'], ['../../qualification/browser-runtime/firefox-options.mjs', 'options']]) {
    runner = runner.replaceAll(`await import('${name}')`, `deps.${key}`);
  }
  runner = runner.replaceAll('import.meta.url', "'file:///candidate/tests/clients/grpc-web-browser.mjs'")
    .replaceAll('90000', '80').replaceAll('15000', '40').replaceAll('5000', '30').replaceAll('300)', '5)');
  let thrown;
  const running = new AsyncFunction('deps', 'process', 'serveFixtures', 'fetch', 'base64', 'frame', 'console',
    runner + '\nawait runFirefox();')(deps, proc, fixture, fetch, () => '', () => {}, { log() {}, error() {} })
    .catch(error => { thrown = error; });
  let timer;
  const finished = await Promise.race([running.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 400); })]);
  clearTimeout(timer);
  const reports = [...writes].filter(([p]) => p !== '/historical/firefox.json' && p.endsWith('.json')).map(([, b]) => JSON.parse(b));
  return { receiptBeforeAcquisition, finished, thrown, report: reports.at(-1), writes, closed, killed, spawnCount, served, proc };
}

for (const mode of ['asset', 'listen', 'listen-hang', 'spawn', 'startup', 'session-hang', 'SIGINT', 'SIGTERM', 'cleanup', 'close-hang', 'spawn-error', 'delete-hang', 'group-kill-fails']) {
  test(`fresh failure receipt and bounded independent cleanup: ${mode}`, async () => {
    const got = await probe(mode);
    assert.equal(got.receiptBeforeAcquisition, true, 'invalidate evidence before acquiring assets');
    assert.equal(got.finished, true, 'runner must finish despite pending acquisition');
    assert.equal(got.thrown, undefined, 'primary error must be recorded');
    assert.equal(got.report?.ok, false, 'current run failure receipt');
    assert.ok(got.report.run && got.report.started);
    assert.equal(got.writes.get('/historical/firefox.json'), '{"ok":true}', 'preserve historical evidence');
    assert.ok(!got.writes.has('/home/jack/zcash-grpc-web-logs/firefox.json'), 'no reusable success path');
    if (mode !== 'asset') assert.equal(got.closed, 1, 'close acquired fixture exactly once');
    if (!['asset', 'listen', 'listen-hang', 'spawn'].includes(mode)) assert.ok(got.killed.some(([pid, signal]) => pid === -123 && signal === 'SIGTERM'), 'kill owned detached group');
    if (['delete-hang', 'group-kill-fails'].includes(mode)) {
      assert.match(got.report.error, /injected page/);
      assert.ok(got.killed.some(([pid, signal]) => pid === 124 && signal === 'SIGTERM'), 'browser cleanup independent of group/session failure');
    }
    if (mode === 'cleanup') {
      assert.match(got.report.error, /injected session/);
      assert.match(JSON.stringify(got.report.cleanup), /injected close/);
    }
    assert.equal(got.proc.listenerCount('SIGINT'), 0);
    assert.equal(got.proc.listenerCount('SIGTERM'), 0);
  });
}

test('ordinary HTML module owns execution and receipt hashes all served bytes', async () => {
  const got = await probe('session');
  const html = got.served.get('/');
  assert.match(html, /<script type="module"/);
  // Exercise the served entry independently of WebDriver; it must invoke all checks.
  const entry = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(entry);
  const page = {};
  let checks = 0;
  await new AsyncFunction('window', 'browserChecks', entry.replace(/import .*?;\s*/, ''))(page, async () => { checks++; return { ok: true }; });
  assert.equal(checks, 1);
  assert.equal(page.grpcWebResult.ok, true);
  for (const [path, bytes] of got.served) assert.equal(got.report.assets[path], crypto.createHash('sha256').update(bytes).digest('hex'));
});

const fixtureSource = await readFile(new URL('./grpc-web-fixtures.mjs', import.meta.url), 'utf8');
const loadFixture = new AsyncFunction('http', fixtureSource.replaceAll('export ', '').replace("await import('node:http')", 'await http') + '\nreturn serveFixtures;');
for (const mode of ['throw', 'hang', 'preaborted']) {
  test(`fixture ownership before listen and idempotent close: ${mode}`, async () => {
    let owned, creates = 0, closes = 0, release;
    const server = new EventEmitter();
    server.listen = () => { if (mode === 'throw') throw Error('listen failure'); };
    server.closeAllConnections = () => {};
    server.close = callback => { closes++; callback(Object.assign(Error('not running'), { code: 'ERR_SERVER_NOT_RUNNING' })); };
    const serve = await loadFixture(new Promise(resolve => { release = () => resolve({ createServer() { creates++; return server; } }); }));
    const controller = new AbortController();
    const pending = serve(new Map(), { signal: controller.signal, onCreate: value => { owned = value; } });
    const rejected = assert.rejects(pending, /listen failure|interrupted/);
    if (mode === 'preaborted') controller.abort(Error('interrupted import'));
    release();
    await new Promise(resolve => setImmediate(resolve));
    if (mode === 'hang') controller.abort(Error('interrupted listen'));
    await rejected;
    if (mode === 'preaborted') assert.equal(creates, 0, 'no late server acquisition after run ends');
    else { assert.ok(owned); await Promise.all([owned.close(), owned.close()]); assert.equal(closes, 1); }
  });
}
