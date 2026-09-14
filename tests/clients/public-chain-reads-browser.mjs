#!/usr/bin/env node
// Run directly with Node; this same module's runBrowser() executes in installed Firefox.
import { fixture, result, sourceId, hashA, hashB, genesis, regtestGenesis, blockOne, transportOptions } from './public-chain-reads-fixtures.mjs';

export async function runBrowser() {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const rejects = async (promise, code) => {
    try { await promise; } catch (error) { check(error.code === code, code); return; }
    throw Error(`expected ${code}`);
  };
  const eager = { fetch: 0, Worker: 0, WebAssembly: 0 };
  const originals = { fetch, Worker, WebAssembly };
  const forbidden = name => () => { eager[name]++; throw Error(`unexpected ${name}`); };
  globalThis.fetch = forbidden('fetch'); globalThis.Worker = forbidden('Worker');
  globalThis.WebAssembly = new Proxy(WebAssembly, { get() { return forbidden('WebAssembly'); } });
  let api, http;
  try {
    api = await import('/src/clients/public-chain-reads.js');
    const root = await import('/src/index.js'); http = root.http;
    check(!('getTip' in root) && !('getBlockHeader' in root) && typeof root.createPublicClient === 'function', 'internal exports only');
    check(Object.values(eager).every(n => n === 0), 'imports are lazy');
    globalThis.fetch = originals.fetch;
    const context = (mode, timeoutMs = 1000) => ({ sourceId,
      transport: http(`${location.origin}/rpc/${mode}`, { ...transportOptions, timeoutMs }) });
    const { isZcashError } = await import('/src/errors.js');
    for (const method of [api.getTip, api.getBlockHeader]) {
      const source = context(method === api.getTip ? 'good' : 'genesis');
      const options = method === api.getTip ? { signal: undefined } : { height: 0 };
      let reads = 0, gets = 0;
      const snapshot = new Proxy(source, {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'sourceId' && ++reads > 1) descriptor.value = { private: 'private-sentinel' };
          return descriptor;
        },
        get() { gets++; throw Error('private-sentinel'); },
      });
      const observed = await method(snapshot, new Proxy(options, {
        get() { gets++; throw Error('private-sentinel'); },
      }));
      check(observed.sourceId === sourceId && reads === 1 && gets === 0, method.name + ' descriptor snapshot');
      const invalid = async promise => {
        try { await promise; } catch (error) {
          check(isZcashError(error) && error.code === 'INVALID_ARGUMENT'
            && error.message === 'Invalid argument.' && error.cause === undefined
            && !String(error.stack).includes('private-sentinel'), 'sanitized admission');
          return;
        }
        throw Error('expected invalid admission');
      };
      for (const location of ['source', 'options']) {
        for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor', 'revoked']) {
          const target = location === 'source' ? source : options;
          const revocable = Proxy.revocable(target, trap === 'revoked' ? {} : {
            [trap]() { throw Error('private-sentinel'); },
          });
          if (trap === 'revoked') revocable.revoke();
          await invalid(method(location === 'source' ? revocable.proxy : source,
            location === 'options' ? revocable.proxy : options));
        }
      }
      const invoke = signal => method(source, { ...options, signal });
      for (const mode of ['plain', 'overrides', 'mutated', 'abort']) {
        const controller = new AbortController();
        const poison = () => { throw Error('private-sentinel'); };
        const mutate = () => {
          for (const key of ['aborted', 'addEventListener', 'removeEventListener']) {
            Object.defineProperty(controller.signal, key, { configurable: true, get: poison });
          }
        };
        if (mode === 'overrides') mutate();
        const lifetimeSource = { sourceId, transport: http(`${location.origin}/rpc/${method === api.getTip ? 'good' : 'genesis'}`, {
          ...transportOptions, headers: async () => {
            await Promise.resolve();
            if (mode === 'mutated' || mode === 'abort') mutate();
            if (mode === 'abort') controller.abort();
            return {};
          },
        }) };
        try {
          await method(lifetimeSource, { ...options, signal: controller.signal });
          check(mode !== 'abort', method.name + ' native lifetime ' + mode);
        } catch (error) {
          check(mode === 'abort' && isZcashError(error) && error.code === 'ABORTED', method.name + ' native lifetime abort');
        }
      }
      await invalid(invoke(new Proxy(new AbortController().signal, {})));
      await invalid(invoke(Object.create(AbortSignal.prototype, {
        aborted: { value: false }, addEventListener: { value() {} }, removeEventListener: { value() {} },
      })));
      for (const trap of ['getPrototypeOf', 'get', 'revoked']) {
        const revocable = Proxy.revocable(new AbortController().signal, trap === 'revoked' ? {} : {
          [trap]() { throw Error('private-sentinel'); },
        });
        if (trap === 'revoked') revocable.revoke();
        await invalid(method(source, { ...options, signal: revocable.proxy }));
      }
    }
    for (const stage of [1, 2]) {
      const controller = new AbortController();
      const native = crypto.subtle.digest;
      let calls = 0;
      crypto.subtle.digest = async function (...args) {
        const value = await native.apply(this, args);
        if (++calls !== stage) return value;
        for (const key of ['aborted', 'addEventListener', 'removeEventListener']) {
          Object.defineProperty(controller.signal, key, { get() { throw Error('private-sentinel'); } });
        }
        controller.abort();
        await Promise.resolve();
        throw Error('private-sentinel');
      };
      try {
        await rejects(api.getBlockHeader(context('genesis'), { height: 0, signal: controller.signal }), 'ABORTED');
        check(calls === stage, 'native hash abort stage ' + stage);
      } finally { crypto.subtle.digest = native; }
    }
    for (const method of [api.getTip, api.getBlockHeader]) {
      const controller = new AbortController();
      controller.signal.addEventListener('abort', event => event.stopImmediatePropagation(), { once: true });
      const source = { sourceId, transport: http(`${location.origin}/rpc/invalid-input`, {
        ...transportOptions, headers: async () => { controller.abort(); return {}; },
      }) };
      await rejects(method(source, { ...(method === api.getTip ? {} : { height: 0 }), signal: controller.signal }), 'ABORTED');
    }
    for (const stage of [1, 2]) for (const reject of [false, true]) {
      const controller = new AbortController();
      controller.signal.addEventListener('abort', event => event.stopImmediatePropagation(), { once: true });
      const native = crypto.subtle.digest;
      let calls = 0;
      crypto.subtle.digest = async function (...args) {
        const value = await native.apply(this, args);
        if (++calls === stage) {
          controller.abort();
          if (reject) throw Error('private-late-digest');
        }
        return value;
      };
      try {
        await rejects(api.getBlockHeader(context('genesis'), { height: 0, signal: controller.signal }), 'ABORTED');
        check(calls === stage, 'suppressed abort at native digest ' + stage);
      } finally { crypto.subtle.digest = native; }
    }
    const tip = await api.getTip(context('good'));
    check(tip.height === 7 && tip.hash === hashA && tip.sourceId === sourceId, 'coherent tip');
    check(new Date(tip.observedAt).toISOString() === tip.observedAt, 'observation timestamp');
    for (const [mode, vector] of [['genesis', genesis], ['regtest', regtestGenesis], ['reorg', blockOne]]) {
      const header = await api.getBlockHeader(context(mode), { height: vector.verbose.height });
      check(header.point.hash === vector.verbose.hash && header.previousHash === vector.verbose.previousblockhash
        && header.time === vector.verbose.time, mode + ' header coherence');
      check(Array.from(header.raw, b => b.toString(16).padStart(2, '0')).join('') === vector.raw, mode + ' exact bytes');
      header.raw.fill(0);
      const again = await api.getBlockHeader(context(mode), { hash: vector.verbose.hash });
      check(again.raw[0] === 4 && again.raw.buffer !== header.raw.buffer, mode + ' byte ownership');
    }
    await rejects(api.getBlockHeader(context('invalid-input'), { height: 0, hash: hashA }), 'INVALID_ARGUMENT');
    await rejects(api.getBlockHeader(context('invalid-input'), { height: 4294967296 }), 'INVALID_ARGUMENT');
    for (const mode of ['bad-raw', 'bad-hash', 'bad-time', 'bad-parent', 'missing-parent', 'null']) {
      await rejects(api.getBlockHeader(context(mode), { height: 0 }), 'PROTOCOL_MISMATCH');
    }
    await rejects(api.getTip(context('bad-number')), 'PROTOCOL_MISMATCH');
    await rejects(api.getTip(context('unsupported')), 'METHOD_NOT_SUPPORTED');
    await rejects(api.getBlockHeader(context('absent'), { height: 0 }), 'TRANSPORT_ERROR');
    await rejects(api.getBlockHeader(context('raw-error'), { height: 0 }), 'TRANSPORT_ERROR');
    await rejects(api.getTip(context('stall', 40)), 'TIMEOUT');
    await rejects(api.getBlockHeader(context('raw-stall', 40), { height: 0 }), 'TIMEOUT');
    const controller = new AbortController();
    controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
    const reading = rejects(api.getBlockHeader(context('raw-abort'), { height: 0, signal: controller.signal }), 'ABORTED');
    // This fixture streams a body prefix; wait until the raw request has reached the server.
    const until = Date.now() + 3000;
    while (!(await (await fetch('/state')).json()).rawAbort) {
      if (Date.now() > until) throw Error('raw abort request never arrived');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    controller.signal.dispatchEvent(new Event('abort'));
    check(!controller.signal.aborted, 'synthetic event does not cancel native signal');
    controller.abort(); await reading;
    check(eager.Worker === 0 && eager.WebAssembly === 0, 'reads load no worker or WASM');
    check(typeof crypto.subtle.digest === 'function', 'native Web Crypto');
    return { checks, eager, userAgent: navigator.userAgent };
  } finally { Object.assign(globalThis, originals); }
}

