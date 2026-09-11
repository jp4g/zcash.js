// Local qualification pins only. This is not the H1 remote artifact loader.
import { open } from 'node:fs/promises';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function bounded(path, limit) {
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    assert.ok(offset <= limit, 'oversized artifact');
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}
export async function verifyPacket(packet, pin) {
  assert.match(pin.revision, /^[0-9a-f]{40}$/, 'invalid revision');
  assert.match(pin.buildSha256, /^[0-9a-f]{64}$/, 'invalid build hash');
  const raw = await bounded(join(packet, 'build.json'), 32768);
  assert.equal(sha256(raw), pin.buildSha256, 'build hash mismatch');
  const build = JSON.parse(raw);
  assert.equal(build.schema, 'zakura-network-build/1');
  assert.equal(build.revision, pin.revision, 'revision mismatch');
  // Regular-file capture avoids Node's socket-backed subprocess pipes here.
  const git = (...args) => {
    const temp = mkdtempSync('/home/jack/zakura-bindings-network-scratch/git-read-');
    const path = join(temp, 'stdout');
    const fd = openSync(path, 'wx');
    try {
      execFileSync('git', ['-C', pin.repository, ...args], { stdio: ['ignore', fd, 'inherit'] });
      return readFileSync(path);
    } finally { closeSync(fd); rmSync(temp, { recursive: true }); }
  };
  assert.equal(git('rev-parse', `${pin.revision}^{commit}`).toString().trim(), pin.revision, 'Git revision mismatch');
  assert.equal(sha256(git('show', `${pin.revision}:Cargo.lock`)), build.lockSha256, 'source lock mismatch');
  assert.equal(git('rev-parse', `${pin.revision}^{tree}`).toString().trim(), build.sourceTree, 'source tree mismatch');
  const limits = { 'bindings.js': 65536, 'bindings_bg.wasm': 1048576,
    'bindings.d.ts': 16384, 'bindings_bg.wasm.d.ts': 16384, 'network.mjs': 16384 };
  assert.deepEqual(Object.keys(build.files).sort(), Object.keys(limits).sort(), 'unexpected file closure');
  const files = new Map();
  for (const [name, limit] of Object.entries(limits)) {
    const bytes = await bounded(join(packet, name), limit);
    assert.equal(sha256(bytes), build.files[name].sha256, `${name} hash mismatch`);
    assert.equal(bytes.length, build.files[name].bytes, `${name} length mismatch`);
    files.set(name, bytes);
  }
  return files; // Fresh owned bytes; callers must use these, not reread packet paths.
}
