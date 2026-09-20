// Assemble a closed baseline runtime from a verified native build and current SDK worker.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rolldown, VERSION } from 'rolldown';
import { walletProfile } from '../dist/src/runtime/wallet-profile.js';

assert.equal(process.argv.length, 6, 'usage: node scripts/package-native-wallet.mjs NATIVE_BUILD SOURCE SDK_WORKER NEW_OUTPUT');
const [native, source, workerPath, output] = process.argv.slice(2).map(value => resolve(value));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const nativeBytes = readFileSync(join(native, 'build.json'));
const receipt = JSON.parse(nativeBytes);
assert.equal(receipt.format, 'zcash-js-native-build/1');
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), receipt.revision);
assert.equal(execFileSync('git', ['-C', source, 'diff', 'HEAD', '--'], { encoding: 'utf8' }), '');
assert.equal(receipt.inspection.pass, true);
assert.equal(receipt.inspection.imports.some(item => item.kind === 'memory'), false);
assert.ok(receipt.packages && Object.keys(receipt.packages).length, 'verified dependency inventory required');
const notices = JSON.parse(readFileSync(join(source, 'licenses/native-sources.json'))).packages;
for (const [key, dependency] of Object.entries(receipt.packages)) {
  const notice = notices.find(item => `${item.name}@${item.version}` === key);
  assert.ok(notice && notice.notices.length, `missing dependency notices: ${key}`);
  assert.equal(notice.archiveSha256 ?? receipt.nativePolicy[notice.name]?.upstream, dependency.checksum, `notice provenance: ${key}`);
}
for (const [name, hash] of Object.entries(receipt.artifacts)) {
  assert.equal(sha(readFileSync(join(native, 'bundle', name))), hash, name);
}
const wasm = readFileSync(join(native, 'bundle/bindings_bg.wasm'));
assert.equal(sha(wasm), receipt.inspection.sha256);
const worker = readFileSync(workerPath);
const workerInputs = readFileSync(`${workerPath}.inputs.json`);
const workerSources = JSON.parse(workerInputs);
assert.ok(Object.keys(workerSources).length, 'worker source inventory required');
for (const [name, hash] of Object.entries(workerSources)) {
  assert.ok(name.startsWith('dist/src/') && !name.includes('..'), 'worker source path');
  assert.equal(sha(readFileSync(join(import.meta.dirname, '..', name))), hash, `stale worker input: ${name}`);
}
const entry = readFileSync(join(source, 'runtime/entry-baseline.mjs'), 'utf8');
const graph = Buffer.from(canonical({ lockSha256: receipt.lockSha256, nativePolicy: receipt.nativePolicy,
  packages: receipt.packages }));
const memory = { initialPages: receipt.inspection.memoryPages.initial, maximumPages: receipt.inspection.memoryPages.maximum, shared: false };
const build = Buffer.from(canonical({ format: 'zcash-js-wallet-build/1', nativeBuildSha256: sha(nativeBytes),
  revision: receipt.revision, workerSha256: sha(worker), workerInputsSha256: sha(workerInputs), entrySha256: sha(entry),
  packagerSha256: sha(readFileSync(import.meta.filename)), rolldown: VERSION, memory,
  dependencyGraphSha256: sha(graph) }));
const identity = { ...walletProfile, mode: 'baseline', memory, buildSha256: sha(build), dependencyGraphSha256: sha(graph) };
const modules = ['bindings.js', 'bytes.mjs', 'wallet.mjs', 'views.mjs', 'network.mjs', 'transaction.mjs', 'wallet-host/storage-host.mjs'];
const { posix } = await import('node:path');
const virtual = Object.fromEntries(modules.map(name => [name, readFileSync(join(native, 'bundle', name), 'utf8')]));
virtual['runtime/entry.mjs'] = `${entry}\nexport const runtimeIdentity = ${canonical(identity)};\n`;
const bundler = await rolldown({ input: 'runtime/entry.mjs', cwd: '/wallet', platform: 'neutral',
  plugins: [{ name: 'wallet-assets', resolveId(id, importer) {
    const name = importer ? posix.normalize(posix.join(posix.dirname(importer), id)) : id;
    assert.ok(Object.hasOwn(virtual, name), `unlisted native import: ${id}`);
    return name;
  }, load(id) { return virtual[id]; } }],
  onLog(level, log) { throw Error(`${level}: ${log.code}`); },
});
let code;
try {
  const result = await bundler.generate({ format: 'es', comments: false });
  assert.equal(result.output.length, 1);
  const chunk = result.output[0];
  assert.equal(chunk.type, 'chunk');
  assert.deepEqual(chunk.imports, []);
  assert.deepEqual(chunk.dynamicImports, []);
  assert.ok(!/\b(fetch|import|eval|Function)\s*\(/.test(chunk.code), 'closed executable inventory');
  code = Buffer.from(chunk.code);
} finally { await bundler.close(); }
const assets = { 'wallet.mjs': code, 'worker.mjs': worker, 'bindings_bg.wasm': wasm,
  'node-fs.mjs': readFileSync(join(native, 'bundle/wallet-host/node-fs.mjs')),
  'opfs.mjs': readFileSync(join(native, 'bundle/wallet-host/opfs.mjs')) };
const manifest = { format: 'zcash-artifact/1', ...walletProfile, mode: 'baseline',
  buildSha256: sha(build), dependencyGraphSha256: sha(graph),
  files: Object.entries(assets).map(([url, bytes]) => ({ url, byteLength: bytes.length, sha256: sha(bytes),
    kind: url === 'wallet.mjs' ? 'module' : url === 'worker.mjs' ? 'worker' : url.endsWith('.wasm') ? 'wasm' : 'glue',
    mediaType: url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' })) };
const manifestBytes = Buffer.from(canonical(manifest));
mkdirSync(output);
for (const [name, bytes] of Object.entries({ ...assets, 'manifest.json': manifestBytes, 'worker-inputs.json': workerInputs,
  'build.json': build, 'dependency-graph.json': graph, 'native-build.json': nativeBytes })) {
  writeFileSync(join(output, name), bytes, { flag: 'wx' });
}
cpSync(join(source, 'LICENSE'), join(output, 'LICENSE'));
cpSync(join(source, 'licenses'), join(output, 'licenses'), { recursive: true });
console.log(JSON.stringify({ output, manifestSha256: sha(manifestBytes) }));