if (typeof window !== 'undefined') {
  // Started by the document's module entry; WebDriver only observes this result.
  window.chainReadsResult = runBrowser().then(value => ({ value }), error => ({ error: String(error), stack: error.stack }));
}

if (typeof process !== 'undefined' && process.versions?.node) {
  const { default: assert } = await import('node:assert/strict');
  const { spawn } = await import('node:child_process');
  const { readFile, writeFile, mkdir, mkdtemp } = await import('node:fs/promises');
  const { firefoxOptions } = await import('../support/firefox-options.mjs');
  const { buildRoot, outputRoot } = await import('../support/paths.mjs');
  const { createHash } = await import('node:crypto');
  const build = buildRoot;
  const logs = process.env.PUBLIC_CHAIN_READS_LOGS ?? outputRoot + '/public-chain-reads-browser/logs';
  const scratch = process.env.PUBLIC_CHAIN_READS_SCRATCH ?? outputRoot + '/public-chain-reads-browser/scratch';
  await mkdir(logs, { recursive: true }); await mkdir(scratch, { recursive: true });
  const runRoot = await mkdtemp(`${scratch}/firefox-`);
  const reportPath = `${logs}/${runRoot.split('/').at(-1)}.json`;
  const report = { status: 'failed', runRoot, build, sandbox: 'unchanged', started: new Date().toISOString() };
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(), 90000);
  const onSignal = signal => { report.interrupted = signal; stop.abort(Error(signal)); };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let server, driver, driverIdentity, browserIdentity, session, endpoint, driverError, text = '';
  async function identity(pid) {
    try { const stat = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ').at(-1).split(' ');
      return { pid, parent: Number(stat[1]), group: Number(stat[2]), start: stat[19], state: stat[0] }; }
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
    report.sourcePin = '1e36d1bb6a8a9778a1bd316704b9c8cb75182de6';
    const assets = new Map([
      ['/', '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Chain reads fixture</title><script type="module" src="/public-chain-reads-browser.mjs"></script>'],
      ['/public-chain-reads-browser.mjs', await readFile(new URL(import.meta.url))],
      ['/public-chain-reads-fixtures.mjs', await readFile(new URL('./public-chain-reads-fixtures.mjs', import.meta.url))],
    ]);
    const { addBuildAssets } = await import('../support/build-assets.mjs');
    await addBuildAssets(assets);
    assets.set('/state', JSON.stringify({ rawAbort: false }));
    report.assets = Object.fromEntries([...assets].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
    server = await fixture((call, req, res) => {
      assert.equal(call.jsonrpc, '2.0'); assert.equal(typeof call.id, 'string');
      const mode = req.url.split('/').at(-1);
      assert.ok(['getblockchaininfo', 'getblockheader'].includes(call.method));
      assert.notEqual(mode, 'invalid-input');
      if (['unsupported', 'absent'].includes(mode) || mode === 'raw-error' && call.params[1] === false) {
        return `"error":{"code":${mode === 'unsupported' ? -32601 : -5},"message":"block not found private"}`;
      }
      if (mode === 'stall' || ['raw-stall', 'raw-abort'].includes(mode) && call.params[1] === false) {
        if (mode === 'raw-abort') assets.set('/state', JSON.stringify({ rawAbort: true }));
        res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); return;
      }
      if (mode === 'null') return result(null);
      if (call.method === 'getblockchaininfo') {
        assert.deepEqual(call.params, []);
        return mode === 'bad-number' ? `"result":{"blocks":9007199254740993,"bestblockhash":"${hashA}"}`
          : result({ blocks: 7, bestblockhash: hashA, headers: 99 });
      }
      const vector = mode === 'regtest' ? regtestGenesis : mode === 'reorg' ? blockOne : genesis;
      if (call.params[1] === false) {
        assert.deepEqual(call.params, [mode === 'bad-hash' ? hashB : vector.verbose.hash, false]);
        return result(mode === 'bad-raw' ? '00' : vector.raw);
      }
      assert.ok([String(vector.verbose.height), vector.verbose.hash].includes(call.params[0]));
      assert.equal(call.params[1], true);
      const verbose = { ...vector.verbose };
      if (mode === 'bad-hash') verbose.hash = hashB;
      if (mode === 'bad-time') verbose.time++;
      if (mode === 'bad-parent') verbose.previousblockhash = hashB;
      if (mode === 'missing-parent') delete verbose.previousblockhash;
      return result(verbose);
    }, assets);
    report.origin = server.origin;
    const args = ['--host', '127.0.0.1', '--port', '0', '--websocket-port', '0', '--profile-root', runRoot];
    driver = spawn(process.env.GECKODRIVER ?? 'geckodriver', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    report.endpoint = endpoint; report.session = session;
    report.stage = 'session-ready';
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    await request(`/session/${session}/url`, 'POST', { url: server.origin });
    const answer = await request(`/session/${session}/execute/async`, 'POST', {
      script: "const done=arguments[arguments.length-1]; Promise.resolve(window.chainReadsResult).then(answer=>done(answer || {error:'page module did not start'}));", args: [] });
    assert.ok(!answer.error, JSON.stringify(answer));
    report.browserResult = answer.value;
    assert.deepEqual(answer.value.eager, { fetch: 0, Worker: 0, WebAssembly: 0 });
    assert.deepEqual(server.unexpected, []);
    report.status = 'passed';
  } catch (error) { report.error = { message: String(error), stack: error.stack }; }
  finally {
    clearTimeout(deadline);
    const errors = []; let sessionDeleted = !session, groupGone = !driverIdentity;
    if (session) try { await request(`/session/${session}`, 'DELETE', undefined, true); sessionDeleted = true; }
    catch (error) { errors.push(String(error)); }
    if (driverIdentity) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const current = await identity(driverIdentity.pid);
        if (!current) break;
        if (current.start === driverIdentity.start && current.group === driverIdentity.pid) {
          try { process.kill(-driverIdentity.pid, signal); }
          catch (error) { if (error.code !== 'ESRCH') errors.push(String(error)); }
        } else { errors.push('driver PID reused; refusing group cleanup'); break; }
        await pause(200);
      }
      try { process.kill(-driverIdentity.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') groupGone = true; else errors.push(String(error)); }
    }
    if (server) { report.requests = server.calls; report.unexpected = server.unexpected; await server.close(); }
    const browser = browserIdentity && await identity(browserIdentity.pid);
    const browserGone = !browser || browser.start !== browserIdentity.start || browser.state === 'Z';
    report.cleanup = { sessionDeleted, groupGone, browserGone, serverClosed: true, errors };
    if (!sessionDeleted || !groupGone || !browserGone || errors.length) report.status = 'failed';
    report.stage = 'finished';
    report.finished = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    await writeFile(reportPath + '.driver.log', text);
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    console.log(JSON.stringify({ status: report.status, reportPath, error: report.error }));
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
}
