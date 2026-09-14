import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixturesRoot } from './paths.mjs';

export const manifest = JSON.parse(readFileSync(`${fixturesRoot}/manifest.json`, 'utf8'));

export function readFixture(path) {
  assert.ok(Object.hasOwn(manifest.sha256, path), `Unlisted fixture: ${path}`);
  const bytes = readFileSync(`${fixturesRoot}/${path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256[path], `Fixture hash: ${path}`);
  return bytes;
}

export function nativeFixture(name) {
  const receipt = JSON.parse(readFixture(`${name}/receipt.json`));
  assert.equal(manifest.sha256[`${name}/receipt.json`], manifest.provenance[name].receiptSha256);
  const assets = new Map();
  for (const [path, hash] of Object.entries(receipt.artifacts)) {
    const bytes = readFixture(`${name}/${path}`);
    assert.equal(manifest.sha256[`${name}/${path}`], hash, `Build receipt: ${path}`);
    assets.set(path, bytes);
  }
  return {
    directory: `${fixturesRoot}/${name}`,
    assets,
    provenance: { ...manifest.provenance[name], source: receipt.source, artifacts: receipt.artifacts },
  };
}
