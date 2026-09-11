// Stage verified fresh generator output without editing generated code.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
function option(name) {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !value || value.startsWith('--')) throw new Error(`required ${name}`);
  return value;
}
const generated = resolve(option('--generated'));
const raw = resolve(option('--raw'));
const provenance = resolve(option('--provenance'));
const output = resolve(option('--output'));
const label = 'fresh';
// Never overwrite prior evidence/artifacts.
await mkdir(output);
const original = await readFile(join(generated, 'qualification.js'));
const wasm = await readFile(join(generated, 'qualification_bg.wasm'));
const receiptBytes = await readFile(provenance);
const receipt = JSON.parse(receiptBytes);
for (const [name, bytes] of [['raw/issue_2_qualification.wasm', await readFile(raw)],
  ['web/qualification.js', original], ['web/qualification_bg.wasm', wasm]]) {
  if (receipt.artifacts?.[name] !== sha256(bytes)) throw new Error(`producer hash mismatch: ${name}`);
}
if (JSON.stringify(receipt.sources_before) !== JSON.stringify(receipt.sources_after)) {
  throw new Error('producer source drift');
}
for (const [name, hash] of Object.entries(receipt.sources_before)) {
  if (sha256(await readFile(join(dirname(provenance), 'sources', name))) !== hash) {
    throw new Error(`producer source hash mismatch: ${name}`);
  }
}
for (const name of ['fresh-raw-build', 'fresh-generate-web']) {
  const command = receipt.commands.find(c => c.label === name);
  if (!command || command.exit_code !== 0 || command.timed_out) throw new Error(`producer command failed: ${name}`);
  if (sha256(await readFile(command.log)) !== command.sha256) throw new Error(`producer log mismatch: ${name}`);
}
const generation = receipt.commands.find(c => c.label === 'fresh-generate-web');
if (sha256(await readFile(generation.argv[0])) !== receipt.generator_sha256) throw new Error('generator hash mismatch');
const module = new WebAssembly.Module(wasm);
const imports = WebAssembly.Module.imports(module);
const exports = WebAssembly.Module.exports(module);
const required = ['memory', '__heap_base', 'rt_init', 'rt_open', 'rt_sql', 'rt_pairing',
  'rt_rows', 'rt_fixture_schema_count', 'rt_pool_start', 'rt_pool_size', 'rt_pool_check',
  'rt_oom', 'rt_grow', 'rt_heap_check', 'rt_heap_ptr', 'rt_cycle', 'rt_unsupported_hosts', 'rt_hosts', 'rt_time'];
for (const name of required) {
  if (!exports.some(e => e.name === name)) throw new Error(`missing generated export ${name}; regenerate with --keep-lld-exports`);
}
const allowed = new Set(['./runtime-host.mjs.entropy', './runtime-host.mjs.utc_ms', './runtime-host.mjs.sleep',
  './qualification_bg.js.__wbindgen_init_externref_table',
  './qualification_bg.js.__wbg___wbindgen_exports_3d3410a3b95d7b41',
  './qualification_bg.js.__wbg___wbindgen_throw_5d9e815e6fdf150f']);
// Exports-bridge names vary with binding source. Require explicit review for any
// additional generated import instead of inventing a resolver.
for (const entry of imports) {
  if (entry.kind !== 'function' || !allowed.has(`${entry.module}.${entry.name}`)) {
    throw new Error(`unreviewed import ${JSON.stringify(entry)}`);
  }
}
if (imports.length !== allowed.size) throw new Error('incomplete generated import contract');
const manifest = {
  label, note: 'Producer source snapshots, command logs, generator and selected artifact hashes verified.',
  raw: { path: raw, sha256: sha256(await readFile(raw)) },
  generatedOriginal: { path: join(generated, 'qualification.js'), sha256: sha256(original) },
  provenance: { path: provenance, sha256: sha256(receiptBytes) },
  sourceHashes: receipt.sources_before, generatorSha256: receipt.generator_sha256,
  imports, exports, files: {},
};
await writeFile(join(output, 'qualification.original.js'), original);
await writeFile(join(output, 'qualification.js'), original);
await writeFile(join(output, 'qualification_bg.wasm'), wasm);
await copyFile(provenance, join(output, 'producer-provenance.txt'));
for (const file of ['runtime-host.mjs', 'loader.mjs', 'probe-worker.mjs', 'controller.mjs', 'control-worker.mjs', 'index.html']) {
  await copyFile(join(here, file), join(output, file));
}
for (const file of ['qualification.original.js', 'qualification.js', 'qualification_bg.wasm',
  'producer-provenance.txt', 'runtime-host.mjs', 'loader.mjs', 'probe-worker.mjs', 'controller.mjs', 'control-worker.mjs', 'index.html']) {
  const bytes = await readFile(join(output, file));
  manifest.files[file] = { sha256: sha256(bytes), bytes: bytes.length };
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, manifestSha256: sha256(await readFile(join(output, 'manifest.json'))), ...manifest }, null, 2));
