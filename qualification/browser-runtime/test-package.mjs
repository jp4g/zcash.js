// Static packaging controls: no fake browser, no sockets, no runtime pass claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const staged = resolve(process.argv[2]);
const temp = await mkdtemp('/home/jack/zcash-browser-runtime-scratch/package-controls-');
const chrome = '/home/jack/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
function verify(root) {
  return spawnSync(process.execPath, [join(here, 'run.mjs'), '--artifacts', root,
    '--logs', join(temp, 'logs'), '--scratch', temp, '--chrome', chrome, '--verify-only'],
  { encoding: 'utf8', timeout: 15000 });
}
test('runner accepts byte-identical staged assets without attempting browser execution', () => {
  const result = verify(staged);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /static-only-not-browser/);
  assert.doesNotMatch(result.stdout, /"stage":"launch"/);
});
test('runner rejects modified worker bytes before socket/browser creation', async () => {
  const corrupt = join(temp, 'corrupt');
  await cp(staged, corrupt, { recursive: true });
  await appendFile(join(corrupt, 'probe-worker.mjs'), '\n// synthetic corruption control\n');
  const result = verify(corrupt);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /asset integrity: probe-worker.mjs/);
  assert.doesNotMatch(result.stdout, /"stage":"launch"/);
});
test('preparer rejects producer raw hash mismatch', async () => {
  const manifest = JSON.parse(await readFile(join(staged, 'manifest.json')));
  const receipt = JSON.parse(await readFile(manifest.provenance.path));
  receipt.artifacts['raw/issue_2_qualification.wasm'] = '0'.repeat(64);
  const corruptReceipt = join(temp, 'bad-provenance.json');
  await writeFile(corruptReceipt, JSON.stringify(receipt));
  const result = spawnSync(process.execPath, [join(here, 'prepare.mjs'),
    '--generated', dirname(manifest.generatedOriginal.path), '--raw', manifest.raw.path,
    '--provenance', corruptReceipt, '--output', join(temp, 'rejected')],
  { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /producer hash mismatch: raw\/issue_2_qualification.wasm/);
});
