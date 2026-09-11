// Fresh coordinator-owned host run; never attaches to an existing browser/session.
import http from 'node:http';
import fs from 'node:fs';
import { serveStatic } from './serve-static.mjs';
import { spawn } from 'node:child_process';
const base = process.env.STORAGE_BUNDLE ?? '/home/jack/zcash-storage-scratch/stage-1/bundle';
const logs = '/home/jack/zcash-storage-logs';
const stamp = Date.now();
const output = fs.openSync(`${logs}/firefox-driver-${stamp}.log`, 'wx');
const port = Number(process.env.STORAGE_DRIVER_PORT ?? 19445);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('invalid local driver port');
const endpoint = `http://127.0.0.1:${port}`;
let driver, session, browserPid, socket, finishing = false, sequence = 0;
const events = [], pending = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/result' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4000000) req.destroy(); });
    req.on('end', async () => {
      try {
        const result = JSON.parse(body); res.end('recorded');
        // Allow queued realm destruction notifications to reach the host runner.
        await new Promise(r => setTimeout(r, 500));
        const created = events.filter(e => e.method === 'script.realmCreated' && e.params.type === 'dedicated-worker').map(e => e.params.realm);
        const destroyed = new Set(events.filter(e => e.method === 'script.realmDestroyed').map(e => e.params.realm));
        const lifecycle = { created, destroyed: [...destroyed], allWorkersDestroyed: created.length > 0 && created.every(r => destroyed.has(r)) };
        result.lifecycle = lifecycle;
        result.pass = result.pass && lifecycle.allWorkersDestroyed;
        fs.writeFileSync(`${logs}/firefox-result-${stamp}.json`, JSON.stringify({ ...result, base, events }, null, 2));
        console.log(JSON.stringify({ pass: result.pass, tests: result.results?.length, error: result.error, lifecycle, base }));
        await finish(result.pass ? 0 : 1);
      } catch (e) { console.error(e); await finish(1); }
    }); return;
  }
  serveStatic(base, req, res);
});
async function request(route, method = 'GET', body) {
  const response = await fetch(`${endpoint}${route}`, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw Error(JSON.stringify(data));
  return data.value;
}
function bidi(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`BiDi timeout ${method}`)); }, 10000);
    pending.set(id, value => { clearTimeout(timer); value.type === 'error' ? reject(Error(JSON.stringify(value))) : resolve(value.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const timer = setTimeout(() => { console.error('external Firefox suite timeout'); void finish(1); }, 180000);
async function finish(code) {
  if (finishing) return; finishing = true; clearTimeout(timer);
  socket?.close();
  if (session) { try { await request(`/session/${session}`, 'DELETE'); } catch (e) { console.error(`session cleanup: ${e.message}`); code = 1; if (browserPid) { try { process.kill(browserPid, 'SIGKILL'); } catch {} } } }
  if (driver?.pid) { try { process.kill(-driver.pid, 'SIGKILL'); } catch {} }
  server.closeAllConnections(); server.close(); fs.closeSync(output); process.exitCode = code;
}
process.on('uncaughtException', e => { console.error(e); void finish(1); });
process.on('unhandledRejection', e => { console.error(e); void finish(1); });
process.on('SIGTERM', () => void finish(143)); process.on('SIGINT', () => void finish(130));
server.on('error', e => { console.error(e); void finish(1); });
server.listen(0, '127.0.0.1', async () => {
  try {
    driver = spawn('/snap/bin/geckodriver', ['--host', '127.0.0.1', '--port', String(port), '--websocket-port', '0'], {
      detached: true, stdio: ['ignore', output, output],
    });
    let driverError;
    driver.on('error', e => { driverError = e; });
    driver.on('exit', code => { if (!finishing) driverError = Error(`driver exited ${code}`); });
    const deadline = Date.now() + 10000;
    for (;;) {
      if (driverError) throw driverError;
      try { await request('/status'); break; } catch (e) { if (Date.now() >= deadline) throw e; await new Promise(r => setTimeout(r, 100)); }
    }
    const value = await request('/session', 'POST', { capabilities: { alwaysMatch: {
      browserName: 'firefox', webSocketUrl: true, 'moz:firefoxOptions': { args: ['-headless'] },
    } } });
    session = value.sessionId; browserPid = value.capabilities['moz:processID'];
    socket = new WebSocket(value.capabilities.webSocketUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) { const done = pending.get(message.id); pending.delete(message.id); done?.(message); }
      else events.push(message);
    });
    await bidi('session.subscribe', { events: ['script.realmCreated', 'script.realmDestroyed'] });
    await request(`/session/${session}/url`, 'POST', { url: `http://127.0.0.1:${server.address().port}/` });
  } catch (e) { console.error(e); await finish(1); }
});
