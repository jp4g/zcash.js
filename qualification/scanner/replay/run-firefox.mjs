// Foreground-only real Firefox runner. No installs or browser/security overrides.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, appendFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { requireLifecycle } from './firefox-lifecycle.mjs';
import { firefoxOptions } from './firefox-options.mjs';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) { if (fallback) return fallback; throw Error(`required ${name}`); }
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`value required ${name}`);
  return args[i + 1];
}
const root = resolve(option('--artifacts'));
const logRoot = resolve(option('--logs'));
const scratch = resolve(option('--scratch'));
const firefox = undefined; // Packaged geckodriver selects its actual Firefox binary.
const geckodriver = resolve(option('--geckodriver', '/snap/bin/geckodriver'));
await mkdir(logRoot, { recursive: true });
await mkdir(scratch, { recursive: true });
const runRoot = await mkdtemp(join(scratch, 'firefox-run-'));
const id = `firefox-${Date.now()}`;
const logPath = join(logRoot, `${id}.jsonl`);
const resultPath = join(logRoot, `${id}.json`);
const driverPath = join(logRoot, `${id}.driver.log`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const events = [], results = [], records = [];
let logWrites = Promise.resolve();
let logFailure;
function record(data) {
  const entry = { utc: new Date().toISOString(), ...data };
  records.push(entry);
  const line = JSON.stringify(entry) + '\n';
  process.stdout.write(line);
  logWrites = logWrites.then(async () => {
    if (logFailure) return;
    try { await appendFile(logPath, line); }
    catch (error) {
      logFailure = error;
      stop.abort(error);
    }
  });
}
const stop = new AbortController();
const deadline = setTimeout(() => stop.abort(Error('Firefox suite deadline exceeded')), 480000);
const onSignal = () => stop.abort(Error('Firefox run interrupted'));
process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let server, driver, driverExit, socket, endpoint, session, capabilities, manifest;
let driverText = '', driverFailure, socketFailure, exitCode = 1, serial = 0;
const pending = new Map();
let browserIdentity;
async function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid, startTime: fields[19], state: fields[0] };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function rejectPending(error) {
  socketFailure = error;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
}
async function request(route, method = 'GET', body, { timeout = 70000, cleanup = false } = {}) {
  const signal = cleanup ? AbortSignal.timeout(timeout) : AbortSignal.any([stop.signal, AbortSignal.timeout(timeout)]);
  const response = await fetch(`${endpoint}${route}`, { method, signal,
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw Error(`WebDriver ${route}: ${JSON.stringify(data)}`);
  return data.value;
}
function bidi(method, params = {}) {
  stop.signal.throwIfAborted();
  if (socketFailure) return Promise.reject(socketFailure);
  return new Promise((resolveCall, reject) => {
    const commandId = ++serial;
    const timer = setTimeout(() => { pending.delete(commandId); reject(Error(`BiDi timeout ${method}`)); }, 10000);
    pending.set(commandId, { resolve: resolveCall, reject, timer });
    try { socket.send(JSON.stringify({ id: commandId, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(commandId); reject(error); }
  });
}
async function waitFor(check, timeout, label) {
  const until = Date.now() + timeout;
  let error;
  do {
    stop.signal.throwIfAborted();
    if (driverFailure) throw driverFailure;
    if (socketFailure) throw socketFailure;
    try { return await check(); } catch (caught) { error = caught; }
    await delay(30);
  } while (Date.now() < until);
  throw Error(`${label}: ${error}`);
}
try {
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  manifest = JSON.parse(manifestBytes);
  const assets = new Map();
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..')) throw Error('invalid asset name');
    const bytes = await readFile(join(root, name));
    if (sha(bytes) !== expected.sha256 || bytes.length !== expected.bytes) throw Error(`asset integrity: ${name}`);
    assets.set(`/${name}`, bytes);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const binaryHashes = {};
  for (const path of ['/snap/firefox/current/usr/lib/firefox/firefox-bin', '/snap/firefox/current/usr/lib/firefox/geckodriver']) {
    const resolved = await realpath(path);
    binaryHashes[resolved] = sha(await readFile(resolved));
  }
  const expected = option('--manifest-sha256');
  if (sha(manifestBytes) !== expected) throw Error('scanner manifest hash mismatch');
  record({ stage: 'inputs', argv: process.argv, node: process.version, root, runRoot,
    manifestSha256: sha(manifestBytes), manifest,
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    lifecycleAuditSha256: sha(await readFile(join(here, 'firefox-lifecycle.mjs'))),
    optionsSha256: sha(await readFile(join(here, 'firefox-options.mjs'))),
    firefox: firefox || 'packaged-geckodriver-default', geckodriver, binaryHashes });
  const browserOptions = firefoxOptions(firefox);
  server = createServer((req, res) => {
    const path = req.url === '/' ? '/browser.html' : req.url;
    const bytes = assets.get(path);
    record({ stage: 'http', method: req.method, path, status: bytes && req.method === 'GET' ? 200 : 404 });
    if (!bytes || req.method !== 'GET') { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' }[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
    });
    res.end(bytes);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const driverArgs = ['--host', '127.0.0.1', '--port', '0', '--websocket-port', '0', '--profile-root', runRoot];
  record({ stage: 'launch', geckodriver, driverArgs, firefox, origin, sandbox: 'unchanged', coop: null, coep: null });
  driver = spawn(geckodriver, driverArgs, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  driverExit = new Promise(resolveExit => {
    driver.once('error', error => { driverFailure = error; resolveExit({ error: String(error) }); });
    driver.once('exit', (code, signal) => { driverFailure = Error(`driver exited ${code}/${signal}`); resolveExit({ code, signal }); });
  });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', bytes => { driverText += bytes; });
  endpoint = await waitFor(() => {
    const match = driverText.match(/Listening on 127\.0\.0\.1:(\d+)/);
    if (!match) throw Error('waiting for owned geckodriver listener');
    return `http://127.0.0.1:${match[1]}`;
  }, 15000, 'driver startup');
  await request('/status', 'GET', undefined, { timeout: 5000 });
  const value = await request('/session', 'POST', { capabilities: { alwaysMatch: {
    browserName: 'firefox', webSocketUrl: true,
    'moz:firefoxOptions': browserOptions,
  } } });
  session = value.sessionId; capabilities = value.capabilities;
  browserIdentity = await processIdentity(capabilities['moz:processID']);
  record({ stage: 'session', session, endpoint, capabilities });
  if (!session || capabilities.browserName !== 'firefox' || !capabilities.webSocketUrl || !browserIdentity) throw Error('Firefox/BiDi/process capability missing');
  const wsURL = new URL(capabilities.webSocketUrl);
  if (wsURL.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(wsURL.hostname)) throw Error('non-loopback BiDi endpoint');
  socket = new WebSocket(wsURL);
  socket.addEventListener('message', ({ data }) => {
    try {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const command = pending.get(message.id);
        if (!command) return;
        clearTimeout(command.timer); pending.delete(message.id);
        if (message.type === 'error') command.reject(Error(`BiDi: ${JSON.stringify(message)}`));
        else command.resolve(message.result);
      } else {
        events.push(message); record({ stage: 'bidi-event', eventIndex: events.length - 1, event: message });
      }
    } catch (error) { rejectPending(error); }
  });
  socket.addEventListener('close', () => rejectPending(Error('BiDi socket closed')));
  socket.addEventListener('error', () => rejectPending(Error('BiDi socket error')));
  await waitFor(() => { if (socket.readyState !== WebSocket.OPEN) throw Error('BiDi not open'); }, 10000, 'BiDi open');
  await bidi('session.subscribe', { events: ['script.realmCreated', 'script.realmDestroyed'] });
  await request(`/session/${session}/timeouts`, 'POST', { script: 65000, pageLoad: 15000, implicit: 0 });
  await request(`/session/${session}/url`, 'POST', { url: origin });
  const { contexts } = await bidi('browsingContext.getTree', {});
  if (contexts.length !== 1) throw Error('expected one owned browsing context');
  const { realms } = await bidi('script.getRealms', { context: contexts[0].context, type: 'window' });
  if (realms.length !== 1 || realms[0].origin !== origin) throw Error('page realm capability missing/ambiguous');
  const owner = realms[0].realm;
  const execute = async (script, scriptArgs = []) => {
    const response = await request(`/session/${session}/execute/async`, 'POST', { script, args: scriptArgs });
    if (!response.success) throw Error(`browser script: ${response.error}`);
    return response.result;
  };
  const context = await execute("const done = arguments[arguments.length - 1]; import('./controller.mjs').then(m => done({success:true,result:m.context}), e => done({success:false,error:String(e)}));");
  record({ stage: 'page-context', context, owner });
  if (!context.secure || context.isolated || context.sab !== 'undefined') throw Error('page baseline rejected');
  const scenarios = ['transparent','effects-trees','imported-batches','failures','rollback','rewind'];
  if (JSON.stringify(manifest.cases) !== JSON.stringify(scenarios)) throw Error('scanner case manifest mismatch');
  for (const scenario of scenarios) {
    const after = events.length;
    record({ stage: 'scenario-start', scenario, after });
    const result = await execute("const scenario=arguments[0], manifest=arguments[1], done=arguments[arguments.length-1]; import('./controller.mjs').then(m => m.runScenario(scenario,manifest)).then(result => done({success:true,result}), e => done({success:false,error:String(e),stack:e.stack}));", [scenario, manifest]);
    const wanted = 1;
    const workerURL = origin + '/browser-worker.mjs';
    const lifecycle = await waitFor(() => requireLifecycle(events, { after, wanted, owner, origin, workerURL }), 8000, `worker lifecycle ${scenario}`);
    // Independent live-realm inventory also acts as a protocol fence for queued events.
    const live = await bidi('script.getRealms', { type: 'dedicated-worker' });
    if (!Array.isArray(live.realms) || live.realms.length) throw Error(`worker still present: ${JSON.stringify(live)}`);
    requireLifecycle(events, { after, wanted, owner, origin, workerURL });
    if (!result.ok || result.scenario !== scenario) throw Error('unexpected scenario result');
    results.push({ ...result, lifecycle });
    record({ stage: 'scenario-pass', ...result, lifecycle });
  }
  if (results.length !== 6) throw Error('scanner case count');
  record({ stage:'complete', scannerPasses:6, realmsDestroyed:6 });
  exitCode = 0;
} catch (error) {
  record({ stage: 'failed', error: String(error), stack: error.stack });
} finally {
  clearTimeout(deadline);
  let sessionDeleted = false, processGroupGone = !driver?.pid, browserProcessGone = !browserIdentity;
  if (session) {
    try { await request(`/session/${session}`, 'DELETE', undefined, { timeout: 10000, cleanup: true }); sessionDeleted = true; }
    catch (error) { exitCode = 1; record({ stage: 'session-cleanup-error', error: String(error) }); }
  }
  socket?.close(); rejectPending(Error('runner cleanup'));
  if (driver?.pid) {
    const killGroup = signal => { try { process.kill(-driver.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
    try {
      killGroup('SIGTERM');
      await Promise.race([driverExit, delay(2000)]);
      killGroup('SIGKILL');
      const until = Date.now() + 3000;
      do {
        try { process.kill(-driver.pid, 0); } catch (error) { if (error.code === 'ESRCH') { processGroupGone = true; break; } throw error; }
        await delay(30);
      } while (Date.now() < until);
    } catch (error) { record({ stage: 'process-cleanup-error', error: String(error) }); }
    if (!processGroupGone) exitCode = 1;
  }
  if (browserIdentity) {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const current = await processIdentity(browserIdentity.pid);
      if (!current || current.startTime !== browserIdentity.startTime || current.state === 'Z') { browserProcessGone = true; break; }
      try { process.kill(browserIdentity.pid, signal); } catch (error) { if (error.code !== 'ESRCH') record({ stage: 'browser-cleanup-error', error: String(error) }); }
      await delay(250);
    }
    const current = await processIdentity(browserIdentity.pid);
    browserProcessGone = !current || current.startTime !== browserIdentity.startTime || current.state === 'Z';
    if (!browserProcessGone) exitCode = 1;
  }
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); }
  process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
  await logWrites;
  if (logFailure) exitCode = 1;
  record({ stage: 'cleanup', sessionDeleted, processGroupGone, browserProcessGone, loopbackServerClosed: !server?.listening, exitCode, runRoot });
  await logWrites;
  if (logFailure) exitCode = 1;
  process.exitCode = exitCode;
  await writeFile(driverPath, driverText);
  await writeFile(resultPath, JSON.stringify({ id, exitCode, capabilities, manifest, results, events, records,
    limits:'Real unshared scanner cases and observed Firefox worker destruction; ephemeral SQLite only; no shared threading, durability, SDK or full F2 completion.' }, null, 2) + '\n');
  process.exitCode = exitCode;
}
