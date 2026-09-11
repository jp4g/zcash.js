import assert from 'node:assert/strict';
import { firefoxOptions } from './firefox-options.mjs';
import { readFile } from 'node:fs/promises';
assert.deepEqual(firefoxOptions(),{args:['-headless']});
assert.throws(()=>firefoxOptions('/snap/bin/firefox'),/launcher/);
// Resolve every relative static import in the foreground runner before socket launch.
const source=await readFile(new URL('./run-firefox.mjs',import.meta.url),'utf8');
for(const match of source.matchAll(/from '(\.\/[^']+)'/g)) await import(new URL(match[1],import.meta.url));
const pinned=JSON.parse(await readFile(new URL('./evidence.json',import.meta.url),'utf8'));
assert.match(pinned.manifestSha256,/^[0-9a-f]{64}$/);
console.log('Firefox options and local runner imports resolve');
