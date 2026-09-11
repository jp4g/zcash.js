// Explicit Node diagnostic of the real web bindings, NOT browser qualification.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2]);
const generated = await import(pathToFileURL(join(root, 'qualification.js')));
const host = await import(pathToFileURL(join(root, 'runtime-host.mjs')));
const module = new WebAssembly.Module(await readFile(join(root, 'qualification_bg.wasm')));
const e = await generated.default({ module_or_path: module });
const table = e.__wbindgen_externrefs;
assert.deepEqual([0, table.length - 4, table.length - 3, table.length - 2, table.length - 1]
  .map(i => table.get(i)), [undefined, undefined, null, true, false]);
assert.equal(generated.raw_exports(), e);
host.bindMemory(e.memory);
assert.equal(e.rt_init(1), 0);
assert.equal(e.rt_open(), 0);
assert.equal(e.rt_sql(), 42);
assert.equal(e.rt_pairing(), 1);
assert.equal(e.rt_rows(), 2);
assert.equal(e.rt_pool_size(), 16 * 1024 * 1024);
assert(e.rt_pool_start() + e.rt_pool_size() <= Number(e.__heap_base.value));
const old = e.memory.buffer;
const oldBytes = old.byteLength;
assert.equal(e.rt_grow(32 * 1024 * 1024), 1);
assert.notEqual(e.memory.buffer, old);
assert.equal(old.byteLength, 0);
assert.equal(e.rt_hosts(), 1);
assert.equal(host.state.lastEntropyMemoryBytes, e.memory.buffer.byteLength);
assert.equal(e.rt_heap_check(), 1);
assert.equal(e.rt_oom(), 1);
assert.equal(e.rt_rows(), 2);
assert.equal(e.rt_pool_check(), 1);
assert.equal(e.rt_pairing(), 1);
console.log(JSON.stringify({ category: 'node-diagnostic-not-browser', ok: true,
  node: process.version, root, sql: 42, rows: 2, pairing: 1, oldBytes,
  memoryBytes: e.memory.buffer.byteLength, poolStart: e.rt_pool_start(),
  heapBase: Number(e.__heap_base.value), hosts: host.state }));
