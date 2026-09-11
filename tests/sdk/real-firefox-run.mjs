// Packaged Firefox only; no installs, external providers or security overrides.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { openSync, closeSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { firefoxOptions } from '../../qualification/browser-runtime/firefox-options.mjs';
import { sha, verifyAssets, verifyResult } from './real-firefox-support.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const argv = process.argv.slice(2);
const allowed = ['--logs', '--scratch', '--geckodriver', '--prepare-only'];
for (let i = 0; i < argv.length; i++) {
  assert.ok(allowed.includes(argv[i]), `unknown option ${argv[i]}`);
  if (argv[i] !== '--prepare-only') assert.ok(argv[++i] && !argv[i].startsWith('--'), 'option requires value');
}
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const logs = resolve(option('--logs', '/home/jack/zcash-agnostic-browser-logs'));
const scratch = resolve(option('--scratch', '/home/jack/zcash-agnostic-browser-scratch'));
const geckodriver = resolve(option('--geckodriver', '/snap/bin/geckodriver'));
await mkdir(logs, { recursive: true }); await mkdir(scratch, { recursive: true });
const runRoot = await mkdtemp(join(scratch, 'real-firefox-'));
const resultPath = join(logs, `${runRoot.split('/').at(-1)}.json`);
const report = { started: new Date().toISOString(), argv, node: process.version, runRoot,
  status: 'failed', claims: [], limits: 'Accepted partial SDK only. Internal readRpc is test access. No public client, CORS, provider, wallet, WASM, #6 or #8 completion.' };
