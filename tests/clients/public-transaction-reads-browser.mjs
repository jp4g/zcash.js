// Uses the existing public-block browser runner's process/session cleanup lifecycle.
import { fixture, result, blockOne, transportOptions } from './public-chain-reads-fixtures.mjs';

export async function runBrowser() {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const rejects = async (promise, code, label) => {
    try { await promise; } catch (error) { check(error.code === code, `${label}: ${error.code}`); return; }
    throw Error(`${label}: expected ${code}`);
  };
  const { getTransaction } = await import('/src/clients/public-transaction-reads.js');
  const { http } = await import('/src/http.js');
  const { initialize } = await import('/packet/network.mjs');
  initialize(new Uint8Array(await (await fetch('/packet/bindings_bg.wasm')).arrayBuffer()));
  const { decodeTransaction } = await import('/packet/transaction.mjs');
  const vectors = await (await fetch('/vectors.json')).json();
  const source = (mode, options = {}) => ({ sourceId: 'fixture',
    transport: http(`${location.origin}/rpc/${mode}`, { ...transportOptions, ...options }) });
  const context = v => ({ txid: v.display, decodeTransaction: raw => decodeTransaction(raw, v.branch) });
  for (const v of vectors) {
    const value = await getTransaction(source('mempool'), context(v), { txid: v.display });
    check(value.observation.state === 'mempool' && value.txid === v.display, 'native transaction mempool');
    check(Array.from(value.raw, b => b.toString(16).padStart(2, '0')).join('') === v.hex, 'exact native bytes');
  }
  const v = vectors[0];
  for (const [mode, state] of [['mined', 'mined'], ['offMainChain', 'offMainChain'], ['changed', 'unknown']]) {
    const value = await getTransaction(source(mode), context(v), { txid: v.display, signal: new AbortController().signal });
    check(value.observation.state === state, mode);
    check(mode === 'mined' ? value.observation.inclusion?.blockHash === blockOne.verbose.hash
      && value.observation.inclusion.height === 1 && value.observation.inclusion.confirmations === null
      : value.observation.inclusion === null, `${mode} inclusion`);
  }
  await rejects(getTransaction(source('bad-dto'), context(v), { txid: v.display }), 'PROTOCOL_MISMATCH', 'DTO identity');
  for (const change of [{ display: 'ab'.repeat(32) }, { txid: new Uint8Array(32) }, { bytes: new Uint8Array([0]) }]) {
    await rejects(getTransaction(source('bad-decode'), { ...context(v),
      decodeTransaction: raw => ({ ...decodeTransaction(raw, v.branch), ...change }) },
    { txid: v.display }), 'PROTOCOL_MISMATCH', 'decoder identity');
  }
  for (let stage = 0; stage < 4; stage++) {
    const controller = new AbortController(); let admitted = 0;
    controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
    await rejects(getTransaction(source(`cancel-${stage}`, { headers() {
      if (admitted++ === stage) controller.abort(); return {};
    } }), context(v), { txid: v.display, signal: controller.signal }), 'ABORTED', `nested cancellation ${stage}`);
  }
  const controller = new AbortController();
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const pending = rejects(getTransaction(source('inflight'), context(v),
    { txid: v.display, signal: controller.signal }), 'ABORTED', 'in-flight cancellation');
  const deadline = Date.now() + 3000;
  while (!(await (await fetch('/state')).json()).inflight) {
    if (Date.now() >= deadline) throw Error('in-flight fixture deadline');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  controller.signal.dispatchEvent(new Event('abort'));
  check(!controller.signal.aborted, 'synthetic event leaves native state active');
  controller.abort(); await pending;
  return { checks, userAgent: navigator.userAgent };
}

if (typeof process !== 'undefined' && process.versions?.node) {
  const { default: assert } = await import('node:assert/strict');
  const { spawn } = await import('node:child_process');
  const { readFile, writeFile, mkdir, mkdtemp } = await import('node:fs/promises');
  const { firefoxOptions } = await import('../../qualification/browser-runtime/firefox-options.mjs');
  const { createHash } = await import('node:crypto');
  const build = process.env.PUBLIC_TRANSACTION_READS_BUILD ?? '/home/jack/zcash-public-transaction-scratch/implementation/dist';
  const logs = process.env.PUBLIC_TRANSACTION_READS_LOGS ?? '/home/jack/zcash-public-transaction-logs';
  const scratch = process.env.PUBLIC_TRANSACTION_READS_SCRATCH ?? '/home/jack/zcash-public-transaction-scratch';
  await mkdir(logs, { recursive: true }); await mkdir(scratch, { recursive: true });
  const runRoot = await mkdtemp(`${scratch}/firefox-`);
  const reportPath = `${logs}/${runRoot.split('/').at(-1)}.json`;
  const report = { status: 'failed', runRoot, build, sandbox: 'unchanged', started: new Date().toISOString() };
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), 90000);
  const onSignal = signal => { report.interruptedBy = signal; stop.abort(); };
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
    assert.ok(response.ok && !data.value?.error, JSON.stringify(data));
    return data.value;
  }
  try {
    report.sourceCommit = process.env.PUBLIC_TRANSACTION_READS_COMMIT ?? null;
    const { verifiedPacket } = await import('./public-transaction-reads-packet.mjs');
    const { files, vectors } = await verifiedPacket();
    const v = vectors[0];
    const assets = new Map([
      ['/', '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Public transaction fixture</title><script type="module" src="/entry.mjs"></script>'],
      ['/entry.mjs', "import { runBrowser } from '/public-transaction-reads-browser.mjs'; runBrowser().then(value => { window.transactionResult = { value }; }, error => { window.transactionResult = { error: String(error), stack: error.stack }; });"],
      ['/public-transaction-reads-browser.mjs', await readFile(new URL(import.meta.url))],
      ['/public-chain-reads-fixtures.mjs', await readFile(new URL('./public-chain-reads-fixtures.mjs', import.meta.url))],
    ]);
    for (const name of ['index', 'amounts', 'http', 'errors', 'json', 'primitives', 'clients/public-chain-reads', 'clients/public-block-reads', 'clients/public-transaction-reads']) {
      assets.set(`/src/${name}.js`, await readFile(`${build}/src/${name}.js`));
    }
    for (const [name, bytes] of files) assets.set(`/packet/${name}`, bytes);
    assets.set('/vectors.json', JSON.stringify(vectors));
    assets.set('/state', JSON.stringify({ inflight: false }));
    report.assets = Object.fromEntries([...assets].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
    for (const [name, bytes] of assets) {
      const path = `${runRoot}/assets${name === '/' ? '/index.html' : name}`;
      await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true }); await writeFile(path, bytes);
    }
    server = await fixture((call, req, res) => {
      assert.equal(call.jsonrpc, '2.0'); assert.equal(typeof call.id, 'string');
      const mode = req.url.split('/').at(-1);
      if (call.method === 'getrawtransaction') {
        const vector = vectors.find(item => item.display === call.params[0]);
        assert.ok(vector); assert.equal(call.params[1], 1);
        if (mode === 'inflight') {
          assets.set('/state', JSON.stringify({ inflight: true }));
          res.writeHead(200, { 'content-type': 'application/json' }); res.write('{');
          return;
        }
        const dto = { txid: vector.display, hex: vector.hex, in_active_chain: false };
        if (mode === 'offMainChain') Object.assign(dto, { blockhash: blockOne.verbose.hash, height: -1, confirmations: 0 });
        if (mode === 'mined' || mode === 'changed' || mode.startsWith('cancel-')) Object.assign(dto,
          { in_active_chain: true, blockhash: mode === 'changed' ? 'ab'.repeat(32) : blockOne.verbose.hash, height: 1, confirmations: 1 });
        if (mode === 'bad-dto') dto.txid = 'ab'.repeat(32);
        return result(dto);
      }
      if (call.method === 'getblock') {
        assert.deepEqual(call.params, ['1', 1]);
        return result({ ...blockOne.verbose, nTx: 1, tx: [v.display] });
      }
      assert.equal(call.method, 'getblockheader');
      assert.equal(call.params[0], blockOne.verbose.hash);
      return result(call.params[1] ? blockOne.verbose : blockOne.raw);
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
    report.endpoint = endpoint;
    stop.signal.throwIfAborted();
    await request(`/session/${session}/timeouts`, 'POST', { script: 20000, pageLoad: 15000, implicit: 0 });
    await request(`/session/${session}/url`, 'POST', { url: server.origin });
    let answer;
    const resultDeadline = Date.now() + 45000;
    while (!answer) {
      stop.signal.throwIfAborted(); assert.ok(Date.now() < resultDeadline, 'page result deadline');
      answer = await request(`/session/${session}/execute/sync`, 'POST', { script: 'return window.transactionResult || null;', args: [] });
      if (!answer) await pause(50);
    }
    assert.ok(!answer.error, JSON.stringify(answer));
    report.browserResult = answer.value;
    assert.deepEqual(server.unexpected, []);
    for (const [mode, count] of Object.entries({ mempool: vectors.length, mined: 4,
      offMainChain: 1, changed: 4, 'bad-dto': 1, 'bad-decode': 3, inflight: 1 })) {
      assert.equal(server.calls.filter(call => call.path.endsWith(`/${mode}`)).length, count, mode);
    }
    for (let stage = 0; stage < 4; stage++) {
      assert.equal(server.calls.filter(call => call.path.endsWith(`/cancel-${stage}`)).length, stage);
    }
    report.status = 'passed';
  } catch (error) { if (report.interruptedBy) report.status = 'interrupted'; report.error = { code: error.code, message: String(error), stack: error.stack }; }
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
