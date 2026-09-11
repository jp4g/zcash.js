// Foreground WebDriver run, adapted from accepted scanner Firefox patterns.
// Runs in the page realm: no threads, persistence, or worker-lifecycle claim.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, realpath } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, sha } from './bundle.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const [expected, output] = process.argv.slice(2);
if (!/^[a-f0-9]{64}$/.test(expected ?? '') || !output) throw Error('usage: run-browser.mjs MANIFEST_SHA256 OUTPUT');
const runRoot = await mkdtemp('/home/jack/zcash-transaction-codec-scratch/firefox-');
const receipt = { runtime: 'Browser', argv: process.argv, node: process.version,
  started: new Date().toISOString(), manifest_sha256: expected, runRoot, ok: false };
const stop = new AbortController();
const deadline = setTimeout(() => stop.abort(Error('browser deadline exceeded')), 120000);
const onSignal = () => stop.abort(Error('browser run interrupted'));
process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
const delay = ms => new Promise(done => setTimeout(done, ms));
let server, driver, driverExit, driverFailure, endpoint, session, browserIdentity;
let driverText = '';
async function identity(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    return { pid, startTime: fields[19], state: fields[0] };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function request(route, method = 'GET', body, cleanup = false) {
  const response = await fetch(endpoint + route, { method,
    signal: cleanup ? AbortSignal.timeout(10000) : AbortSignal.any([stop.signal, AbortSignal.timeout(45000)]),
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw Error(`WebDriver ${route}: ${JSON.stringify(data)}`);
  return data.value;
}
try {
  const { manifest, assets } = await loadBundle(root, expected);
  receipt.manifest = manifest;
  receipt.runner_sha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  receipt.binaries = {};
  for (const name of ['firefox-bin', 'geckodriver']) {
    const path = await realpath('/snap/firefox/current/usr/lib/firefox/' + name);
    receipt.binaries[path] = sha(await readFile(path));
  }
  server = createServer((req, res) => {
    const path = req.url === '/' ? '/browser.html' : req.url;
    const bytes = assets.get(path);
    if (req.method !== 'GET' || !bytes) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
        '.wasm': 'application/wasm', '.json': 'application/json' }[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
    });
    res.end(bytes);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  receipt.origin = origin;
  // Exercise 404 paths without throwing after success headers or skipping cleanup.
  for (const name of ['favicon.ico', 'missing.mjs']) {
    const response = await fetch(`${origin}/${name}`, { signal: stop.signal });
    if (response.status !== 404) throw Error('missing asset was served');
    await response.arrayBuffer();
  }
  const args = ['--host', '127.0.0.1', '--port', '0', '--profile-root', runRoot];
  receipt.launch = { command: '/snap/bin/geckodriver', args, firefoxOptions: { args: ['-headless'] }, sandbox: 'unchanged' };
  driver = spawn('/snap/bin/geckodriver', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  driverExit = new Promise(done => {
    driver.once('error', error => { driverFailure = error; done(); });
    driver.once('exit', (code, signal) => { driverFailure = Error(`driver exit ${code}/${signal}`); done(); });
  });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', bytes => { driverText += bytes; });
  const until = Date.now() + 15000;
  while (!endpoint) {
    stop.signal.throwIfAborted();
    if (driverFailure) throw driverFailure;
    const match = driverText.match(/Listening on 127\.0\.0\.1:(\d+)/);
    if (match) endpoint = `http://127.0.0.1:${match[1]}`;
    else if (Date.now() > until) throw Error('driver listener deadline exceeded');
    else await delay(30);
  }
  const created = await request('/session', 'POST', { capabilities: { alwaysMatch: {
    browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] },
  } } });
  session = created.sessionId;
  receipt.capabilities = created.capabilities;
  const pid = created.capabilities['moz:processID'];
  if (!Number.isInteger(pid) || pid <= 0) throw Error('missing Firefox process identity');
  browserIdentity = await identity(pid);
  if (created.capabilities.browserName !== 'firefox' || !session || !browserIdentity) throw Error('Firefox capability missing');
  await request(`/session/${session}/timeouts`, 'POST', { script: 30000, pageLoad: 15000, implicit: 0 });
  await request(`/session/${session}/url`, 'POST', { url: origin });
  const observed = await request(`/session/${session}/execute/async`, 'POST', {
    script: "const done=arguments[arguments.length-1]; import('./browser-entry.mjs').then(m=>m.run()).then(value=>done({ok:true,value}),e=>done({ok:false,name:e?.name,message:String(e?.message??e),stack:e?.stack}));", args: [],
  });
  receipt.observed = observed;
  if (!observed.ok || !observed.value.result.ok || observed.value.result.vectors.length !== 13) throw Error(`browser cases failed: ${JSON.stringify(observed)}`);
  await loadBundle(root, expected);
  receipt.ok = true;
} catch (error) {
  receipt.error = { name: error.name, message: error.message, stack: error.stack };
} finally {
  clearTimeout(deadline);
  const cleanup = { sessionDeleted: !session, driverGone: !driver?.pid, browserGone: !browserIdentity };
  try {
    if (session) { await request(`/session/${session}`, 'DELETE', undefined, true); cleanup.sessionDeleted = true; }
  } catch (error) { receipt.cleanupError = String(error); }
  if (driver?.pid) {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try { process.kill(-driver.pid, signal); } catch (error) { if (error.code !== 'ESRCH') receipt.cleanupError = String(error); }
      await Promise.race([driverExit, delay(1000)]);
    }
    try { process.kill(-driver.pid, 0); } catch (error) { if (error.code === 'ESRCH') cleanup.driverGone = true; }
  }
  if (browserIdentity) {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const current = await identity(browserIdentity.pid);
      if (!current || current.startTime !== browserIdentity.startTime || current.state === 'Z') { cleanup.browserGone = true; break; }
      try { process.kill(browserIdentity.pid, signal); } catch (error) { if (error.code !== 'ESRCH') receipt.cleanupError = String(error); }
      await delay(250);
    }
    const current = await identity(browserIdentity.pid);
    cleanup.browserGone = !current || current.startTime !== browserIdentity.startTime || current.state === 'Z';
  }
  if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  cleanup.serverClosed = !server?.listening;
  receipt.cleanup = cleanup;
  receipt.ok &&= Object.values(cleanup).every(Boolean) && !receipt.cleanupError;
  process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
  receipt.finished = new Date().toISOString();
  await writeFile(resolve(output) + '.driver.log', driverText, { flag: 'wx' });
  await writeFile(resolve(output), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ runtime: 'Browser', ok: receipt.ok, output: resolve(output), error: receipt.error }));
  process.exitCode = receipt.ok ? 0 : 1;
}
