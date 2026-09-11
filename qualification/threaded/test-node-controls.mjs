import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Domain } from './domain.mjs';
import { nodeFactory } from './node-adapter.mjs';
import { oneWorker } from './one-worker.mjs';
const bundle = pathToFileURL(process.argv[2] + '/');
const module = await WebAssembly.compile(await readFile(new URL('baseline/qualification_bg.wasm', bundle)));
for (const fault of ['compute-error', 'compute-stall', 'owner-blocked']) {
  const events = [];
  const d = new Domain({ spawn: nodeFactory(new URL('./control-worker.mjs', import.meta.url),events),
    timeout: 1000, count: 2, init: { fault }, fallback: async reason => {
      assert.equal(events.filter(e => e.type === 'terminated').length, 3);
      const baseline = await oneWorker(nodeFactory(new URL('./node-baseline.mjs', import.meta.url),events),
        { module, bindingsURL: new URL('baseline/qualification.js',bundle).href });
      return { reason, baseline };
    } });
  try {
    assert.throws(() => d.call('sql'), /not ready/);
    const result = await d.start(); assert.equal(result.baseline.schemaBefore, 0);
    console.log(JSON.stringify({ kind: 'host-control-with-real-baseline', fault, result, events }));
  } finally { await d.close(); }
}
