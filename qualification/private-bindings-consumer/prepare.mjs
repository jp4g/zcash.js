import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyPacket, sha256 } from './verify.mjs';
const [packet, output] = process.argv.slice(2);
const pin = JSON.parse(await readFile(new URL('./pin.json', import.meta.url)));
const files = await verifyPacket(packet, pin); // Complete verification before writing executable copies.
for (const name of ['browser.mjs', 'behavior.mjs', 'vectors.mjs', 'firefox.mjs', 'node.mjs', 'pin.json']) {
  files.set(name, await readFile(new URL(name, import.meta.url)));
}
await mkdir(output); // New directory only; never replace an existing package.
for (const [name, bytes] of files) await writeFile(join(output, name), bytes, { flag: 'wx', mode: 0o444 });
const sums = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join('');
await writeFile(join(output, 'SHA256SUMS'), sums, { flag: 'wx', mode: 0o444 });
console.log(JSON.stringify({ output, pin, sumsSha256: sha256(sums) }));
