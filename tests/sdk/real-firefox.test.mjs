import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAssets, verifyResult } from './real-firefox-support.mjs';
import { createHash } from 'node:crypto';
const bytes = Buffer.from('export const value = 1;');
const manifest = { files: { '/bundle.mjs': { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } } };
test('Firefox artifact gate rejects changed or missing served bytes', () => {
  assert.doesNotThrow(() => verifyAssets(manifest, new Map([['/bundle.mjs', bytes]])));
  assert.throws(() => verifyAssets(manifest, new Map([['/bundle.mjs', Buffer.from('bad')]])), /integrity/);
  assert.throws(() => verifyAssets(manifest, new Map()), /integrity/);
});
test('Firefox result gate rejects missing claims', () => {
  assert.throws(() => verifyResult({ ok: true }), /claims/);
});

import { guarded } from './real-firefox-browser.mjs';
test('no-eager gate restores globals and detects even swallowed accesses', async () => {
  // Finish Node's own lazy HTTP/WASM initialization before trapping SDK access.
  const { createServer } = await import('node:http');
  const server = createServer((_request, response) => response.end('ready'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await (await fetch(`http://127.0.0.1:${server.address().port}`)).text(); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const before = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
  await assert.rejects(guarded(async () => { try { void globalThis.Worker; } catch {} }), /eager initialization/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly'), before);
  const counts = await guarded(async () => {});
  assert.ok(Object.values(counts).every(n => n === 0));
});

import { sanitized } from './real-firefox-browser.mjs';
import { failure, isZcashError } from '../../dist/src/errors.js';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('sanitization rejects branded private message/stack and enumerable data', () => {
  const clean = failure('METHOD_NOT_SUPPORTED', 'transport', 'correct-input', 'Fixed text.');
  const leaked = failure('METHOD_NOT_SUPPORTED', 'transport', 'correct-input', 'private-fixture');
  assert.ok(isZcashError(leaked));
  assert.equal(Object.getOwnPropertyDescriptor(leaked, 'message').enumerable, false);
  assert.equal(JSON.stringify(leaked).includes('private-fixture'), false); // old gate stayed green
  assert.doesNotThrow(() => sanitized(clean));
  assert.throws(() => sanitized(leaked), /sanitized/);
  assert.throws(() => sanitized({ message: 'Fixed', stack: 'private-fixture' }), /sanitized/);
  assert.throws(() => sanitized({ message: 'Fixed', data: 'private-fixture' }), /sanitized/);
});

test('stalled Vite build is destroyed on cancellation', { timeout: 15000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'firefox-stalled-'));
  try {
    // A real Vite buildStart hook holds a live handle and never resolves.
    const source = (await readFile(new URL('./real-firefox-build.mjs', import.meta.url), 'utf8'))
      .replace("import('vite')", `import(${JSON.stringify(import.meta.resolve('vite'))})`)
      .replace("configFile: false,", `plugins: [{ name: 'stalled-control', async buildStart() {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(consumer, 'started'), String(process.pid));
        setInterval(() => {}, 1000);
        await new Promise(() => {});
      } }], configFile: false,`);
    const helper = join(folder, 'real-firefox-build.mjs');
    await writeFile(helper, source);
    const { bundle } = await import(pathToFileURL(helper));
    for (const reason of ['suite deadline', 'interrupted']) {
      const consumer = join(folder, reason); await mkdir(consumer);
      await writeFile(join(consumer, 'entry.mjs'), 'export const value = 1;');
      const controller = new AbortController();
      const result = bundle(consumer, controller.signal);
      const rejected = assert.rejects(result, new RegExp(reason));
      const until = Date.now() + 5000;
      let pid;
      while (!pid) {
        try { pid = Number(await readFile(join(consumer, 'started'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        assert.ok(Date.now() < until, 'stalled build started');
        await new Promise(done => setTimeout(done, 20));
      }
      controller.abort(Error(reason));
      await rejected;
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});
