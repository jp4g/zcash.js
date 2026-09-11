// Local fixture server + installed geckodriver; no dependencies or security overrides.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
const logs = '/home/jack/zcash-network-parameters-logs';
const scratch = '/home/jack/zcash-network-parameters-scratch';
const runRoot = await mkdtemp(join(scratch, 'firefox-'));
const report = { status: 'failed', runRoot, node: process.version };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, driver, session, endpoint, driverText = '', driverError;
const stop = new AbortController();
const deadline = setTimeout(() => stop.abort(Error('Firefox deadline')), 90000);
const onSignal = () => stop.abort(Error('interrupted'));
process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
async function request(path, method = 'GET', body, cleanup = false) {
  const response = await fetch(endpoint + path, { method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: cleanup ? AbortSignal.timeout(10000) : AbortSignal.any([stop.signal, AbortSignal.timeout(30000)]) });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw Error(JSON.stringify(json));
  return json.value;
}
try {
  const files = (await readFile(join(root, 'SHA256SUMS'), 'utf8')).trim().split('\n').map(line => line.slice(66));
  const assets = new Map(await Promise.all(files.map(async file => ['/' + file, await readFile(join(root, file))])));
  assets.set('/', Buffer.from('<!doctype html><title>Network parameter qualification</title>'));
  server = createServer((req, res) => {
    const bytes = assets.get(req.url);
    if (req.method !== 'GET' || !bytes) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })[extname(req.url)] || 'text/html', 'Cache-Control': 'no-store' });
    res.end(bytes);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  driver = spawn('/snap/bin/geckodriver', ['--host', '127.0.0.1', '--port', '0', '--profile-root', runRoot], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  driver.on('error', error => { driverError = error; });
  driver.on('exit', (code, signal) => { driverError = Error(`geckodriver ${code}/${signal}`); });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', bytes => { driverText += bytes; });
  const until = Date.now() + 15000;
  while (!endpoint) {
    stop.signal.throwIfAborted(); if (driverError) throw driverError;
    const port = driverText.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];
    if (port) endpoint = `http://127.0.0.1:${port}`;
    else { assert.ok(Date.now() < until, 'driver startup timeout'); await delay(50); }
  }
  const value = await request('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } });
  session = value.sessionId; report.capabilities = value.capabilities;
  assert.equal(value.capabilities.browserName, 'firefox'); assert.ok(session);
  await request(`/session/${session}/timeouts`, 'POST', { script: 30000, pageLoad: 15000, implicit: 0 });
  await request(`/session/${session}/url`, 'POST', { url: `http://127.0.0.1:${server.address().port}/` });
  const result = await request(`/session/${session}/execute/async`, 'POST', {
    script: "const done=arguments[arguments.length-1]; import('/browser.mjs').then(m=>m.run()).then(result=>done({result}),e=>done({error:String(e),stack:e.stack}));", args: [] });
  assert.ok(!result.error, JSON.stringify(result)); assert.ok(result.result.cases > 100);
  report.result = result.result; report.status = 'passed';
} catch (error) { report.error = String(error); }
finally {
  clearTimeout(deadline);
  const cleanup = { sessionDeleted: !session, driverGroupGone: !driver?.pid, serverClosed: false };
  if (session) try { await request(`/session/${session}`, 'DELETE', undefined, true); cleanup.sessionDeleted = true; } catch (e) { report.cleanupError = String(e); }
  if (driver?.pid) {
    try { process.kill(-driver.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') report.cleanupError = String(e); }
    for (let i = 0; i < 40; i++) {
      try { process.kill(-driver.pid, 0); } catch (e) { if (e.code === 'ESRCH') { cleanup.driverGroupGone = true; break; } }
      await delay(50);
    }
    if (!cleanup.driverGroupGone) {
      try { process.kill(-driver.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') report.cleanupError = String(e); }
      await delay(100);
      try { process.kill(-driver.pid, 0); } catch (e) { if (e.code === 'ESRCH') cleanup.driverGroupGone = true; }
    }
  }
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  cleanup.serverClosed = !server?.listening;
  if (!Object.values(cleanup).every(Boolean) || report.cleanupError) report.status = 'failed';
  report.cleanup = cleanup;
  process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
  const path = join(logs, `firefox-${Date.now()}.json`);
  await writeFile(path + '.driver.log', driverText);
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ path, ...report }));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
