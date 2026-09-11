import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Fixed disposable codec bundle, not a production artifact verifier.
export async function loadBundle(root, expected) {
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  if (sha(manifestBytes) !== expected) throw Error('bundle manifest hash mismatch');
  const manifest = JSON.parse(manifestBytes);
  const assets = new Map();
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw Error('invalid bundle filename');
    const bytes = await readFile(join(root, name));
    if (sha(bytes) !== digest) throw Error(`bundle file mismatch: ${name}`);
    assets.set('/' + name, bytes);
  }
  return { manifest, assets };
}
