import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadBundle, sha } from './bundle.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const [expected, output] = process.argv.slice(2);
if (!/^[a-f0-9]{64}$/.test(expected ?? '') || !output) throw Error('usage: run-node.mjs MANIFEST_SHA256 OUTPUT');
const { manifest, assets } = await loadBundle(root, expected);
const wasmBytes = assets.get('/codec_bg.wasm');
const module = new WebAssembly.Module(wasmBytes);
const bindings = await import('./codec.js');
const wasm = bindings.initSync({ module });
if (wasm.memory.buffer instanceof SharedArrayBuffer) throw Error('expected unshared baseline');
const { runCases } = await import('./cases.mjs');
const result = runCases(bindings, JSON.parse(assets.get('/vectors.json')));
// Require the same frozen files after execution too.
await loadBundle(root, expected);
const receipt = { runtime: 'Node', node: process.version, argv: process.argv,
  runner_sha256: sha(await readFile(fileURLToPath(import.meta.url))), manifest_sha256: expected,
  manifest, wasm_sha256: sha(wasmBytes), shared_memory: false,
  imports: WebAssembly.Module.imports(module), exports: WebAssembly.Module.exports(module), result };
await writeFile(resolve(output), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ runtime: 'Node', ok: result.ok, vectors: result.vectors.length,
  js_boundary_calls: result.js_boundary_calls, output: resolve(output) }));
