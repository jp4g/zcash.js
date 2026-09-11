import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { run } from './behavior.mjs';
const root = process.argv[2]; // Only the new verified copy produced by prepare.mjs.
const { initialize, consensusContext } = await import(pathToFileURL(`${root}/network.mjs`));
const wasm = new Uint8Array(await readFile(`${root}/bindings_bg.wasm`));
const imports = WebAssembly.Module.imports(await WebAssembly.compile(wasm));
assert.equal(imports.length, 2);
assert.ok(imports.every(i => i.kind === 'function' && i.module === './bindings_bg.js' && i.name.startsWith('__wbindgen_')));
initialize(wasm);
const result = run(consensusContext);
const buffer = Buffer.from('{"encoding":"regtest","Overwinter":null,"Sapling":null,"Blossom":null,"Heartwood":null,"Canopy":null,"Nu5":null,"Nu6":null,"Nu6_1":null,"Nu6_2":null,"Nu6_3":null}');
assert.deepEqual(consensusContext('zcash-js-network/1', buffer, 0xffffffff), { height: 0xffffffff, branchId: 0 });
console.log(JSON.stringify({ ...result, node: process.version, buffer: true, imports }));
