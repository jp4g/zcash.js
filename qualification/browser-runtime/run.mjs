// No npm dependency: drive installed real Chromium using its DevTools pipe.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, extname } from 'node:path';
import { once } from 'node:events';

const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw new Error(`required ${name}`);
  return args[i + 1];
}
const root = resolve(option('--artifacts'));
const logRoot = resolve(option('--logs'));
const scratch = resolve(option('--scratch'));
const chromePath = resolve(option('--chrome'));
await mkdir(logRoot, { recursive: true });
await mkdir(scratch, { recursive: true });
const runId = `browser-${Date.now()}`;
const log = [];
function record(event) {
  const entry = { utc: new Date().toISOString(), ...event };
  log.push(entry);
  console.log(JSON.stringify(entry));
}
const hash = b => createHash('sha256').update(b).digest('hex');
let server, chrome, cdp, exitPromise;
let stderr = '';
let exitCode = 1;
try {
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const assets = new Map();
  // Immutable in-memory allowlist prevents traversal and re-fetch drift.
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('invalid asset name');
    const bytes = await readFile(join(root, name));
    if (hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes) throw new Error(`asset integrity: ${name}`);
    assets.set(`/${name}`, bytes);
  }
  const chromeSha256 = hash(await readFile(chromePath));
  record({ stage: 'inputs', argv: process.argv, node: process.version,
    manifestSha256: hash(manifestBytes), chromeSha256, sourceHashes: manifest.sourceHashes,
    rawSha256: manifest.raw.sha256, files: manifest.files });
  if (args.includes('--verify-only')) {
    record({ stage: 'assets-verified', category: 'static-only-not-browser' });
    exitCode = 0;
  } else {
  server = createServer((req, res) => {
    const path = req.url === '/' ? '/index.html' : req.url;
    const bytes = assets.get(path);
    record({ stage: 'http', method: req.method, path, status: bytes ? 200 : 404 });
    if (!bytes || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' };
    res.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
      // Deliberately no COOP/COEP; never delete/override SAB globals.
    });
    res.end(bytes);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(scratch, 'chrome-profile-'));
  const chromeArgs = ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--disable-domain-reliability', '--metrics-recording-only', 'about:blank'];
  record({ stage: 'launch', chromePath, chromeArgs, origin,
    isolationHeaders: { coop: null, coep: null }, note: 'Browser sandbox retained; no security-disabling flags.' });
  chrome = spawn(chromePath, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  exitPromise = new Promise(resolveExit => {
    chrome.once('exit', (code, signal) => resolveExit({ code, signal }));
    chrome.once('error', error => resolveExit({ error: String(error) }));
  });
  chrome.stderr.on('data', bytes => { stderr += bytes; });
  const pending = new Map();
  const targets = new Map();
  const destroyed = new Set();
  let serial = 0, buffer = Buffer.alloc(0), pageLoaded = false;
  const rejectPending = error => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear();
  };
  chrome.on('error', rejectPending);
  chrome.on('exit', (code, signal) => rejectPending(new Error(`browser exit ${code}/${signal}`)));
  chrome.stdio[3].on('error', rejectPending);
  chrome.stdio[4].on('data', bytes => {
    buffer = Buffer.concat([buffer, bytes]);
    let end;
    while ((end = buffer.indexOf(0)) >= 0) {
      const packet = buffer.subarray(0, end).toString();
      buffer = buffer.subarray(end + 1);
      if (!packet) continue;
      const message = JSON.parse(packet);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) continue;
        pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else if (message.method === 'Target.targetCreated' || message.method === 'Target.targetInfoChanged') {
        const info = message.params.targetInfo;
        targets.set(info.targetId, info);
        if (info.type === 'worker') record({ stage: message.method, ...message.params });
      } else if (message.method === 'Target.targetDestroyed') {
        destroyed.add(message.params.targetId);
        record({ stage: message.method, ...message.params });
      } else if (message.method === 'Runtime.exceptionThrown') {
        record({ stage: 'page-exception', ...message.params });
      } else if (message.method === 'Page.loadEventFired') {
        pageLoaded = true;
      }
    }
  });
  cdp = (method, params = {}, sessionId, timeoutMs = 60000) => new Promise((resolveCall, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, timeoutMs);
    pending.set(id, { resolve: resolveCall, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  record({ stage: 'browser-version', ...await cdp('Browser.getVersion') });
  await cdp('Target.setDiscoverTargets', { discover: true });
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  pageLoaded = false;
  await cdp('Page.navigate', { url: origin }, sessionId);
  const loadDeadline = Date.now() + 10000;
  while (!pageLoaded && Date.now() < loadDeadline) await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
  if (!pageLoaded) throw new Error('page load timeout');
  const evaluate = async expression => {
    const value = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  const context = await evaluate(`import('./controller.mjs').then(m => m.context)`);
  record({ stage: 'page-context', context });
  if (!context.secure || context.isolated || context.sab !== 'undefined') throw new Error('page baseline context rejected');
  const scenarios = ['same-instance', 'pool', 'oom', 'growth', 'hosts', 'omitted-pool',
    'entropy-unavailable', 'entropy-loss', 'time-loss', 'sleep-loss',
    'destruction-original', 'destruction-fresh', 'bootstrap-timeout', 'bootstrap-error',
    'cancel-active', 'cancel-before-start', 'malformed-result'];
  for (const scenario of scenarios) {
    const previous = new Set(targets.keys());
    const result = await evaluate(`import('./controller.mjs').then(m => m.runScenario(${JSON.stringify(scenario)}, ${JSON.stringify(manifest)}))`);
    // Browser Worker.terminate() has no completion promise. Require the engine's
    // target-destroyed event before proceeding, especially before the fresh memdb.
    const wanted = scenario === 'cancel-before-start' ? 0 : 1;
    const deadline = Date.now() + 5000;
    let created;
    do {
      created = [...targets.values()].filter(t => !previous.has(t.targetId) && t.type === 'worker');
      if (created.length === wanted && created.every(t => destroyed.has(t.targetId))) break;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
    } while (Date.now() < deadline);
    if (created.length !== wanted || created.some(t => !destroyed.has(t.targetId))) {
      throw new Error(`worker termination unverified: ${scenario}, ${JSON.stringify(created)}`);
    }
    if (result.ok !== true) throw new Error(`scenario failed ${scenario}`);
    record({ stage: 'scenario-pass', ...result, termination: {
      method: 'Worker.terminate + CDP Target.targetDestroyed', targetIds: created.map(t => t.targetId),
    } });
  }
  record({ stage: 'complete', runtimePasses: 12, harnessControlPasses: 5,
    limitations: 'Ephemeral memdb only; no OPFS durability, scanner, threads, full F1 or issue #2 completion.' });
  exitCode = 0;
  }
} catch (error) {
  record({ stage: 'failed', error: String(error), stack: error.stack });
} finally {
  if (chrome) {
    if (cdp && chrome.exitCode === null && chrome.signalCode === null) {
      try { await cdp('Browser.close', {}, undefined, 3000); } catch { /* process cleanup below */ }
    }
    const timeout = setTimeout(() => chrome.kill('SIGKILL'), 3000);
    const outcome = await exitPromise;
    clearTimeout(timeout);
    record({ stage: 'browser-cleanup', ...outcome });
  }
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
  }
  record({ stage: 'cleanup', loopbackServerClosed: !server?.listening, exitCode });
  await writeFile(join(logRoot, `${runId}.jsonl`), log.map(e => JSON.stringify(e)).join('\n') + '\n');
  await writeFile(join(logRoot, `${runId}.chrome.log`), stderr);
  process.exitCode = exitCode;
}
