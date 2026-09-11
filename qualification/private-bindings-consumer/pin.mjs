// Explicit local pin update, performed only after an actual committed-source build.
import { readFile, writeFile } from 'node:fs/promises';
import { verifyPacket, sha256 } from './verify.mjs';
const packet = process.argv[2];
const bytes = await readFile(`${packet}/build.json`);
const pin = { repository: '/home/jack/zakura-wasm-bindings', revision: JSON.parse(bytes).revision, buildSha256: sha256(bytes) };
await verifyPacket(packet, pin);
await writeFile(new URL('./pin.json', import.meta.url), JSON.stringify(pin, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(pin));
