// Snapshot and compile only the assigned loader and its accepted read-only dependencies.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url)), sdk = resolve(here, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, why) => { if (!ok) throw Error(why); };
const sdkRevision = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: sdk, encoding: 'utf8' }).trim();
const sdkInputHashes = {};
const readSdk = name => {
  const bytes = readFileSync(join(sdk, name));
  const committed = execFileSync('git', ['show', `${sdkRevision}:${name}`], { cwd: sdk, maxBuffer: 16 * 1024 * 1024 });
  check(bytes.equals(committed), `SDK input differs from commit ${sdkRevision}: ${name}`);
  sdkInputHashes[name] = sha(bytes);
  return bytes;
};
readSdk('tests/runtime-primitive-loader/prepare.mjs');
const pinBytes = readSdk('tests/runtime-primitive-loader/pin.json'), pin = JSON.parse(pinBytes);
const packet = process.argv[2], output = process.argv[3];
const files = new Map();
check(JSON.stringify(readdirSync(packet).sort()) === JSON.stringify(['build.json', 'manifest.json', ...pin.files.map(f => f.url)].sort()), 'producer inventory');
for (const f of pin.files) {
  const b = readFileSync(join(packet, f.url)); check(b.length === f.byteLength && sha(b) === f.sha256, 'producer file pin'); files.set('release/' + f.url, b);
}
for (const [name, hash] of [['manifest.json', pin.manifestSha256], ['build.json', pin.buildSha256]]) {
  const b = readFileSync(join(packet, name)); check(sha(b) === hash, 'producer metadata pin'); files.set('release/' + name, b);
}
const build = JSON.parse(files.get('release/build.json'));
check(build.revision === pin.revision && build.acceptedBuildSha256 === pin.acceptedBuildSha256, 'producer source pins');
const source = new Map();
for (const name of ['src/runtime/primitive-loader.ts', 'src/runtime/artifacts.ts', 'src/errors.ts', 'docs/api/public-api.ts']) source.set(name, readSdk(name));
const temp = mkdtempSync(join(dirname(resolve(output)), 'compile-'));
for (const [name, bytes] of source) { mkdirSync(dirname(join(temp, name)), { recursive: true }); writeFileSync(join(temp, name), bytes, { flag: 'wx' }); }
const log = openSync(join(temp, 'tsc.log'), 'wx');
try {
  execFileSync(process.execPath, ['/home/jack/zcash.js/node_modules/typescript/bin/tsc', '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'bundler',
    '--strict', '--noUncheckedIndexedAccess', '--exactOptionalPropertyTypes', '--skipLibCheck', '--noEmitOnError', '--outDir', join(temp, 'compiled'), '--rootDir', temp,
    join(temp, 'src/runtime/primitive-loader.ts')], { stdio: ['ignore', log, log] });
} finally { closeSync(log); }
for (const name of ['src/runtime/primitive-loader.js', 'src/runtime/artifacts.js', 'src/errors.js']) files.set(name, readFileSync(join(temp, 'compiled', name)));
for (const name of ['browser.mjs', 'network-cases.mjs', 'transaction-cases.mjs', 'vectors.mjs', 'host.mjs']) files.set(name, readSdk('tests/runtime-primitive-loader/' + name));
const vectors = readSdk('qualification/transaction-codec/fixtures/vectors.json');
check(sha(vectors) === '26cb21c3733ff8a57b4c99310cfb73331d6376a80a065513932349b497cfbd74', 'accepted transaction corpus');
files.set('transaction-vectors.json', vectors); files.set('pin.json', pinBytes);
files.set('index.html', Buffer.from('<!doctype html><title>Internal primitive worker test</title><script type="module" src="/browser.mjs"></script>'));
const sourceHashes = Object.fromEntries([...source].map(([name, bytes]) => [name, sha(bytes)]));
for (const [name, bytes] of source) { check(sha(readFileSync(join(sdk, name))) === sha(bytes), 'source changed during compile'); files.set('source/' + name, bytes); }
files.set('provenance.json', Buffer.from(JSON.stringify({ sdkBase: pin.sdkBase, sdkRevision, sdkSourceState: 'all SDK inputs match committed bytes', sdkInputHashes,
  sourceHashes, privateRevision: pin.revision, manifestSha256: pin.manifestSha256, node: process.version,
  typescript: JSON.parse(readFileSync('/home/jack/zcash.js/node_modules/typescript/package.json')).version }, null, 2) + '\n'));
mkdirSync(output);
for (const [name, bytes] of files) { mkdirSync(dirname(join(output, name)), { recursive: true }); writeFileSync(join(output, name), bytes, { flag: 'wx' }); }
const sums = Buffer.from([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => sha(bytes) + '  ' + name + '\n').join(''));
writeFileSync(join(output, 'SHA256SUMS'), sums, { flag: 'wx' });
console.log(JSON.stringify({ output, inventorySha256: sha(sums), runnerSha256: sha(files.get('host.mjs')), sourceHashes }, null, 2));
