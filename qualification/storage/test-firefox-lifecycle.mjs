// Includes R2 cleanup regressions from the independent reviewer probe.
// Regression derived from the independent review's read-only VM probe.
// Evaluate the runner unchanged. All external effects are simulated;
// no sockets, browsers, shared files or real signals are used by this control.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const source = fs.readFileSync(process.env.STORAGE_RUNNER_SOURCE ?? new URL('./run-firefox.mjs', import.meta.url), 'utf8');
async function scenario(kind) {
  const calls = [], handlers = {}, timers = new Map();
  let start, timerId = 0, resolveSession, resultHandler, openSocket;
  const fakeProcess = { env: {}, on(name, fn) { handlers[name] = fn; }, kill(pid, signal) { calls.push({ kill: pid, signal }); if (kind === 'kill-failure') throw Error('mock kill failure'); }, exitCode: undefined };
  const server = { on() {}, listen(port, host, fn) { start = fn; }, closeAllConnections() { calls.push('closeConnections'); }, close() { calls.push('closeServer'); }, address() { return { port: 33333 }; } };
  const stream = () => ({ on(event, fn) { this[event] = fn; } });
  const child = { stdout: stream(), stderr: stream(), pid: 424242, on(event, fn) { this[event] = fn; } };
  const context = vm.createContext({
    process: fakeProcess, console: { log() {}, error(e) { calls.push({ error: String(e) }); } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    AbortSignal: { timeout() {} },
    async fetch(url, init) {
      calls.push({ url, method: init.method });
      if (url.endsWith('/status')) {
        if (kind === 'occupied-port') { calls.push('own-driver-bind-failed'); child.exit(1); }
        return { ok: true, json: async () => ({ value: { ready: true } }) };
      }
      if (url.endsWith('/session') && init.method === 'POST') {
        if (kind === 'stop-during-session' || kind === 'stop-session-delete-failure') await new Promise(r => { resolveSession = r; });
        return { ok: true, json: async () => ({ value: { sessionId: 'created-on-existing-driver', capabilities: { 'moz:processID': 434343, webSocketUrl: 'ws://mock/' } } }) };
      }
      if (init.method === 'DELETE' && kind === 'signal-during-cleanup') {
        handlers.SIGTERM();
        handlers.uncaughtException(Error('later error must preserve signal status'));
      }
      if (init.method === 'DELETE' && kind === 'error-during-cleanup') {
        handlers.uncaughtException(Error('simulated driver-output EIO during session cleanup'));
        handlers.SIGTERM();
      }
      if (init.method === 'DELETE' && ['delete-failure', 'stop-session-delete-failure'].includes(kind)) throw Error('mock delete failure');
      if (init.method === 'DELETE') return { ok: true, json: async () => ({ value: null }) };
      return { ok: true, json: async () => ({ value: null }) };
    },
    WebSocket: class {
      addEventListener(name, fn) { if (name === 'open') { if (kind === 'stop-during-socket') openSocket = fn; else queueMicrotask(fn); } if (name === 'message') this.message = fn; }
      send(payload) { const p = JSON.parse(payload); queueMicrotask(() => {
        this.message({ data: JSON.stringify({ method: 'script.realmCreated', params: { type: 'dedicated-worker', realm: 'worker' } }) });
        this.message({ data: JSON.stringify({ method: 'script.realmDestroyed', params: { realm: 'worker' } }) });
        this.message({ data: JSON.stringify({ id: p.id, result: {} }) });
      }); }
      close() { calls.push('closeSocket'); if (kind === 'socket-close-failure') throw Error('mock socket close failure'); }
    },
  });
  const deps = {
    'node:http': { default: { createServer(fn) { resultHandler = fn; return server; } } },
    'node:fs': { default: { openSync() { return 123; }, closeSync() { calls.push('closeLog'); }, writeSync() {}, writeFileSync() {} } },
    './serve-static.mjs': { serveStatic() {} },
    'node:child_process': { spawn() { calls.push('spawn-new-driver'); queueMicrotask(() => {
      if (kind === 'occupied-port') { calls.push('own-driver-bind-failed'); child.exit(1); }
      else if (kind === 'stop-before-listen') { handlers.SIGINT(); child.stdout.data?.('123\tgeckodriver\tINFO\tListening on 127.0.0.1:19445\n'); }
      else { child.stdout.data?.('123\tgeckodriver\tINFO\tListening on 127.0.0.1:19445\n'); }
    }); return child; } },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async name => {
    const data = deps[name]; return new vm.SyntheticModule(Object.keys(data), function () { for (const [key, value] of Object.entries(data)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const running = start();
  if (kind === 'stop-during-session' || kind === 'stop-session-delete-failure') {
    for (let n = 0; n < 30 && !resolveSession; n++) await Promise.resolve();
    assert.ok(resolveSession);
    handlers.SIGTERM();
    for (let n = 0; n < 10; n++) await Promise.resolve();
    resolveSession();
  }
  if (kind === 'stop-during-socket') {
    for (let n = 0; n < 100 && !openSocket; n++) await Promise.resolve();
    assert.ok(openSocket); handlers.SIGTERM(); openSocket();
  }
  await running;
  if (['success', 'delete-failure', 'kill-failure', 'socket-close-failure', 'signal-during-cleanup', 'error-during-cleanup'].includes(kind)) {
    const req = { url: '/result', method: 'POST', on(event, fn) { this[event] = fn; } };
    resultHandler(req, { end() {} });
    // Inject the same worker lifecycle messages the real browser supplies.
    // The fake subscription emits them below.
    req.data(JSON.stringify({ pass: true, results: [{}] }));
    const done = req.end();
    // A second successful result must not reset a failure recorded while the
    // first result's cleanup is in flight.
    const repeated = ['signal-during-cleanup', 'error-during-cleanup'].includes(kind) ? req.end() : undefined;
    for (const [id, t] of timers) if (t.ms === 500) { timers.delete(id); t.fn(); }
    await done;
    await repeated;
  }
  for (let n = 0; n < 100; n++) await Promise.resolve();
  if (kind === 'occupied-port') {
    // The old driver's /status response was accepted even though the new
    // driver's bind failure was delivered while that request was pending.
    handlers.SIGTERM();
    for (let n = 0; n < 20; n++) await Promise.resolve();
  }
  return { kind, calls, exitCode: fakeProcess.exitCode, remainingTimers: [...timers.values()].map(t => t.ms) };
}

console.log(JSON.stringify({ sourceSha256: createHash('sha256').update(source).digest('hex') }));
let failures = 0;
for (const kind of ['occupied-port', 'stop-during-session', 'stop-session-delete-failure', 'stop-before-listen', 'stop-during-socket', 'success', 'delete-failure', 'kill-failure', 'socket-close-failure', 'signal-during-cleanup', 'error-during-cleanup']) {
  const result = await scenario(kind);
  console.log(JSON.stringify(result));
  try {
    if (kind === 'occupied-port') {
      assert.equal(result.calls.some(c => c.url), false, 'unowned endpoint must receive no HTTP calls');
      assert.equal(result.exitCode, 1);
    } else if (kind === 'stop-before-listen') {
      assert.equal(result.exitCode, 130);
      assert.equal(result.calls.some(c => c.url), false);
    } else if (['success', 'delete-failure', 'kill-failure', 'socket-close-failure', 'signal-during-cleanup', 'error-during-cleanup'].includes(kind)) {
      assert.equal(result.exitCode, kind === 'success' ? 0 : kind === 'signal-during-cleanup' ? 143 : 1);
      assert.ok(result.calls.some(c => c.method === 'DELETE'));
    } else {
      assert.equal(result.exitCode, 143);
      assert.ok(result.calls.some(c => c.method === 'DELETE'), 'late session must be deleted');
      assert.equal(result.calls.some(c => c.method === 'POST' && c.url.endsWith('/url')), false, 'no navigation after shutdown');
    }
    if (['signal-during-cleanup', 'error-during-cleanup'].includes(kind)) {
      assert.equal(result.calls.filter(c => c.method === 'DELETE').length, 1);
      for (const operation of ['closeSocket', 'closeConnections', 'closeServer', 'closeLog']) {
        assert.equal(result.calls.filter(c => c === operation).length, 1, operation + ' exactly once');
      }
      assert.deepEqual(result.calls.filter(c => c.kill), [{ kill: -424242, signal: 'SIGKILL' }]);
    }
    assert.deepEqual(result.remainingTimers, []);
    console.log('PASS ' + kind);
  } catch (e) { failures++; console.error('FAIL ' + kind + ': ' + e.message); }
}
process.exitCode = failures ? 1 : 0;
