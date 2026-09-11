// Run with Node after npm run build. Uses only an owned loopback fixture and installed Firefox.
import { serveFixtures, unaryMethods, streamMethods, base64, frame } from './grpc-web-fixtures.mjs';

export async function browserChecks() {
  const { createGrpcWebByteTransport } = await import('/src/clients/grpc-web.js');
  const claims = [];
  const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`); };
  const rejects = async (action, code) => {
    try { await action(); } catch (error) {
      equal(error.code, code);
      if (/private-secret|private-server|\?case=/.test(`${error.stack} ${JSON.stringify(error)}`)) throw Error('error secrecy');
      return;
    }
    throw Error('Expected rejection: ' + code);
  };
  const create = (mode = 'good', extra = {}) => createGrpcWebByteTransport(location.origin + '?case=' + mode, { timeoutMs: 2000, ...extra });
  const unary = (transport, request = new Uint8Array([8, 1]), method = 'GetLatestBlock') => transport.unary({ method, request });
  const stream = (transport, signal) => transport.stream({ method: 'GetBlockRange', request: new Uint8Array(), ...(signal ? { signal } : {}) });
  const collect = async iterator => { const values = []; for await (const value of iterator) values.push([...value]); return values; };
  document.cookie = 'private-secret=cookie; SameSite=Strict; path=/';
  if (!document.cookie.includes('private-secret')) throw Error('cookie control missing');
  for (const method of unaryMethods) equal([...await unary(create(), undefined, method)], [8, 1]);
  for (const method of streamMethods) equal(await collect(create().stream({ method, request: new Uint8Array() })), [[8, 1]]);
  claims.push('exact-methods');
  equal(await collect(stream(create('fragmented'))), [[1, 2, 3], [4]]);
  await rejects(() => unary(create('fragmented')), 'PROTOCOL_MISMATCH');
  claims.push('fragmentation-padding-cardinality');
  equal(await collect(stream(create('headers-success'))), []);
  await rejects(() => unary(create('headers-success')), 'PROTOCOL_MISMATCH');
  for (const mode of ['error', 'headers-error', 'http-error']) await rejects(() => unary(create(mode), undefined, 'SendTransaction'), 'TRANSPORT_ERROR');
  for (const mode of ['missing', 'truncated', 'compressed', 'duplicate']) await rejects(() => collect(stream(create(mode))), 'PROTOCOL_MISMATCH');
  claims.push('status-truncation-compression-no-retry');
  for (const limits of [{ messageBytes: 1 }, { wireBytes: 8 }, { decodedBytes: 8 }, { chunkBytes: 1 }]) {
    await rejects(() => collect(stream(create('good', { limits }))), 'RESOURCE_LIMIT');
  }
  await rejects(() => collect(stream(create('fragmented', { limits: { messages: 1 } }))), 'RESOURCE_LIMIT');
  claims.push('limits');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const transport = create('mutation', { headers: async () => { await gate; return { Authorization: 'private-secret' }; } });
  const request = new Uint8Array([8, 1]);
  const pending = unary(transport, request); request.fill(99); release();
  const result = await pending; equal([...result], [8, 1]); result[0] = 77;
  equal([...await unary(create())], [8, 1]);
  const detached = new Uint8Array([1]); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  await rejects(() => unary(create(), detached), 'INVALID_ARGUMENT');
  await rejects(() => unary(create('good', { headers: async () => { throw Error('private-secret'); } })), 'INVALID_ARGUMENT');
  claims.push('ownership-secrecy');
  await rejects(() => unary(create('stall', { timeoutMs: 60 })), 'TIMEOUT');
  await rejects(() => unary(create('good', { timeoutMs: 30, headers: async () => new Promise(() => {}) })), 'TIMEOUT');
  const controller = new AbortController();
  const aborted = stream(create('stall'), controller.signal);
  await aborted.next(); controller.abort('private-secret');
  await rejects(() => aborted.next(), 'ABORTED');
  const returned = stream(create('stall')); await returned.next(); await returned.return();
  const blocked = stream(create('stall')); await blocked.next();
  const next = rejects(() => blocked.next(), 'ABORTED'); await blocked.return(); await next;
  claims.push('deadline-abort-return');
  return { ok: true, claims, userAgent: navigator.userAgent };
}

async function runFirefox() {
  const { readFile, writeFile, mkdir, mkdtemp } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { firefoxOptions } = await import('../../qualification/browser-runtime/firefox-options.mjs');
  const assert = (await import('node:assert/strict')).default;
  const logs = '/home/jack/zcash-grpc-web-logs', scratch = '/home/jack/zcash-grpc-web-scratch';
  await mkdir(logs, { recursive: true }); await mkdir(scratch, { recursive: true });
  const run = await mkdtemp(scratch + '/firefox-');
  const assets = new Map([
    ['/', '<!doctype html><meta charset="utf-8"><title>gRPC-Web fixture</title><link rel="icon" href="data:,">'],
    ['/grpc-web-browser.mjs', await readFile(new URL('./grpc-web-browser.mjs', import.meta.url))],
    ['/grpc-web-fixtures.mjs', await readFile(new URL('./grpc-web-fixtures.mjs', import.meta.url))],
    ['/src/clients/grpc-web.js', await readFile(new URL('../../dist/src/clients/grpc-web.js', import.meta.url))],
    ['/src/errors.js', await readFile(new URL('../../dist/src/errors.js', import.meta.url))],
  ]);
  const fixture = await serveFixtures(assets);
  let driver, endpoint, session, driverLog = '', browser, leader;
  const report = { ok: false, run, started: new Date().toISOString(), cleanup: {} };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const identity = async pid => {
    try { const fields = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ').at(-1).split(' '); return { pid, start: fields[19], state: fields[0] }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const alive = async owned => { const now = owned && await identity(owned.pid); return !!now && now.start === owned.start && now.state !== 'Z'; };
  const command = async (path, method = 'GET', body) => {
    const response = await fetch(endpoint + path, { method, headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(45000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.ok(response.ok && !data.value?.error, JSON.stringify(data)); return data.value;
  };
  try {
    driver = spawn('/snap/bin/geckodriver', ['--host', '127.0.0.1', '--port', '0', '--websocket-port', '0', '--profile-root', run],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let launchError;
    driver.on('error', error => { launchError = error; });
    leader = await identity(driver.pid);
    for (const stream of [driver.stdout, driver.stderr]) stream.on('data', bytes => { driverLog += bytes; });
    const until = Date.now() + 15000;
    while (!endpoint && Date.now() < until) {
      if (launchError) throw launchError;
      const match = driverLog.match(/Listening on (127\.0\.0\.1:\d+)/);
      if (match) endpoint = 'http://' + match[1]; else await delay(40);
    }
    assert.ok(endpoint, 'driver readiness');
    const created = await command('/session', 'POST', { capabilities: { alwaysMatch: {
      browserName: 'firefox', acceptInsecureCerts: false, 'moz:firefoxOptions': firefoxOptions(),
    } } });
    session = created.sessionId;
    browser = await identity(created.capabilities['moz:processID']);
    report.capabilities = created.capabilities;
    await command(`/session/${session}/timeouts`, 'POST', { script: 30000, pageLoad: 15000 });
    await command(`/session/${session}/url`, 'POST', { url: fixture.origin });
    report.result = await command(`/session/${session}/execute/async`, 'POST', {
      script: "const done = arguments[arguments.length - 1]; import('/grpc-web-browser.mjs').then(m => m.browserChecks()).then(done, error => done({error: String(error), stack: error.stack}));", args: [],
    });
    assert.equal(report.result.ok, true, JSON.stringify(report.result));
    await delay(100);
    const submissions = fixture.requests.filter(r => r.path.endsWith('/SendTransaction'));
    assert.equal(submissions.length, 4); // One success plus three independent failures.
    assert.equal(fixture.requests.filter(r => r.mode === 'mutation')[0].body, base64(frame(new Uint8Array([8, 1]))));
    assert.ok(fixture.requests.every(r => !r.headers.cookie && !r.headers.referer));
    assert.equal(fixture.closed.filter(mode => mode === 'stall').length, 4);
    report.requests = fixture.requests.map(({ path, mode, body }) => ({ path, mode, body }));
    report.ok = true;
  } catch (error) { report.error = String(error); }
  finally {
    if (session) try { await command(`/session/${session}`, 'DELETE'); report.cleanup.sessionDeleted = true; } catch (error) { report.cleanup.error = String(error); }
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const current = leader && await identity(leader.pid);
      if (leader && (!current || current.start === leader.start)) {
        try { process.kill(-leader.pid, signal); } catch (error) { if (error.code !== 'ESRCH') report.cleanup.error = String(error); }
      }
      if (await alive(browser)) try { process.kill(browser.pid, signal); } catch (error) { if (error.code !== 'ESRCH') report.cleanup.error = String(error); }
      await delay(300);
    }
    try { process.kill(-leader.pid, 0); report.cleanup.driverGroupGone = false; }
    catch (error) { report.cleanup.driverGroupGone = error.code === 'ESRCH'; }
    report.cleanup.browserGone = !await alive(browser);
    await fixture.close(); report.cleanup.serverClosed = true;
    report.ok &&= report.cleanup.sessionDeleted && report.cleanup.driverGroupGone && report.cleanup.browserGone && !report.cleanup.error;
    await writeFile(logs + '/firefox.driver.log', driverLog);
    await writeFile(logs + '/firefox.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
if (typeof window === 'undefined') await runFirefox();
