import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyPacket, sha256 } from './verify.mjs';
const [packet, output] = process.argv.slice(2);
const pin = JSON.parse(await readFile(new URL('./pin.json', import.meta.url)));
const files = await verifyPacket(packet, pin); // Complete verification before writing executable copies.
for (const name of ['browser.mjs', 'behavior.mjs', 'vectors.mjs', 'firefox.mjs', 'node.mjs', 'pin.json', 'transaction-behavior.mjs']) {
  files.set(name, await readFile(new URL(name, import.meta.url)));
}
const vectors = await readFile(new URL('../transaction-codec/fixtures/vectors.json', import.meta.url));
if (sha256(vectors) !== '26cb21c3733ff8a57b4c99310cfb73331d6376a80a065513932349b497cfbd74') throw Error('qualified transaction vectors changed');
files.set('transaction-vectors.json', vectors);
await mkdir(output); // New directory only; never replace an existing package.
for (const [name, bytes] of files) await writeFile(join(output, name), bytes, { flag: 'wx', mode: 0o444 });
const sums = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join('');
await writeFile(join(output, 'SHA256SUMS'), sums, { flag: 'wx', mode: 0o444 });
console.log(JSON.stringify({ output, pin, sumsSha256: sha256(sums) }));
