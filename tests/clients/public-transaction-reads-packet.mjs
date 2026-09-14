import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export { buildRoot as build } from '../support/paths.mjs';
import { fixturesRoot } from '../support/paths.mjs';
export const packet = `${fixturesRoot}/transaction`;
export async function verifiedPacket() {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const inventory = await readFile(`${packet}/SHA256SUMS`, 'utf8');
  assert.equal(digest(inventory), 'dbf2c6891e73f69ae256f1e3ce6f756b7d7a68bb67c47123fc79a5e01cd89e18');
  const files = new Map();
  for (const line of inventory.trim().split('\n')) {
    const [hash, name] = line.split('  ');
    const bytes = await readFile(`${packet}/${name}`);
    assert.equal(digest(bytes), hash, name); files.set(name, bytes);
  }
  assert.equal(files.size, 15);
  const corpus = await readFile(new URL('../fixtures/transaction/transaction-vectors.json', import.meta.url));
  assert.equal(digest(corpus), '26cb21c3733ff8a57b4c99310cfb73331d6376a80a065513932349b497cfbd74');
  assert.deepEqual(corpus, files.get('transaction-vectors.json'));
  const pin = JSON.parse(await readFile(new URL('../fixtures/transaction-pin.json', import.meta.url)));
  assert.equal(pin.revision, 'acaf7069e466c82ce1be2c45ebafb75a92b59ee9');
  assert.equal(pin.buildSha256, '09ae852de689eb47fba35dfefaae81397d280f5c2542bccdee9747954efad575');
  return { files, vectors: JSON.parse(corpus) };
}
