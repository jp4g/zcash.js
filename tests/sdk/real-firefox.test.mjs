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
test('Firefox result gate is red for eager initialization and missing claims', () => {
  assert.throws(() => verifyResult({ ok: true }), /claims/);
  assert.throws(() => verifyResult({ ok: true, claims: [], eager: { Worker: 1 } }), /claims/);
});

import { guarded } from './real-firefox-browser.mjs';
import { claims } from './real-firefox-support.mjs';
test('no-eager gate restores globals and detects even swallowed accesses', async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
  await assert.rejects(guarded(async () => { try { void globalThis.Worker; } catch {} }), /eager initialization/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly'), before);
  const counts = await guarded(async () => {});
  assert.ok(Object.values(counts).every(n => n === 0));
  const valid = { ok: true, pczts:Array.from({length:2},()=>({methods:5,v5:true,v6:true,structuralOnly:true,cancelled:2})), signers:Array.from({length:2},()=>({methods:3,ownedBytes:true,actualViewing:true,cancelled:2,verifiedAuthorization:false})), birthdays:Array.from({length:2},()=>({nativeValidated:true,nonpalindromicGenesis:true,cancelled:2})), viewing:Array.from({length:2},()=>({operations:7,independentAuthorities:3,cancelled:2,unknownReceivers:true})), publicClients:[{methods:11,cancelled:1,broadcastUnknown:1},{methods:11,cancelled:1,broadcastUnknown:1}], light:[{methods:11,cancelled:2,broadcastUnknown:1},{methods:11,cancelled:2,broadcastUnknown:1}], claims, eager: counts, precision: '9007199254740993', utf8: '€雪😀', negativeEager: 1, network: { modules: 2, instances: 2, fetches: 0, workers: 0, descriptors: 2, cancelled: 4 } };
  assert.doesNotThrow(() => verifyResult(valid));
  assert.throws(() => verifyResult({ ...valid, eager: { ...counts, Worker: 1 } }));
  assert.throws(() => verifyResult({ ...valid, network: { ...valid.network, modules: 0 } }));
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

// Execute the runner's actual finalization, with only OS operations substituted.
async function receipt(status, removalError) {
  const source = await readFile(new URL('./real-firefox-run.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.lastIndexOf('} finally {') + 11, source.lastIndexOf('}'));
  const writes = [];
  const process = { removeListener() {} };
  const env = { deadline: undefined, clearTimeout, session: undefined, driverIdentity: undefined,
    browserIdentity: undefined, alive: async () => false, timers: [], server: undefined,
    report: { status }, requests: [], unexpected: [], driverText: '', resultPath: '/fixture/result.json',
    runRoot: '/fixture', join, onSignal() {}, process, console: { log() {} },
    rm: async () => { if (removalError) throw Error('consumer rm EACCES'); },
    writeFile: async (path, bytes) => { if (path.endsWith('.json')) writes.push(JSON.parse(bytes)); },
  };
  await new (Object.getPrototypeOf(async () => {}).constructor)(...Object.keys(env), body)(...Object.values(env));
  assert.equal(writes.length, 1);
  return { report: writes[0], exitCode: process.exitCode };
}
test('consumer removal failure is accounted before the final receipt', async () => {
  const good = await receipt('passed', false);
  assert.equal(good.report.status, 'passed'); assert.equal(good.exitCode, 0);
  const bad = await receipt('passed', true);
  assert.equal(bad.report.status, 'failed'); assert.equal(bad.exitCode, 1);
  assert.match(bad.report.cleanup.cleanupErrors.join(), /EACCES/);
});

test('stalled Vite build is destroyed on deadline and interruption, then records failure', { timeout: 15000 }, async () => {
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
      const failed = await receipt('failed', false);
      assert.equal(failed.report.status, 'failed'); assert.equal(failed.exitCode, 1);
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});
