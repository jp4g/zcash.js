import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPacket, sha256 } from './verify.mjs';
const [packet, scratch] = process.argv.slice(2);
const pin = JSON.parse(await readFile(new URL('./pin.json', import.meta.url)));
const verified = await verifyPacket(packet, pin);
assert.equal(verified.size, 7);
await assert.rejects(verifyPacket(packet, { ...pin, revision: '0'.repeat(40) }), /revision/);
await assert.rejects(verifyPacket(packet, { ...pin, buildSha256: '0'.repeat(64) }), /build hash/);
let controls = 2;
for (const name of ['build.json', ...verified.keys()]) {
  const root = await mkdtemp(join(scratch, 'corrupt-'));
  await cp(packet, root, { recursive: true });
  const bytes = await readFile(join(root, name)); bytes[0] ^= 1;
  await writeFile(join(root, name), bytes);
  await assert.rejects(verifyPacket(root, pin), /hash/);
  const output = join(root, 'must-not-exist');
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./prepare.mjs', import.meta.url)), root, output], { stdio: ['ignore', 'ignore', 'ignore'] }));
  assert.equal(existsSync(output), false, 'rejection must precede executable copy/import');
  controls++;
}
const root = await mkdtemp(join(scratch, 'missing-'));
await assert.rejects(verifyPacket(root, pin)); controls++;
// Give structural mutations matching metadata hashes so the specific gate is tested.
for (const [name, mutate, expected] of [
  ['missing-entry', b => { delete b.files['transaction.mjs']; }, /file closure/],
  ['extra-entry', b => { b.files['unexpected.mjs'] = b.files['transaction.mjs']; }, /file closure/],
  ['source-tree', b => { b.sourceTree = '0'.repeat(40); }, /source tree/],
  ['source-lock', b => { b.lockSha256 = '0'.repeat(64); }, /source lock/],
  ['artifact-length', b => { b.files['transaction.mjs'].bytes++; }, /length/],
]) {
  const root = await mkdtemp(join(scratch, name + '-'));
  await cp(packet, root, { recursive: true });
  const build = JSON.parse(await readFile(join(root, 'build.json'))); mutate(build);
  const raw = JSON.stringify(build); await writeFile(join(root, 'build.json'), raw);
  await assert.rejects(verifyPacket(root, { ...pin, buildSha256: sha256(raw) }), expected); controls++;
}
for (const mode of ['missing', 'extra']) {
  const root = await mkdtemp(join(scratch, mode + '-file-'));
  await cp(packet, root, { recursive: true });
  if (mode === 'missing') await rm(join(root, 'bytes.mjs'));
  else await writeFile(join(root, 'unexpected.mjs'), 'throw Error("must never import")');
  await assert.rejects(verifyPacket(root, pin), /packet inventory/); controls++;
}
console.log(JSON.stringify({ verifiedFiles: verified.size, rejectionControls: controls }));