const stop = new AbortController();
const deadline = setTimeout(() => stop.abort(Error('suite deadline 120s')), 120000);
const onSignal = () => stop.abort(Error('interrupted'));
process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
const delay = ms => new Promise(done => setTimeout(done, ms));
let server, driver, endpoint, session, browserIdentity, driverIdentity;
let driverText = '', driverError;
const requests = [], unexpected = [], timers = new Set();
let abortStarted = false;
function command(executable, args, cwd = root) {
  const out = join(runRoot, 'command.stdout'), err = join(runRoot, 'command.stderr');
  const a = openSync(out, 'w'), b = openSync(err, 'w');
  let result;
  try { result = spawnSync(executable, args, { cwd, timeout: 30000, stdio: ['ignore', a, b] }); }
  finally { closeSync(a); closeSync(b); }
  assert.ok(!result.error && result.status === 0, `${executable}: ${result.error || readFileSync(err, 'utf8')}`);
  return readFileSync(out, 'utf8').trim();
}
async function identity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const fields = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ').at(-1).split(' ');
    return { pid, start: fields[19], state: fields[0] };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function alive(owned) {
  const current = owned && await identity(owned.pid);
  return !!current && current.start === owned.start && current.state !== 'Z';
}
async function request(route, method = 'GET', body, cleanup = false) {
  const signal = cleanup ? AbortSignal.timeout(5000) : AbortSignal.any([stop.signal, AbortSignal.timeout(45000)]);
  const response = await fetch(endpoint + route, { method, signal, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.ok(response.ok && !data.value?.error, `WebDriver ${route}: ${JSON.stringify(data)}`);
  return data.value;
}
try {
  const sourceCommit = command('git', ['rev-parse', 'HEAD']);
  const acceptedCommit = command('git', ['rev-parse', 'f604b60^{commit}']);
  command('git', ['diff', '--exit-code', acceptedCommit, '--', 'src', 'tsconfig.json', 'package-lock.json']);
  command('git', ['merge-base', '--is-ancestor', acceptedCommit, sourceCommit]);
  command(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']);
  const [pack] = JSON.parse(command('npm', ['pack', '--offline', '--cache', join(runRoot, 'npm-cache'), '--ignore-scripts', '--json', '--pack-destination', runRoot]));
  assert.ok(pack.files.every(file => !file.path.startsWith('qualification/') && !file.path.startsWith('tests/')));
  const consumer = join(runRoot, 'consumer');
  await mkdir(join(consumer, 'node_modules/zcash.js'), { recursive: true });
  // Extract the locally packed archive directly; no package install or registry access.
  command('tar', ['-xzf', join(runRoot, pack.filename), '--strip-components=1', '-C', join(consumer, 'node_modules/zcash.js')]);
  const packageRoot = join(consumer, 'node_modules/zcash.js');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json')));
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.equal(manifest.exports['.'].import, './dist/src/index.js');
  assert.equal(manifest.dependencies, undefined);
  const entry = join(consumer, 'entry.mjs');
  await writeFile(entry, "import * as sdk from 'zcash.js';\nimport { readRpc } from './node_modules/zcash.js/dist/src/http.js';\nexport { sdk, readRpc };\n");
  const bundled = await build({ configFile: false, logLevel: 'silent', root: consumer, build: {
    write: false, minify: false, target: 'es2022', lib: { entry, formats: ['es'], fileName: 'bundle' } } });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output);
  assert.equal(outputs.length, 1); assert.equal(outputs[0].type, 'chunk');
  const assets = new Map([
    ['/', Buffer.from('<!doctype html><meta charset="utf-8"><title>SDK Firefox qualification</title><link rel="icon" href="data:,">')],
    ['/bundle.mjs', Buffer.from(outputs[0].code)],
    ['/probe.mjs', await readFile(new URL('./real-firefox-browser.mjs', import.meta.url))],
    ['/negative-eager.mjs', Buffer.from("new Worker('/forbidden-worker.mjs');")],
    ['/negative-unsupported.mjs', Buffer.from("import { createPublicClient } from '/package/dist/src/index.js'; export { createPublicClient };")],
  ]);
  async function collect(folder, prefix) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.isDirectory()) await collect(join(folder, item.name), `${prefix}/${item.name}`);
      else if (item.name.endsWith('.js')) assets.set(`${prefix}/${item.name}`, await readFile(join(folder, item.name)));
    }
  }
  await collect(join(packageRoot, 'dist'), '/package/dist');
  report.inputs = { sourceCommit, acceptedCommit, tarballSha256: sha(await readFile(join(runRoot, pack.filename))),
    manifest, files: Object.fromEntries([...assets].map(([name, bytes]) => [name, { sha256: sha(bytes), bytes: bytes.length }])),
    harness: Object.fromEntries(await Promise.all(['run', 'browser', 'support'].map(async name => [name,
      sha(await readFile(new URL(`./real-firefox-${name}.mjs`, import.meta.url)))]))),
    optionsSha256: sha(await readFile(new URL('../../qualification/browser-runtime/firefox-options.mjs', import.meta.url))) };
  verifyAssets(report.inputs, assets);
  // Retain exactly served bytes for coordinator/reviewer inspection.
  for (const [name, bytes] of assets) {
    const path = join(runRoot, 'assets', name === '/' ? 'index.html' : name.slice(1));
    await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, bytes);
  }
  stop.signal.throwIfAborted();
  if (argv.includes('--prepare-only')) {
    report.status = 'prepared-only';
  } else {
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/fixture-state' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ abortStarted })); return;
        }
        if (req.url === '/rpc' && req.method === 'POST') {
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 4096) throw Error('fixture request too large'); }
          const parsed = JSON.parse(body);
          requests.push({ ...parsed, contentType: req.headers['content-type'], methodHTTP: req.method });
          const mode = parsed.params[0];
          res.writeHead(mode === 'rpc-error' ? 500 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          if (mode === 'deadline' || mode === 'abort') { res.write('{'); if (mode === 'abort') abortStarted = true; return; }
          if (mode === 'invalid') { res.end(Buffer.from([0xff])); return; }
          if (mode === 'rpc-error') { res.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id,
            error: { code: -32601, message: 'private-fixture', data: 'private-fixture' } })); return; }
          assert.equal(mode, 'good');
          const bytes = Buffer.from(`{"jsonrpc":"2.0","id":${JSON.stringify(parsed.id)},"result":{"value":9007199254740993,"text":"€雪😀"}}`);
          const split = bytes.indexOf(Buffer.from('€')) + 1;
          res.write(bytes.subarray(0, split));
          const timer = setTimeout(() => { timers.delete(timer); res.end(bytes.subarray(split)); }, 30);
          timers.add(timer); return;
        }
        const bytes = req.method === 'GET' && assets.get(req.url);
        if (!bytes) { unexpected.push({ method: req.method, url: req.url }); res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html' : 'text/javascript',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'; img-src data:; frame-src 'none'; object-src 'none'" });
        res.end(bytes);
      } catch (error) { unexpected.push({ error: String(error) }); res.destroy(); }
    });
    server.requestTimeout = 5000; server.headersTimeout = 5000;
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const driverArgs = ['--host', '127.0.0.1', '--port', '0', '--websocket-port', '0', '--profile-root', runRoot];
    report.launch = { origin, geckodriver, driverArgs, options: firefoxOptions(), sandbox: 'unchanged' };
    driver = spawn(geckodriver, driverArgs, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    driver.on('error', error => { driverError = error; });
    driver.on('exit', (code, signal) => { driverError = Error(`driver exited ${code}/${signal}`); });
    driverIdentity = await identity(driver.pid);
    for (const stream of [driver.stdout, driver.stderr]) stream.on('data', bytes => { driverText += bytes; });
    const until = Date.now() + 15000;
    while (!endpoint) {
      stop.signal.throwIfAborted(); if (driverError) throw driverError;
      const match = driverText.match(/Listening on 127\.0\.0\.1:(\d+)/);
      if (match) endpoint = `http://127.0.0.1:${match[1]}`;
      else { assert.ok(Date.now() < until, 'geckodriver startup deadline'); await delay(30); }
    }
    const value = await request('/session', 'POST', { capabilities: { alwaysMatch: {
      browserName: 'firefox', 'moz:firefoxOptions': firefoxOptions() } } });
    session = value.sessionId; report.capabilities = value.capabilities;
    browserIdentity = await identity(value.capabilities['moz:processID']);
    assert.ok(session && browserIdentity && driverIdentity, 'owned session/process identities');
    assert.equal(value.capabilities.browserName, 'firefox');
    assert.match(value.capabilities.browserVersion, /^155\./);
    assert.match(value.capabilities['moz:geckodriverVersion'], /^0\.37\./);
    await request(`/session/${session}/timeouts`, 'POST', { script: 20000, pageLoad: 15000, implicit: 0 });
    await request(`/session/${session}/url`, 'POST', { url: origin });
    const result = await request(`/session/${session}/execute/async`, 'POST', {
      script: "const done=arguments[arguments.length-1]; import('/probe.mjs').then(m=>m.run()).then(value=>done({value}),e=>done({error:String(e),stack:e.stack}));", args: [] });
    assert.ok(!result.error, JSON.stringify(result));
    verifyResult(result.value);
    assert.deepEqual(requests.map(r => r.params[0]), ['good', 'deadline', 'abort', 'invalid', 'rpc-error']);
    for (const r of requests) {
      assert.equal(r.jsonrpc, '2.0'); assert.equal(r.method, 'getblockhash');
      assert.equal(typeof r.id, 'string'); assert.ok(r.id.length);
      assert.deepEqual(r.params.slice(1), [7, true, '€']);
      assert.equal(r.contentType, 'application/json'); assert.equal(r.methodHTTP, 'POST');
    }
    // IDs are unique on the same transport; separate transports have independent sequences.
    assert.notEqual(requests[0].id, requests[2].id); assert.notEqual(requests[2].id, requests[3].id);
    assert.deepEqual(unexpected, []);
    report.processIdentities = { driver: driverIdentity, browser: browserIdentity };
    report.browserResult = result.value; report.claims = result.value.claims; report.status = 'passed';
  }
} catch (error) {
  report.error = { message: String(error), code: error.code, stack: error.stack };
  if (['EPERM', 'EACCES'].includes(error.code)) report.hostCommand = 'npm run test:sdk:real-firefox -- --logs /home/jack/zcash-agnostic-browser-logs --scratch /home/jack/zcash-agnostic-browser-scratch --geckodriver /snap/bin/geckodriver';
} finally {
  clearTimeout(deadline);
  const cleanupErrors = [];
  let sessionDeleted = !session;
  if (session) try { await request(`/session/${session}`, 'DELETE', undefined, true); sessionDeleted = true; }
  catch (error) { cleanupErrors.push(String(error)); }
  // Same measured process-group + PID/start-time approach as browser-runtime.
  // Signal only our still-identifiable group leader; never scan/kill by process name.
  if (driverIdentity) {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const current = await identity(driverIdentity.pid);
      if (!current || current.start === driverIdentity.start) {
        try { process.kill(-driverIdentity.pid, signal); }
        catch (error) { if (error.code !== 'ESRCH') cleanupErrors.push(String(error)); }
      } else cleanupErrors.push('driver PID reused; refusing to signal unrelated group');
      await delay(300);
    }
  }
  if (browserIdentity) for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (await alive(browserIdentity)) try { process.kill(browserIdentity.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') cleanupErrors.push(String(error)); }
    await delay(300);
  }
  let processGroupGone = !driverIdentity;
  const cleanupUntil = Date.now() + 3000;
  while (driverIdentity && !processGroupGone && Date.now() < cleanupUntil) {
    try { process.kill(-driverIdentity.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') processGroupGone = true; else { cleanupErrors.push(String(error)); break; } }
    if (!processGroupGone) await delay(30);
  }
  const browserProcessGone = !await alive(browserIdentity);
  for (const timer of timers) clearTimeout(timer);
  if (server?.listening) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.cleanup = { sessionDeleted, processGroupGone, browserProcessGone, serverClosed: !server?.listening, cleanupErrors };
  if (!sessionDeleted || !processGroupGone || !browserProcessGone || cleanupErrors.length) report.status = 'failed';
  report.requests = requests; report.unexpected = unexpected;
  report.finished = new Date().toISOString();
  await writeFile(resultPath.replace(/\.json$/, '.driver.log'), driverText);
  await writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
  // Keep artifacts/evidence; remove only this run's temporary consumer and browser profiles on success.
  if (report.status === 'passed') await rm(join(runRoot, 'consumer'), { recursive: true, force: true });
  process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  console.log(JSON.stringify({ status: report.status, resultPath, error: report.error, hostCommand: report.hostCommand }));
  process.exitCode = ['passed', 'prepared-only'].includes(report.status) ? 0 : 1;
}
