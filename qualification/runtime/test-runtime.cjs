// Scalar-only disposable ABI. Every test executes in a dedicated Node worker.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const assert = require('node:assert/strict');
const { runWorker } = require('./worker-harness.cjs');
const { lifecycle, assertSchemaAbsent } = require('./lifecycle.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const target = process.env.RUNTIME_TARGET || 'nodejs';
const bundle = process.env.RUNTIME_BINDINGS;
if (!bundle) throw new Error('RUNTIME_BINDINGS must identify a preserved generated build');
const artifact = path.join(bundle, target, 'qualification_bg.wasm');
const cases = ['sql', 'pairing', 'pool', 'oom', 'growth', 'hosts', 'omitted-pool',
  'entropy-unavailable', 'entropy-loss', 'unknown-import', 'destruction',
  'interleaved', 'canary-corruption', 'heap-corruption', 'unopened-sql', 'repeat-init', 'unsupported-hosts'];

if (isMainThread) {
  const { test } = require('node:test');
  for (const scenario of cases) test(scenario, { timeout: 60000 }, async (t) => {
    const createWorker = scenario => new Worker(__filename, { workerData: scenario });
    const result = scenario === 'destruction'
      ? await lifecycle(createWorker, { signal: t.signal, deadlineMs: 25000 })
      : await runWorker(createWorker(scenario), { signal: t.signal });
    assert.equal(result.ok, true);
    console.log(JSON.stringify(result));
  });
} else {
  (async () => {
  const { load, inventory } = await import(pathToFileURL(path.join(bundle, target, 'loader.mjs')));
  const module = new WebAssembly.Module(fs.readFileSync(artifact));
  const { e, state } = await load({ module, target, entropyAvailable: workerData !== 'entropy-unavailable' });
  let details = {};
  if (workerData === 'unknown-import') {
    assert.throws(() => new WebAssembly.Instance(module, {}));
    // A valid tiny module importing an unapproved function must be rejected.
    const unknown = new WebAssembly.Module(Uint8Array.from([
      0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,7,1,1,120,1,121,0,0,
    ]));
    assert.throws(() => inventory(unknown));
  } else if (workerData === 'entropy-unavailable') {
    assert.throws(() => e.rt_init(1), /entropy unavailable/);
  } else if (workerData === 'unopened-sql') {
    assert.throws(() => e.rt_rows(), WebAssembly.RuntimeError);
  } else if (workerData === 'omitted-pool') {
    assert.notEqual(e.rt_init(0), 0);
    assert.notEqual(e.rt_open(), 0);
  } else {
    assert.equal(e.rt_init(1), 0);
    assert.equal(e.rt_open(), 0);
    switch (workerData) {
      case 'repeat-init':
        assert.equal(e.rt_init(1), 21);
        assert.equal(e.rt_open(), 21);
        break;
      case 'unsupported-hosts': assert.equal(e.rt_unsupported_hosts(), 1); break;
      case 'canary-corruption':
        new Uint8Array(e.memory.buffer)[e.rt_pool_start() - 1] ^= 1;
        assert.equal(e.rt_pool_check(), 0);
        break;
      case 'heap-corruption':
        assert.equal(e.rt_grow(65536), 1);
        new Uint8Array(e.memory.buffer)[e.rt_heap_ptr()] ^= 1;
        assert.equal(e.rt_heap_check(), 0);
        break;
      case 'interleaved': {
        assert.equal(e.rt_sql(), 42);
        const sizes = [32, 48, 64].map(n => n * 1024 * 1024);
        const cycles = [];
        for (const [i, size] of sizes.entries()) {
          const old = e.memory.buffer;
          assert.equal(e.rt_grow(size), 1);
          assert.notEqual(e.memory.buffer, old);
          assert.equal(old.byteLength, 0);
          assert.equal(e.rt_cycle(), 44 + i * 2);
          assert.equal(e.rt_rows(), 2);
          assert.equal(e.rt_pairing(), 1);
          assert.equal(e.rt_hosts(), 1);
          assert.equal(e.rt_heap_check(), 1);
          assert.equal(e.rt_pool_check(), 1);
          cycles.push({ rustBytes: size, memoryBytes: e.memory.buffer.byteLength });
        }
        details = { cycles, host: state };
        break;
      }
      case 'sql': assert.equal(e.rt_sql(), 42); assert.equal(e.rt_pairing(), 1); assert.equal(e.rt_rows(), 2); break;
      case 'pairing': assert.equal(e.rt_pairing(), 1); break;
      case 'pool':
        assert.equal(e.rt_pool_check(), 1);
        assert.equal(e.rt_pool_size(), 16 * 1024 * 1024);
        assert(e.rt_pool_start() + e.rt_pool_size() <= Number(e.__heap_base.value));
        details = { poolStart: e.rt_pool_start(), poolSize: e.rt_pool_size(), heapBase: Number(e.__heap_base.value) };
        break;
      case 'oom':
        assert.equal(e.rt_sql(), 42);
        assert.equal(e.rt_oom(), 1);
        assert.equal(e.rt_rows(), 2);
        assert.equal(e.rt_pool_check(), 1);
        break;
      case 'growth': {
        assert.equal(e.rt_sql(), 42);
        const old = e.memory.buffer;
        assert.equal(e.rt_grow(32 * 1024 * 1024), 1);
        assert.notEqual(e.memory.buffer, old);
        assert.equal(old.byteLength, 0);
        assert.equal(e.rt_rows(), 2);
        assert.equal(e.rt_hosts(), 1); // Host entropy writes through the refreshed view.
        assert.equal(e.rt_heap_check(), 1);
        assert.equal(e.rt_pool_check(), 1);
        details = { memoryBytes: e.memory.buffer.byteLength };
        break;
      }
      case 'hosts': {
        const before = Date.now();
        assert.equal(e.rt_hosts(), 1);
        const julian = e.rt_time();
        assert(julian >= before + 210866760000000 && julian <= Date.now() + 210866760000000);
        assert(state.entropyCalls >= 2 && state.timeCalls >= 2 && state.sleepCalls >= 1);
        details = state;
        break;
      }
      case 'entropy-loss':
        state.entropyAvailable = false;
        assert.throws(() => e.rt_hosts(), /entropy unavailable/);
        // No continued use after a host exception; the worker is destroyed.
        break;
      case 'destruction': {
        assert.equal(e.rt_sql(), 42);
        assert.equal(e.rt_rows(), 2);

        break;
      }
      case 'destruction-fresh':
        assertSchemaAbsent(e.rt_fixture_schema_count());
        break;
      default: throw new Error('unknown test scenario');
    }
  }
  parentPort.postMessage({ ok: true, scenario: workerData, target, details });
  })().catch(error => { throw error; });
}
