import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('asset build rejects stale worker inputs, manifest pins and missing inventory files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bundled-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const put = async (name, bytes) => {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), bytes);
  };
  await put('scripts/bundled-assets.mjs', '');
  await cp(new URL('../../scripts/bundled-assets.mjs', import.meta.url), join(root, 'scripts/bundled-assets.mjs'));
  const worker = 'export const worker = true;', manifest = '{}';
  const inputs = JSON.stringify({ 'dist/src/runtime/wallet-worker.js': sha(worker) });
  const files = { 'wallet/manifest.json': manifest, 'wallet/worker-inputs.json': inputs };
  for (const [name, bytes] of Object.entries(files)) await put(`src/runtime/assets/${name}`, bytes);
  await put('src/runtime/assets/inventory.json', JSON.stringify(Object.fromEntries(Object.entries(files)
    .map(([name, bytes]) => [name, { byteLength: Buffer.byteLength(bytes), sha256: sha(bytes) }]))));
  const pin = `export const bundledArtifact = {manifestSha256:'${sha(manifest)}'};`;
  await put('src/runtime/bundled-assets.mjs', pin);
  await put('src/runtime/bundled-assets.d.mts', '');
  await put('dist/src/runtime/wallet-worker.js', worker);
  const run = () => spawnSync(process.execPath, ['scripts/bundled-assets.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run().status, 0);
  await put('dist/src/runtime/wallet-worker.js', worker + '\n// changed');
  let result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale packaged worker/);
  await put('dist/src/runtime/wallet-worker.js', worker);
  await put('src/runtime/bundled-assets.mjs', "export const bundledArtifact = {manifestSha256:'wrong'};");
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /stale bundled manifest pin/);
  await put('src/runtime/bundled-assets.mjs', pin);
  await rm(join(root, 'src/runtime/assets/wallet/worker-inputs.json'));
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ENOENT/);
});
