import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Domain } from './domain.mjs';
import { nodeFactory } from './node-adapter.mjs';
import { oneWorker } from './one-worker.mjs';
import { validateEvidence } from './evidence.mjs';
const bundle = pathToFileURL(process.argv[2] + '/');
const module = await WebAssembly.compile(await readFile(new URL('threaded/qualification_bg.wasm',bundle)));
console.log(JSON.stringify({ type: 'imports', imports: WebAssembly.Module.imports(module) }));
for (const fault of [undefined, 'owner-error', 'owner-stall', 'compute-error', 'compute-stall']) {
  const events = [], terminations = [];
  const d = new Domain({ spawn: nodeFactory(new URL('./node-worker.mjs', import.meta.url),terminations), count: 2,
    timeout: 10000, init: { module, bindingsURL: new URL('threaded/qualification.js',bundle).href, fault },
    event: data => { const { module, memory, ...rest } = data; events.push(rest); },
    fallback: async reason => {
      assert.equal(terminations.length, fault?.startsWith('owner-') ? 1 : 3);
      const baseline = await oneWorker(nodeFactory(new URL('./node-baseline.mjs',import.meta.url),terminations), {
        module: await WebAssembly.compile(await readFile(new URL('baseline/qualification_bg.wasm',bundle))),
        bindingsURL: new URL('baseline/qualification.js',bundle).href,
      }); return { reason, baseline };
    } });
  try {
    assert.throws(() => d.call('sql'), /not ready/);
    const promise = d.start(); assert.equal(promise, d.start()); const ready = await promise;
    if (fault) {
      assert.equal(ready.baseline.schemaBefore, 0); console.log(JSON.stringify({ type: 'actual-bootstrap-fallback', fault, ready, events, terminations })); continue;
    }
    assert.equal(ready.shared, true); assert.equal(ready.baseline, undefined);
    const loaded = events.filter(e => e.type === 'loaded');
    assert.equal(new Set(loaded.map(e => e.hostThreadId)).size, 2);
    assert(loaded.every(e => e.hostThreadId !== ready.hostThreadId && e.shared));
    const rows = validateEvidence(await d.call('evidence'));
    const sql = await d.call('sql'), pairing = await d.call('pairing'), pool = await d.call('pool');
    assert.equal(sql,42); assert.equal(pairing,1); assert.equal(pool,1);
    assert.equal(await d.call('growth',[32 * 1024 * 1024]),1);
    const afterGrowth = validateEvidence(await d.call('evidence'));
    assert.equal(await d.call('cycle'),44);
    console.log(JSON.stringify({ type: 'actual-Rust-Rayon', ready, rows, afterGrowth, sql, pairing, pool, events }));
  } finally { await d.close(); console.log(JSON.stringify({ type: 'closed', fault: fault ?? 'success', terminations })); }
}
