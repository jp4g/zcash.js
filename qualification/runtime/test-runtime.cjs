// Scalar-only disposable ABI. Every test executes in a dedicated Node worker.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const assert = require('node:assert/strict');
const { runWorker } = require('./worker-harness.cjs');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const artifact = '/home/jack/zcash-node-runtime-scratch/target/wasm32-unknown-unknown/debug/issue_2_qualification.wasm';
const cases = ['sql', 'pairing', 'pool', 'oom', 'growth', 'hosts', 'omitted-pool',
  'entropy-unavailable', 'entropy-loss', 'unknown-import', 'destruction'];

function inventory(module) {
  const actual = WebAssembly.Module.imports(module).map(i => `${i.module}.${i.name}:${i.kind}`).sort();
  assert.deepEqual(actual, ['runtime_host.entropy:function', 'runtime_host.sleep:function',
    'runtime_host.utc_ms:function']);
  return actual;
}

function instance(module, entropyAvailable = true) {
  inventory(module); // No default import resolver and no WASI success stubs.
  let wasm;
  const state = { entropyAvailable, entropyCalls: 0, timeCalls: 0, sleepCalls: 0 };
  const imports = { runtime_host: {
    entropy(ptr, len) {
      if (!state.entropyAvailable) throw new Error('entropy unavailable; discard instance');
      ptr >>>= 0; len >>>= 0;
      const buffer = wasm.exports.memory.buffer; // Refresh after every memory.grow.
      assert(ptr + len <= buffer.byteLength && len <= 65536);
      webcrypto.getRandomValues(new Uint8Array(buffer, ptr, len));
      state.entropyCalls++;
      return len;
    },
    utc_ms() { state.timeCalls++; return Date.now(); },
    sleep(us) {
      assert(Number.isInteger(us) && us >= 0 && us <= 20000);
      const start = performance.now();
      while ((performance.now() - start) * 1000 < us) { /* bounded worker-local wait */ }
      state.sleepCalls++;
      return Math.ceil((performance.now() - start) * 1000);
    },
  } };
  wasm = new WebAssembly.Instance(module, imports);
  assert(wasm.exports.memory.buffer instanceof ArrayBuffer);
  assert(!(wasm.exports.memory.buffer instanceof SharedArrayBuffer));
  return { e: wasm.exports, state };
}

if (isMainThread) {
  const { test } = require('node:test');
  for (const scenario of cases) test(scenario, { timeout: 60000 }, async (t) => {
    const result = await runWorker(new Worker(__filename, { workerData: scenario }),
      { signal: t.signal });
    assert.equal(result.ok, true);
    console.log(JSON.stringify(result));
  });
} else {
  const module = new WebAssembly.Module(fs.readFileSync(artifact));
  const { e, state } = instance(module, workerData !== 'entropy-unavailable');
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
  } else if (workerData === 'omitted-pool') {
    assert.notEqual(e.rt_init(0), 0);
    assert.notEqual(e.rt_open(), 0);
  } else {
    assert.equal(e.rt_init(1), 0);
    assert.equal(e.rt_open(), 0);
    switch (workerData) {
      case 'sql': assert.equal(e.rt_sql(), 42); assert.equal(e.rt_rows(), 2); break;
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
        // Separate memory from the same compiled code cannot inherit memdb state.
        const fresh = instance(module).e;
        assert.equal(fresh.rt_init(1), 0);
        assert.equal(fresh.rt_open(), 0);
        assert.equal(fresh.rt_rows(), -1);
        assert.equal(e.rt_rows(), 2);
        break;
      }
      default: throw new Error('unknown test scenario');
    }
  }
  parentPort.postMessage({ ok: true, scenario: workerData, details });
}
