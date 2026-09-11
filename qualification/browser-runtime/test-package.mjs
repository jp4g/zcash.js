// Static packaging controls: no fake browser, no sockets, no runtime pass claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, appendFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const staged = resolve(process.argv[2]);
const temp = await mkdtemp('/home/jack/zcash-browser-runtime-scratch/package-controls-');
const chrome = '/home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
async function verify(root, label) {
  const logs = join(temp, label);
  const result = spawnSync(process.execPath, [join(here, 'run.mjs'), '--artifacts', root,
    '--logs', logs, '--scratch', temp, '--chrome', chrome, '--verify-only'],
  { encoding: 'utf8', timeout: 15000 });
  const files = (await readdir(logs)).filter(name => name.endsWith('.jsonl'));
  assert.equal(files.length, 1);
  return { ...result, evidence: await readFile(join(logs, files[0]), 'utf8') };
}
test('runner accepts byte-identical staged assets without attempting browser execution', async () => {
  const result = await verify(staged, 'accepted');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.evidence, /static-only-not-browser/);
  assert.doesNotMatch(result.evidence, /"stage":"launch"/);
});
test('runner rejects modified worker bytes before socket/browser creation', async () => {
  const corrupt = join(temp, 'corrupt');
  await cp(staged, corrupt, { recursive: true });
  await appendFile(join(corrupt, 'probe-worker.mjs'), '\n// synthetic corruption control\n');
  const result = await verify(corrupt, 'rejected');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.evidence, /asset integrity: probe-worker.mjs/);
  assert.doesNotMatch(result.evidence, /"stage":"launch"/);
});
test('preparer rejects producer raw hash mismatch', async () => {
  const manifest = JSON.parse(await readFile(join(staged, 'manifest.json')));
  const receipt = JSON.parse(await readFile(manifest.provenance.path));
  receipt.artifacts['raw/issue_2_qualification.wasm'] = '0'.repeat(64);
  const corruptReceipt = join(temp, 'bad-provenance.json');
  await writeFile(corruptReceipt, JSON.stringify(receipt));
  const result = spawnSync(process.execPath, [join(here, 'prepare.mjs'),
    '--generated', dirname(manifest.generatedOriginal.path), '--raw', manifest.raw.path,
    '--provenance', corruptReceipt, '--output', join(temp, 'rejected-producer')],
  { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /producer hash mismatch: raw\/issue_2_qualification.wasm/);
});
