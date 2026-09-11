import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
const [bundle, web, nativeObservations] = process.argv.slice(2).map(p => resolve(p));
await mkdir(bundle); // New snapshot only; never overwrite an earlier host package.
const paths = {
  'adapter.js': join(web, 'adapter.js'), 'adapter_bg.wasm': join(web, 'adapter_bg.wasm'),
  'src/network-parameters.js': 'dist/src/network-parameters.js', 'src/errors.js': 'dist/src/errors.js', 'src/primitives.js': 'dist/src/primitives.js',
  'vectors.mjs': 'tests/network-parameters/vectors.mjs', 'parity.mjs': 'tests/network-parameters/parity.mjs',
  'source-constants.json': 'tests/network-parameters/source-constants.json',
  'browser.mjs': 'qualification/network-parameters/browser.mjs', 'firefox.mjs': 'qualification/network-parameters/firefox.mjs',
};
for (const [dest, source] of Object.entries(paths)) { await mkdir(dirname(join(bundle, dest)), { recursive: true }); await copyFile(source, join(bundle, dest)); }
await copyFile(nativeObservations, join(bundle, 'native-observations.json'));
await writeFile(join(bundle, 'package.json'), '{"type":"module","private":true}\n');
const files = [...Object.keys(paths), 'native-observations.json', 'package.json'].sort();
await writeFile(join(bundle, 'SHA256SUMS'), (await Promise.all(files.map(async file => createHash('sha256').update(await readFile(join(bundle, file))).digest('hex') + '  ' + file))).join('\n') + '\n');
console.log(bundle);
