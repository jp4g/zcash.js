import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPacket } from './verify.mjs';
const [packet, scratch] = process.argv.slice(2);
const pin = JSON.parse(await readFile(new URL('./pin.json', import.meta.url)));
const verified = await verifyPacket(packet, pin);
assert.equal(verified.size, 5);
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
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./prepare.mjs', import.meta.url)), root, output], { stdio: 'pipe' }));
  assert.equal(existsSync(output), false, 'rejection must precede executable copy/import');
  controls++;
}
const root = await mkdtemp(join(scratch, 'missing-'));
await assert.rejects(verifyPacket(root, pin)); controls++;
console.log(JSON.stringify({ verifiedFiles: verified.size, rejectionControls: controls }));
