// Strict local HTTPS + ordinary page-owned Firefox. Parent runs when sockets are denied.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, openSync, closeSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
const scratch = '/home/jack/zcash-primitive-loader-scratch', logs = '/home/jack/zcash-primitive-loader-logs';
const tls = '/home/jack/zcash-runtime-artifacts-scratch';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const runRoot = mkdtempSync(join(scratch, 'host-'));
const report = { status: 'failed', runRoot, node: process.version, browser: [], realms: [] };
const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 120000);
const interrupted = () => stop.abort(); process.on('SIGTERM', interrupted); process.on('SIGINT', interrupted);
let server, driver, session, endpoint, socket, driverText = '', driverFailure, bidiId = 0;
const commands = new Map(), realms = new Map();
const gone = new Set();
async function request(path, method = 'GET', body, cleanup = false) {
  const r = await fetch(endpoint + path, { method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: cleanup ? AbortSignal.timeout(10000) : AbortSignal.any([stop.signal, AbortSignal.timeout(15000)]) });
  const value = await r.json(); assert.ok(r.ok && !value.value?.error, JSON.stringify(value)); return value.value;
}
async function bidi(method, params) {
  const id = ++bidiId;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { commands.delete(id); reject(Error('BiDi command deadline')); }, 10000);
    commands.set(id, { resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
  });
  socket.send(JSON.stringify({ id, method, params })); return result;
}
async function state() {
  return request(`/session/${session}/execute/sync`, 'POST', { script: 'return { evidence: window.primitiveEvidence, result: window.completedPrimitiveResult };', args: [] });
}
try {
  const sums = readFileSync(join(root, 'SHA256SUMS'));
  assert.match(process.argv[2] || '', /^[0-9a-f]{64}$/); assert.equal(sha(sums), process.argv[2]);
  report.inventorySha256 = process.argv[2];
  const assets = new Map();
  const verified = join(runRoot, 'verified'); mkdirSync(verified);
  for (const line of sums.toString().trim().split('\n')) {
    assert.match(line, /^[0-9a-f]{64}  [a-zA-Z0-9_./-]+$/);
    const name = line.slice(66); assert.ok(name.split('/').every(p => p && p !== '.' && p !== '..'));
    assert.ok(!assets.has('/' + name));
    const bytes = readFileSync(join(root, name)); assert.equal(sha(bytes), line.slice(0, 64), name);
    assets.set('/' + name, bytes); mkdirSync(dirname(join(verified, name)), { recursive: true }); writeFileSync(join(verified, name), bytes, { flag: 'wx' });
  }
  assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))), sha(assets.get('/host.mjs')));
  const actual = readdirSync(root, { recursive: true, withFileTypes: true }).filter(f => f.isFile()).map(f => join(f.parentPath, f.name).slice(root.length + 1)).sort();
  assert.deepEqual(actual, ['SHA256SUMS', ...[...assets.keys()].map(p => p.slice(1))].sort());
  const cert = readFileSync(join(tls, 'server.crt')), ca = readFileSync(join(tls, 'fixture-ca.crt'));
  const leaf = new X509Certificate(cert), authority = new X509Certificate(ca);
  assert.equal(leaf.ca, false); assert.ok(authority.ca && leaf.verify(authority.publicKey));
  assert.ok(leaf.checkIP('127.0.0.1') && Date.now() < Date.parse(leaf.validTo));
  report.tls = { caSha256: sha(ca), leafSha256: sha(cert), expires: leaf.validTo, strict: true };
  // Local negative fixtures derive only from the authenticated package snapshots.
  const negatives = [];
  for (const [i, target] of ['manifest.json', 'primitive.mjs', 'worker.mjs', 'bindings_bg.wasm', 'extra-module', 'extra-worker'].entries()) {
    const prefix = '/negative-' + i + '/';
    const entries = new Map(['manifest.json', 'primitive.mjs', 'worker.mjs', 'bindings_bg.wasm'].map(name => [name, Buffer.from(assets.get('/release/' + name))]));
    let pin = JSON.parse(assets.get('/pin.json')).manifestSha256;
    if (target.startsWith('extra-')) {
      const name = target === 'extra-module' ? 'primitive.mjs' : 'worker.mjs';
      entries.set(name, Buffer.concat([entries.get(name), Buffer.from('\nimport "https://127.0.0.1/unlisted.mjs";\n')]));
      const manifest = JSON.parse(entries.get('manifest.json')), file = manifest.files.find(f => f.url === name);
      file.byteLength = entries.get(name).length; file.sha256 = sha(entries.get(name));
      entries.set('manifest.json', Buffer.from(JSON.stringify(manifest))); pin = sha(entries.get('manifest.json'));
    } else entries.get(target)[0] ^= 1;
    for (const [name, bytes] of entries) assets.set(prefix + name, bytes);
    negatives.push({ path: prefix + 'manifest.json', manifestSha256: pin });
  }
  assets.set('/negative.json', Buffer.from(JSON.stringify(negatives)));
  const routes = [];
  server = createServer({ cert, key: readFileSync(join(tls, 'server.key')) }, (req, res) => {
    routes.push(req.url);
    const page = ['/', '/blocked/', '/no-wasm/'].includes(req.url);
    const bytes = assets.get(page ? '/index.html' : req.url);
    if (req.method !== 'GET' || !bytes) { res.writeHead(404).end(); return; }
    const csp = `default-src 'none'; script-src 'self' blob:${req.url === '/no-wasm/' ? '' : " 'wasm-unsafe-eval'"}; worker-src ${req.url === '/blocked/' ? "'none'" : 'blob:'}; connect-src 'self'; base-uri 'none'; object-src 'none'`;
    res.writeHead(200, { 'content-type': page ? 'text/html' : req.url.endsWith('.wasm') ? 'application/wasm' : ['.js', '.mjs'].includes(extname(req.url)) ? 'text/javascript' : 'application/json',
      'cache-control': 'no-store', ...(page ? { 'content-security-policy': csp } : {}) }); res.end(bytes);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `https://127.0.0.1:${server.address().port}`;
  for (const path of ['/favicon.ico', '/missing.mjs']) assert.equal((await fetch(origin + path)).status, 404);
  // Real native Node fetch/HTTPS and native worker; no test fetch replacement.
  const { openPrimitive } = await import(pathToFileURL(join(verified, 'src/runtime/primitive-loader.js')));
  const n = await import(pathToFileURL(join(verified, 'network-cases.mjs'))), tx = await import(pathToFileURL(join(verified, 'transaction-cases.mjs')));
  const pin = JSON.parse(assets.get('/pin.json')), vectors = JSON.parse(assets.get('/transaction-vectors.json'));
  for (const fixture of negatives) await assert.rejects(openPrimitive({ manifestUrl: origin + fixture.path, manifestSha256: fixture.manifestSha256 }), e => e.code === 'RUNTIME_UNAVAILABLE');
  report.nodeIntegrityRejections = negatives.length;
  const runtime = await openPrimitive({ manifestUrl: origin + '/release/manifest.json', manifestSha256: pin.manifestSha256 });
  try { report.nodeHttps = { network: await n.run(runtime.consensusContext), transaction: await tx.run(runtime.decodeTransaction, vectors) }; }
  finally { await runtime.close(); }
  const profile = join(runRoot, 'profile'); mkdirSync(profile);
  const certutil = join(tls, 'nss-tools/usr/bin/certutil');
  assert.equal(sha(readFileSync(certutil)), '84ebeb30599c135576ce3410649dd76db60f4082ae4c015340c8a711c08c52c4');
  const fd = openSync(join(runRoot, 'nss.log'), 'wx');
  try {
    execFileSync(certutil, ['-N', '-d', 'sql:' + profile, '--empty-password'], { stdio: ['ignore', fd, fd] });
    execFileSync(certutil, ['-A', '-d', 'sql:' + profile, '-n', 'primitive-fixture', '-t', 'C,,', '-i', join(tls, 'fixture-ca.crt')], { stdio: ['ignore', fd, fd] });
  } finally { closeSync(fd); }
  driver = spawn('/snap/bin/geckodriver', ['--host', '127.0.0.1', '--port', '0', '--profile-root', runRoot], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  driver.on('error', e => { driverFailure = e; }); driver.on('exit', (code, signal) => { driverFailure = Error(`driver ${code}/${signal}`); });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', b => { driverText += b; });
  const until = Date.now() + 15000;
  while (!endpoint) {
    stop.signal.throwIfAborted(); if (driverFailure) throw driverFailure;
    const port = driverText.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];
    if (port) endpoint = `http://127.0.0.1:${port}`;
    else { assert.ok(Date.now() < until, 'driver deadline'); await delay(50); }
  }
  const value = await request('/session', 'POST', { capabilities: { alwaysMatch: { browserName: 'firefox', acceptInsecureCerts: false, webSocketUrl: true,
    'moz:firefoxOptions': { args: ['-headless', '-profile', profile] } } } });
  session = value.sessionId; report.capabilities = value.capabilities;
  assert.equal(value.capabilities.acceptInsecureCerts, false); assert.equal(value.capabilities['moz:profile'], profile);
  socket = new WebSocket(value.capabilities.webSocketUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id) { const command = commands.get(msg.id); commands.delete(msg.id); msg.type === 'error' ? command?.reject(Error(JSON.stringify(msg))) : command?.resolve(msg.result); }
    if (msg.method === 'script.realmCreated') { realms.set(msg.params.realm, msg.params); report.realms.push(msg); }
    if (msg.method === 'script.realmDestroyed') { gone.add(msg.params.realm); report.realms.push(msg); }
  };
  await bidi('session.subscribe', { events: ['script.realmCreated', 'script.realmDestroyed'] });
  for (const path of ['/', '/blocked/', '/no-wasm/']) {
    await request(`/session/${session}/url`, 'POST', { url: origin + path });
    await request(`/session/${session}/execute/sync`, 'POST', { script: 'window.primitiveResult.then(value => { window.completedPrimitiveResult = value; }); return true;', args: [] });
    let acknowledged = 0;
    for (;;) {
      stop.signal.throwIfAborted(); const value = await state();
      if (value.evidence?.startupAbortPending) {
        const url = value.evidence.workers.at(-1);
        if ([...realms.values()].some(r => r.type === 'dedicated-worker' && r.origin === url && !gone.has(r.realm)))
          await request(`/session/${session}/execute/sync`, 'POST', { script: 'window.abortPrimitiveStartup(); return true;', args: [] });
      }
      if (value.evidence?.closures > acknowledged) {
        const urls = value.evidence.workers;
        const workers = [...realms.values()].filter(r => r.type === 'dedicated-worker' && urls.includes(r.origin));
        if (workers.length === urls.length && workers.every(r => gone.has(r.realm))) {
          for (const r of workers) assert.ok(r.owners?.some(id => realms.get(id)?.type === 'window' && realms.get(id)?.origin === origin), 'ordinary page-owned worker realm');
          acknowledged++;
          await request(`/session/${session}/execute/sync`, 'POST', { script: 'window.acknowledgePrimitiveClosure(); return true;', args: [] });
        }
      }
      if (value.result) {
        assert.ok(!value.result.error, JSON.stringify(value.result)); report.browser.push({ path, ...value.result.result }); break;
      }
      await delay(30);
    }
  }
  report.routes = routes; report.status = 'passed';
} catch (error) { report.error = { name: error.name, message: error.message, stack: error.stack }; }
finally {
  clearTimeout(timer); socket?.close();
  const cleanup = { sessionDeleted: !session, driverGroupGone: !driver?.pid, serverClosed: !server?.listening };
  if (session) try { await request(`/session/${session}`, 'DELETE', undefined, true); cleanup.sessionDeleted = true; } catch (e) { report.cleanupError = String(e); }
  if (driver?.pid) {
    try { process.kill(-driver.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') report.cleanupError = String(e); }
    for (let i = 0; i < 50; i++) {
      try { process.kill(-driver.pid, 0); } catch (e) { if (e.code === 'ESRCH') { cleanup.driverGroupGone = true; break; } }
      await delay(50);
    }
    if (!cleanup.driverGroupGone) { try { process.kill(-driver.pid, 'SIGKILL'); } catch {} await delay(100); try { process.kill(-driver.pid, 0); } catch (e) { cleanup.driverGroupGone = e.code === 'ESRCH'; } }
  }
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  cleanup.serverClosed = !server?.listening; report.cleanup = cleanup;
  if (!Object.values(cleanup).every(Boolean) || report.cleanupError) report.status = 'failed';
  process.removeListener('SIGTERM', interrupted); process.removeListener('SIGINT', interrupted);
  const path = join(logs, `host-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n'); writeFileSync(path + '.driver.log', driverText);
  console.log(JSON.stringify({ path, status: report.status, error: report.error, cleanup }));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
