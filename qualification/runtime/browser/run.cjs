// Disposable browser runner. Existing Playwright/browser paths are explicit; installs nothing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');
const { runOwnedWorker } = require('./worker-owner.cjs');
const { values } = parseArgs({ options: {
  bindings: { type: 'string' }, playwright: { type: 'string' }, chromium: { type: 'string' },
  evidence: { type: 'string' }, 'inventory-only': { type: 'boolean', default: false },
} });
for (const name of ['bindings', 'playwright', 'chromium', 'evidence']) {
  if (!values[name]) throw new Error(`--${name} is required`);
  values[name] = path.resolve(values[name]);
}
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = [
  ...['qualification.js', 'qualification_bg.wasm', 'loader.mjs', 'runtime-host.mjs']
    .map(name => path.join(values.bindings, 'web', name)),
  ...['run.cjs', 'worker-owner.cjs', 'worker.mjs', 'test-worker-owner.cjs'].map(name => path.join(__dirname, name)),
  path.join(values.bindings, 'consumer-provenance.json'),
  path.join(values.playwright, 'package.json'), values.chromium,
];
const consumer = JSON.parse(fs.readFileSync(path.join(values.bindings, 'consumer-provenance.json')));
const generatedProvenance = path.join(consumer.generated_stage, 'provenance.json');
assert.equal(digest(generatedProvenance), consumer.generated_provenance_sha256, 'producing build provenance');
files.push(generatedProvenance);
for (const [name, expected] of Object.entries(consumer.files)) {
  if (name.startsWith('web/')) assert.equal(digest(path.join(values.bindings, name)), expected, name);
}
const snapshot = () => Object.fromEntries(files.map(file => [file, digest(file)]));
const evidence = { started: new Date().toISOString(), argv: process.argv, cwd: process.cwd(),
  tmpdir: process.env.TMPDIR, node: process.version, inputHashes: snapshot(),
  sandboxEnabled: true, results: [], status: 'pending', browserExecution: false };
fs.mkdirSync(values.evidence, { recursive: true });
const output = path.join(values.evidence, `browser-${Date.now()}.json`);
function save() { fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n'); }
save();

async function runCase(page, scenario) {
  const observed = page.waitForEvent('worker', { timeout: 10000 });
  // Register event observation before creating the genuine browser module worker.
  const [worker] = await Promise.all([observed, page.evaluate(() => {
    self.qualificationWorker = new Worker('/worker.mjs', { type: 'module' });
    self.qualificationResult = new Promise(resolve => {
      self.qualificationWorker.onmessage = ({ data }) => resolve(data);
      self.qualificationWorker.onerror = event => resolve({ ok: false, error: event.message });
    });
  })]);
  evidence.browserExecution = true;
  const result = await runOwnedWorker({ worker,
    operation: () => page.evaluate(scenario => {
      self.qualificationWorker.postMessage(scenario);
      return self.qualificationResult;
    }, scenario),
    terminate: () => page.evaluate(() => self.qualificationWorker.terminate()),
    timeoutMs: 60000,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.scenario, scenario);
  result.observedWorkerDestruction = true;
  return result;
}

(async () => {
  const wasm = new WebAssembly.Module(fs.readFileSync(path.join(values.bindings, 'web', 'qualification_bg.wasm')));
  const { inventory } = await import(pathToFileURL(path.join(values.bindings, 'web', 'loader.mjs')));
  evidence.imports = inventory(wasm);
  evidence.exports = WebAssembly.Module.exports(wasm);
  for (const name of ['rt_init', 'rt_open', 'rt_sql', 'rt_rows', 'rt_pairing', 'rt_cycle',
    'rt_fixture_schema_count', 'rt_pool_start', 'rt_pool_size', 'rt_pool_check', 'rt_oom',
    'rt_grow', 'rt_heap_ptr', 'rt_heap_check', 'rt_hosts', 'rt_time', 'rt_unsupported_hosts']) {
    assert(evidence.exports.some(entry => entry.name === name && entry.kind === 'function'), name);
  }
  if (values['inventory-only']) {
    evidence.status = 'inventory-only; browser not executed';
    save();
    console.log(output);
    return;
  }
  let browser;
  let server;
  try {
    const { chromium } = require(values.playwright);
    browser = await chromium.launch({ executablePath: values.chromium, headless: true, chromiumSandbox: true });
    evidence.browserVersion = browser.version();
    const routes = new Map([['/worker.mjs', path.join(__dirname, 'worker.mjs')]]);
    for (const name of ['qualification.js', 'qualification_bg.wasm', 'loader.mjs', 'runtime-host.mjs']) {
      routes.set(`/bindings/${name}`, path.join(values.bindings, 'web', name));
    }
    server = http.createServer((req, res) => {
      // No COOP/COEP: this explicitly exercises the no-SAB baseline.
      res.setHeader('Cache-Control', 'no-store');
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Disposable browser qualification</title>');
      } else if (routes.has(req.url)) {
        res.setHeader('Content-Type', req.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(fs.readFileSync(routes.get(req.url)));
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    evidence.origin = origin;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // This fixture needs only the exact local asset set.
    await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin);
    for (const scenario of ['same-instance', 'fresh-after-destruction', 'omitted-pool',
      'entropy-unavailable', 'entropy-loss', 'unknown-import', 'pool-canary-corruption', 'heap-corruption']) {
      const result = await runCase(page, scenario);
      evidence.results.push(result);
      console.log(JSON.stringify(result));
      save();
    }
    evidence.status = 'passed bounded browser memdb fixtures; F1/F2/F3 remain unqualified';
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = String(error);
    evidence.stack = error.stack;
    process.exitCode = 1;
    console.error(error);
  } finally {
    try {
      try { if (browser) await browser.close(); }
      finally { if (server?.listening) await new Promise(resolve => server.close(resolve)); }
      evidence.finalInputHashes = snapshot();
      assert.deepEqual(evidence.finalInputHashes, evidence.inputHashes, 'inputs changed during execution');
    } catch (error) {
      evidence.status = 'failed';
      evidence.cleanupError = String(error);
      process.exitCode = 1;
    } finally {
      evidence.finished = new Date().toISOString();
      save();
      console.log(output);
    }
  }
})().catch(error => {
  evidence.status = 'failed';
  evidence.error = String(error);
  evidence.finished = new Date().toISOString();
  save();
  console.error(error);
  process.exitCode = 1;
});
