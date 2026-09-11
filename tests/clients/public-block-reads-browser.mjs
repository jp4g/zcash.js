#!/usr/bin/env node
// Page-owned module entry; WebDriver only navigates and reads the final result.
import { fixture, result, sourceId, blockOne, transportOptions } from './public-chain-reads-fixtures.mjs';
const txids = ['851bf6fbf7a976327817c738c489d7fa657752445430922d94c983c0b9ed4609'];
const block = { ...blockOne.verbose, nTx: 1, tx: txids };

export async function runBrowser() {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const rejects = async (promise, code) => {
    try { await promise; } catch (error) {
      check(error.code === code, code);
      check(!/private-fixture|127\.0\.0\.1/.test(error.message + JSON.stringify(error)), 'sanitized'); return;
    }
    throw Error(`expected ${code}`);
  };
  const eager = { fetch: 0, Worker: 0, WebAssembly: 0 };
  const originals = { fetch, Worker, WebAssembly };
  const forbidden = name => () => { eager[name]++; throw Error(`unexpected ${name}`); };
  globalThis.fetch = forbidden('fetch'); globalThis.Worker = forbidden('Worker');
  globalThis.WebAssembly = new Proxy(WebAssembly, { get() { return forbidden('WebAssembly'); } });
  try {
    const { getBlock } = await import('/src/clients/public-block-reads.js');
    const root = await import('/src/index.js');
    check(!('getBlock' in root) && !('createPublicClient' in root), 'internal only');
    check(Object.values(eager).every(n => n === 0), 'lazy imports');
    globalThis.fetch = originals.fetch;
    const context = (mode, options = {}) => ({ sourceId,
      transport: root.http(`${location.origin}/rpc/${mode}`, { ...transportOptions, ...options }) });
    const value = await getBlock(context('good'), { height: 1 });
    check(value.point.height === 1 && value.point.hash === block.hash && value.time === block.time
      && value.previousHash === block.previousblockhash && value.sourceId === sourceId, 'coherent block');
    check(new Date(value.observedAt).toISOString() === value.observedAt, 'timestamp');
    check(Array.from(value.raw, b => b.toString(16).padStart(2, '0')).join('') === blockOne.raw, 'exact raw header');
    check(value.txids.length === 1 && value.txids[0] === txids[0], 'ordered txids');
    check(Object.isFrozen(value) && Object.isFrozen(value.point) && Object.isFrozen(value.txids), 'frozen records');
    value.raw.fill(0);
    const again = await getBlock(context('good'), { hash: block.hash });
    check(again.raw[0] === 4 && again.raw.buffer !== value.raw.buffer && again.txids !== value.txids, 'owned arrays');
    let source, selector;
    source = context('mutation', { headers() { source.transport = {}; source.sourceId = 'changed'; selector.height = 2; return {}; } });
    selector = { height: 1 };
    check((await getBlock(source, selector)).sourceId === sourceId, 'input snapshot');
    for (const mode of ['null', 'bad-number', 'bad-tx', 'bad-count', 'bad-hash', 'bad-height', 'bad-parent', 'bad-time', 'header-height', 'header-hash', 'bad-raw']) {
      await rejects(getBlock(context(mode), { height: 1 }), 'PROTOCOL_MISMATCH');
    }
    await rejects(getBlock(context('invalid'), { height: 1, hash: block.hash }), 'INVALID_ARGUMENT');
    const pre = new AbortController(); pre.abort();
    await rejects(getBlock(context('invalid'), { height: 1, signal: pre.signal }), 'ABORTED');
    for (const stage of [0, 1, 2]) {
      await rejects(getBlock(context(`unsupported-${stage}`), { height: 1 }), 'METHOD_NOT_SUPPORTED');
      await rejects(getBlock(context(`unknown-${stage}`), { height: 1 }), 'TRANSPORT_ERROR');
      await rejects(getBlock(context(`oversize-${stage}`), { height: 1 }), 'RESOURCE_LIMIT');
      await rejects(getBlock(context(`timeout-${stage}`, { timeoutMs: 100 }), { height: 1 }), 'TIMEOUT');
      const controller = new AbortController();
      const pending = rejects(getBlock(context(`abort-${stage}`), { height: 1, signal: controller.signal }), 'ABORTED');
      const until = Date.now() + 3000;
      while (!(await (await fetch('/state')).json())[`abort-${stage}`]) {
        if (Date.now() > until) throw Error('abort fixture deadline');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      controller.abort(); await pending;
      const callbackAbort = new AbortController(); let count = 0;
      const args = { height: 1, signal: callbackAbort.signal };
      const fromCallback = context(`callback-${stage}`, { headers() {
        args.signal = new AbortController().signal;
        if (count++ === stage) callbackAbort.abort(); return {};
      } });
      await rejects(getBlock(fromCallback, args), 'ABORTED');
    }
    check(eager.Worker === 0 && eager.WebAssembly === 0, 'no worker or WASM');
    check(typeof crypto.subtle.digest === 'function', 'native Web Crypto');
    return { checks, eager, userAgent: navigator.userAgent };
  } finally { Object.assign(globalThis, originals); }
}

if (typeof process !== 'undefined' && process.versions?.node) {
  const { default: assert } = await import('node:assert/strict');
  const { spawn } = await import('node:child_process');
  const { readFile, writeFile, mkdir, mkdtemp } = await import('node:fs/promises');
  const { firefoxOptions } = await import('../../qualification/browser-runtime/firefox-options.mjs');
  const { createHash } = await import('node:crypto');
  const build = process.env.PUBLIC_BLOCK_READS_BUILD ?? '/home/jack/zcash-public-block-scratch/dist';
  const logs = process.env.PUBLIC_BLOCK_LOGS ?? '/home/jack/zcash-public-block-logs';
  const scratch = '/home/jack/zcash-public-block-scratch';
  await mkdir(logs, { recursive: true }); await mkdir(scratch, { recursive: true });
  const runRoot = await mkdtemp(`${scratch}/firefox-`);
  const reportPath = `${logs}/${runRoot.split('/').at(-1)}.json`;
  const report = { status: 'failed', runRoot, build, sandbox: 'unchanged', started: new Date().toISOString() };
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), 90000);
  const onSignal = () => stop.abort();
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let server, driver, driverIdentity, browserIdentity, session, endpoint, driverError, text = '';
  async function identity(pid) {
    try { const stat = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ').at(-1).split(' ');
      return { pid, start: stat[19], state: stat[0] }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function request(route, method = 'GET', body, cleanup = false) {
    const response = await fetch(endpoint + route, { method, headers: { 'content-type': 'application/json' },
      signal: cleanup ? AbortSignal.timeout(5000) : AbortSignal.any([stop.signal, AbortSignal.timeout(30000)]),
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.ok(response.ok && !data.value?.error, JSON.stringify(data)); return data.value;
  }
  try {
    report.sourceCommit = process.env.PUBLIC_BLOCK_COMMIT ?? null;
    report.sourcePin = '1e36d1bb6a8a9778a1bd316704b9c8cb75182de6';
    const snapshotPath = process.env.PUBLIC_BLOCK_SNAPSHOT ?? '/tmp/zakura-upstream-review/crates/zakura-rpc/src/methods/tests/snapshots/get_block_verbose_height_verbosity_1@mainnet_10.snap';
    const snapshot = await readFile(snapshotPath, 'utf8');
    report.snapshotSha256 = createHash('sha256').update(snapshot).digest('hex');
    assert.equal(report.snapshotSha256, 'e35a7ba66c2f581cd9654c06d87bedae8db0f8b30942b427b1d774f0616e57fe');
    const assets = new Map([
      ['/', '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Public block fixture</title><script type="module" src="/entry.mjs"></script>'],
      ['/entry.mjs', "import { runBrowser } from '/public-block-reads-browser.mjs'; runBrowser().then(value => { window.blockResult = { value }; }, error => { window.blockResult = { error: String(error), stack: error.stack }; });"],
      ['/public-block-reads-browser.mjs', await readFile(new URL(import.meta.url))],
      ['/public-chain-reads-fixtures.mjs', await readFile(new URL('./public-chain-reads-fixtures.mjs', import.meta.url))],
    ]);
    for (const name of ['index', 'amounts', 'http', 'errors', 'json', 'primitives', 'clients/public-chain-reads', 'clients/public-block-reads']) {
      assets.set(`/src/${name}.js`, await readFile(`${build}/src/${name}.js`));
    }
    const state = {};
    assets.set('/state', JSON.stringify(state));
    report.assets = Object.fromEntries([...assets].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
    for (const [name, bytes] of assets) {
      const path = `${runRoot}/assets${name === '/' ? '/index.html' : name}`;
      await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true }); await writeFile(path, bytes);
    }
    server = await fixture((call, req, res) => {
      assert.equal(call.jsonrpc, '2.0'); assert.equal(typeof call.id, 'string');
      const mode = req.url.split('/').at(-1);
      assert.notEqual(mode, 'invalid');
      const stage = call.method === 'getblock' ? 0 : call.params[1] === true ? 1 : 2;
      assert.equal(call.method, stage === 0 ? 'getblock' : 'getblockheader');
      if (stage === 0) {
        assert.ok(['1', block.hash].includes(call.params[0])); assert.equal(call.params[1], 1);
      } else assert.deepEqual(call.params, [block.hash, stage === 1]);
      if (mode === `unsupported-${stage}` || mode === `unknown-${stage}`) {
        return `"error":{"code":${mode.startsWith('unsupported') ? -32601 : -8},"message":"private-fixture","data":"private-fixture"}`;
      }
      if (mode === `oversize-${stage}`) return result('x'.repeat(17000));
      if (mode === `timeout-${stage}` || mode === `abort-${stage}`) {
        state[mode] = true; assets.set('/state', JSON.stringify(state));
        res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); return;
      }
      if (stage === 2) return result(mode === 'bad-raw' ? '00' : blockOne.raw);
      const verbose = { ...(stage === 0 ? block : blockOne.verbose) };
      if (stage === 0) {
        if (mode === 'good') return '"result":' + snapshot.split('---\n').at(-1);
        if (mode === 'null') return result(null);
        if (mode === 'bad-number') return '"result":' + JSON.stringify(verbose).replace('"height":1', '"height":1.0');
        if (mode === 'bad-tx') verbose.tx = [{ txid: txids[0] }];
        if (mode === 'bad-count') verbose.nTx = 2;
        if (mode === 'bad-hash') verbose.hash = 'ab'.repeat(32);
        if (mode === 'bad-height') verbose.height = 2;
        if (mode === 'bad-parent') verbose.previousblockhash = 'ab'.repeat(32);
        if (mode === 'bad-time') verbose.time++;
      } else {
        if (mode === 'header-height') verbose.height = 2;
        if (mode === 'header-hash') verbose.hash = 'ab'.repeat(32);
      }
      return result(verbose);
    }, assets);
    report.origin = server.origin;
    const args = ['--host', '127.0.0.1', '--port', '0', '--websocket-port', '0', '--profile-root', runRoot];
    driver = spawn('/snap/bin/geckodriver', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    driver.on('error', error => { driverError = error; });
    driver.on('exit', (code, signal) => { driverError = Error(`driver exit ${code}/${signal}`); });
    driverIdentity = await identity(driver.pid);
    for (const stream of [driver.stdout, driver.stderr]) stream.on('data', chunk => { text += chunk; });
    const until = Date.now() + 15000;
    while (!endpoint) {
      stop.signal.throwIfAborted(); if (driverError) throw driverError;
      const match = text.match(/Listening on 127\.0\.0\.1:(\d+)/);
      if (match) endpoint = `http://127.0.0.1:${match[1]}`;
      else { assert.ok(Date.now() < until, 'driver startup deadline'); await pause(30); }
    }
    const value = await request('/session', 'POST', { capabilities: { alwaysMatch: {
      browserName: 'firefox', acceptInsecureCerts: false, 'moz:firefoxOptions': firefoxOptions() } } });
    session = value.sessionId; report.capabilities = value.capabilities;
    assert.equal(value.capabilities.browserName, 'firefox');
    assert.equal(value.capabilities.acceptInsecureCerts, false);
    browserIdentity = await identity(value.capabilities['moz:processID']);
    assert.ok(session && driverIdentity && browserIdentity);
    report.processIdentities = { driver: driverIdentity, browser: browserIdentity };
    await request(`/session/${session}/timeouts`, 'POST', { script: 20000, pageLoad: 15000, implicit: 0 });
    await request(`/session/${session}/url`, 'POST', { url: server.origin });
    let answer;
    const resultDeadline = Date.now() + 45000;
    while (!answer) {
      stop.signal.throwIfAborted(); assert.ok(Date.now() < resultDeadline, 'page result deadline');
      answer = await request(`/session/${session}/execute/sync`, 'POST', { script: 'return window.blockResult || null;', args: [] });
      if (!answer) await pause(50);
    }
    assert.ok(!answer.error, JSON.stringify(answer));
    report.browserResult = answer.value;
    assert.deepEqual(answer.value.eager, { fetch: 0, Worker: 0, WebAssembly: 0 });
    assert.deepEqual(server.unexpected, []);
    assert.deepEqual(server.calls.filter(c => c.path.endsWith('/good')).map(c => [c.method, c.params]), [
      ['getblock', ['1', 1]], ['getblockheader', [block.hash, true]], ['getblockheader', [block.hash, false]],
      ['getblock', [block.hash, 1]], ['getblockheader', [block.hash, true]], ['getblockheader', [block.hash, false]],
    ]);
    for (const stage of [0, 1, 2]) {
      for (const mode of ['unsupported', 'unknown', 'oversize', 'timeout', 'abort', 'callback']) {
        assert.equal(server.calls.filter(c => c.path.endsWith(`/${mode}-${stage}`)).length, stage + (mode === 'callback' ? 0 : 1));
      }
    }
    report.status = 'passed';
  } catch (error) { report.error = { code: error.code, message: String(error), stack: error.stack }; }
  finally {
    clearTimeout(deadline);
    const errors = []; let sessionDeleted = !session, groupGone = !driverIdentity;
    if (session) try { await request(`/session/${session}`, 'DELETE', undefined, true); sessionDeleted = true; }
    catch (error) { errors.push(String(error)); }
    if (driverIdentity) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const current = await identity(driverIdentity.pid);
        if (!current || current.start === driverIdentity.start) {
          try { process.kill(-driverIdentity.pid, signal); }
          catch (error) { if (error.code !== 'ESRCH') errors.push(String(error)); }
        } else { errors.push('driver PID reused; refusing group cleanup'); break; }
        await pause(200);
      }
      const cleanupUntil = Date.now() + 3000;
      while (!groupGone && Date.now() < cleanupUntil) {
        try { process.kill(-driverIdentity.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') groupGone = true; else { errors.push(String(error)); break; } }
        if (!groupGone) await pause(30);
      }
    }
    if (server) { report.requests = server.calls; report.unexpected = server.unexpected; await server.close(); }
    const browser = browserIdentity && await identity(browserIdentity.pid);
    const browserGone = !browser || browser.start !== browserIdentity.start || browser.state === 'Z';
    report.cleanup = { sessionDeleted, groupGone, browserGone, serverClosed: true, errors };
    if (!sessionDeleted || !groupGone || !browserGone || errors.length) report.status = 'failed';
    report.finished = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    await writeFile(reportPath + '.driver.log', text);
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    console.log(JSON.stringify({ status: report.status, reportPath, error: report.error }));
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
}
