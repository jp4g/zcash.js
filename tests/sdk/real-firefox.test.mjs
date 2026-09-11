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
  const valid = { ok: true, claims, eager: counts, precision: '9007199254740993', utf8: '€雪😀', negativeEager: 1 };
  assert.doesNotThrow(() => verifyResult(valid));
  assert.throws(() => verifyResult({ ...valid, eager: { ...counts, Worker: 1 } }));
});
