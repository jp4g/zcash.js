import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const bytes = await readFile(process.argv[2] || '/home/jack/zcash-browser-runtime-logs/firefox-1789136669817.json');
const original = JSON.parse(bytes);
const temp = await mkdtemp(join('/home/jack/zcash-browser-runtime-scratch', 'firefox-verifier-'));
const verifier = new URL('./verify-firefox.mjs', import.meta.url).pathname;
async function verify(value, pinned) {
  const path = join(temp, 'receipt.json');
  await writeFile(path, JSON.stringify(value));
  return spawnSync(process.execPath, [verifier, path, ...(pinned ? ['--receipt-sha256', pinned] : [])], {encoding:'utf8', timeout:5000});
}
test('independently pinned historical receipt remains valid', async () => {
  const digest = createHash('sha256').update(JSON.stringify(original)).digest('hex');
  const result = await verify(original, digest);
  assert.equal(result.status, 0, result.stderr);
});
for (const [name, mutate] of [
  ['failed scenario-pass', e => { e.records.find(r => r.stage === 'scenario-pass').ok = false; }],
  ['contradictory destruction', e => { e.records.filter(r => r.event?.method === 'script.realmDestroyed').forEach(r => {r.event.method = 'synthetic.notDestruction';}); }],
  ['duplicate event index', e => { const r = e.records.filter(r => r.stage === 'bidi-event'); r[1].eventIndex = r[0].eventIndex; }],
  ['untrusted runner hash', e => { e.records.find(r => r.stage === 'inputs').runnerSha256 = '0'.repeat(64); }],
]) test(`rejects ${name}`, async () => {
  const evidence = structuredClone(original); mutate(evidence);
  // Pin mutated bytes for structural controls, but require current source identity for hash control.
  const pinned = name === 'untrusted runner hash' ? undefined : createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const result = await verify(evidence, pinned);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AssertionError/);
});
test('rejects incorrect independently supplied receipt digest', async () => {
  const result = await verify(original, '0'.repeat(64));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AssertionError/);
});
