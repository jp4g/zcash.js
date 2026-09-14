// Exact runner source, injected OS boundaries only; these are not browser acceptance tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = await readFile(new URL('./grpc-web-browser.mjs', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function probe(mode) {
  const writes = new Map([['/historical/firefox.json', '{"ok":true}']]);
  const proc = new EventEmitter();
  Object.assign(proc, { pid: 900, env: {}, versions: process.versions, exitCode: 0 });
  proc.exit = code => { proc.exitCode = code; if (process.env.LIFECYCLE_CHILD_RECEIPT) process.exit(code); };
  let closed = 0, alive = true, served, spawnCount = 0, browserAlive = false, descendantAlive = false;
  let receiptBeforeAcquisition = false;
  const late = mode === 'late-session' || mode === 'lost-session' || mode.startsWith('profile-chain');
  const killed = [];
  proc.kill = (pid, signal) => {
    assert.ok(pid === -123 || pid === 124 || pid === 125, 'never kill unrelated or older profile processes'); killed.push([pid, signal]);
    if (pid === 125) { descendantAlive = false; return; }
    if (pid === 124 && mode === 'profile-chain-kill-error') throw Error('injected root kill failure');
    if (pid === 124) { browserAlive = false; return; }
    if (mode === 'group-kill-fails' && signal) throw Error('injected group kill');
    if (!alive) throw Object.assign(Error('gone'), { code: 'ESRCH' });
    if (signal) alive = false;
  };
  const read = path => {
    if (mode.startsWith('profile-chain') && String(path).includes('/127/') && String(path).endsWith('/cmdline')) return 'firefox\0-profile\0/owned/run/profile\0';
    if (String(path).endsWith('/cmdline')) return browserAlive && String(path).includes('/124/') ? 'firefox\0-profile\0/owned/run/profile\0' : 'driver\0';
    if (String(path).startsWith('/proc/')) {
      const pid = Number(String(path).split('/')[2]);
      if (mode.startsWith('profile-chain') && ((pid === 125 && descendantAlive) || pid === 126 || pid === 127)) {
        const fields = Array(22).fill('0'); fields[0] = 'S'; fields[1] = pid === 125 ? '124' : '1';
        fields[2] = String(pid); fields[19] = pid === 127 ? '100' : '458';
        return `${pid} (mock process) ` + fields.join(' ');
      }
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
    readFileSync: read, writeFileSync: (p, b) => { writes.set(p, b); if (process.env.LIFECYCLE_CHILD_RECEIPT && p.endsWith('receipt.json')) writeFileSync(process.env.LIFECYCLE_CHILD_RECEIPT, b); }, readdirSync: () => [...(alive ? ['123'] : []), ...(browserAlive ? ['124'] : []), ...(mode.startsWith('profile-chain') ? [...(descendantAlive ? ['125'] : []), '126', '127'] : [])] };
  const deps = { fs, crypto, assert: { default: assert }, options: { firefoxOptions: () => ({ args: ['-headless'] }) }, child: {
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
      closed++; if (mode === 'close-hang') { if (process.env.LIFECYCLE_CHILD_RECEIPT) setInterval(() => {}, 10000); return new Promise(() => {}); }
      if (mode === 'cleanup') throw Error('injected close');
    } };
    options.onCreate?.(owned);
    if (mode === 'listen') throw Error('injected listen');
    if (mode === 'listen-hang') return new Promise(() => {});
    return owned;
  };
  const fetch = async (_url, options) => {
    if (late && options.method === 'POST' && _url.endsWith('/session')) {
      browserAlive = true; descendantAlive = mode.startsWith('profile-chain');
      setTimeout(() => proc.emit('SIGINT'), 1);
      if (mode === 'lost-session') return new Promise(() => {});
      await new Promise(resolve => setTimeout(resolve, 60));
      return { ok: true, json: async () => ({ value: { sessionId: 'late', capabilities: { 'moz:processID': 124 } } }) };
    }
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
  deps.paths = { buildRoot: '/candidate/dist', outputRoot: '/candidate/.local/tests' };
  let runner = source.slice(source.indexOf('async function runFirefox()'), source.lastIndexOf("if (typeof window"));
  for (const [name, key] of [['node:fs/promises', 'fs'], ['node:fs', 'fs'], ['node:child_process', 'child'],
    ['node:crypto', 'crypto'], ['../support/paths.mjs', 'paths'], ['node:assert/strict', 'assert'], ['../support/firefox-options.mjs', 'options']]) {
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
  return { receiptBeforeAcquisition, finished, thrown, report: reports.at(-1), writes, closed, killed, spawnCount, served, proc, browserAlive, descendantAlive };
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
    assert.ok(!got.writes.has('/candidate/.local/tests/grpc-web-browser/logs/firefox.json'), 'no reusable success path');
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

for (const mode of ['late-session', 'lost-session']) test(`mock out-of-group browser before capabilities: ${mode}`, async () => {
  const got = await probe(mode);
  assert.equal(got.finished, true);
  assert.equal(got.browserAlive, false, 'owned browser must be discovered even without a response');
  assert.equal(got.report.cleanup.browserGone, true);
  assert.ok(got.report.identities.browserRoots.some(id => id.pid === 124));
  assert.match(got.report.error, /SIGINT/);
});

test('mock failed teardown with real retained handle exits child CLI after failed receipt', () => {
  const receipt = mkdtempSync(join(tmpdir(), 'grpc-web-liveness-')) + '/receipt.json';
  const prefix = readFileSync(new URL(import.meta.url), 'utf8').split("for (const mode of ['asset'")[0]
    .replace("new URL('./grpc-web-browser.mjs', import.meta.url)", JSON.stringify(new URL('./grpc-web-browser.mjs', import.meta.url).pathname));
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', prefix + "\nconst got = await probe('close-hang'); process.exitCode = got.proc.exitCode;"],
    { env: { ...process.env, LIFECYCLE_CHILD_RECEIPT: receipt }, timeout: 2000, stdio: 'inherit' });
  assert.equal(child.error, undefined, 'actual CLI must exit before outer timeout');
  assert.equal(child.status, 1);
  assert.equal(child.signal, null);
  const report = JSON.parse(readFileSync(receipt, 'utf8'));
  assert.equal(report.ok, false);
  assert.equal(report.cleanup.serverClosed, false);
  assert.equal(report.cleanup.driverGroupGone, true);
  assert.ok(report.finished);
  assert.match(report.cleanup.errors.join(), /cleanup timeout/);
});

test('mock profile root owns out-of-group descendants but excludes unrelated and older processes', async () => {
  const got = await probe('profile-chain');
  assert.equal(got.browserAlive, false);
  assert.equal(got.descendantAlive, false);
  assert.deepEqual(got.report.identities.browserMembers.map(id => id.pid).sort(), [124, 125]);
  assert.ok(got.killed.some(([pid]) => pid === 125));
});

test('unobserved interrupted acquisition cannot claim browser gone', async () => {
  const got = await probe('SIGINT');
  assert.equal(got.report.cleanup.browserGone, false);
  assert.match(got.report.cleanup.errors.join(), /ownership unobserved/);
});

test('mock failed root kill still attempts owned descendant teardown', async () => {
  const got = await probe('profile-chain-kill-error');
  assert.equal(got.descendantAlive, false);
  assert.equal(got.report.cleanup.browserGone, false);
  assert.match(got.report.cleanup.errors.join(), /injected root kill failure/);
});
