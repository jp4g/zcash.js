// Real browser dedicated module worker; no Node compatibility shim or shared memory.
function check(value, message) { if (!value) throw new Error(message); }
function equal(actual, expected, message) { check(actual === expected, `${message}: ${actual} !== ${expected}`); }
function throws(fn, pattern) {
  let error;
  try { fn(); } catch (caught) { error = caught; }
  check(error && (!pattern || pattern.test(String(error))), `expected exception ${pattern || ''}`);
}

self.onmessage = async ({ data: scenario }) => {
  self.onmessage = null; // One scenario owns this instance until external destruction.
  try {
    check(self instanceof DedicatedWorkerGlobalScope, 'dedicated worker required');
    equal(self.crossOriginIsolated, false, 'no isolation headers baseline');
    equal(typeof SharedArrayBuffer, 'undefined', 'SAB unavailable baseline');
    check(self.isSecureContext, 'secure loopback origin required for real entropy');
    const { load, inventory } = await import('./bindings/loader.mjs');
    const response = await fetch('./bindings/qualification_bg.wasm');
    check(response.ok, 'WASM fetch');
    const module = await WebAssembly.compile(await response.arrayBuffer());
    const { e, state } = await load({ module, entropyAvailable: scenario !== 'entropy-unavailable' });
    const details = { dedicatedWorker: true, crossOriginIsolated: self.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer, memoryShared: !(e.memory.buffer instanceof ArrayBuffer) };
    equal(details.memoryShared, false, 'ordinary WASM memory');
    if (scenario === 'unknown-import') {
      throws(() => new WebAssembly.Instance(module, {}));
      const unknown = new WebAssembly.Module(Uint8Array.from([
        0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,7,1,1,120,1,121,0,0,
      ]));
      throws(() => inventory(unknown), /import contract mismatch/);
    } else if (scenario === 'entropy-unavailable') {
      throws(() => e.rt_init(1), /entropy unavailable/);
    } else if (scenario === 'omitted-pool') {
      check(e.rt_init(0) !== 0, 'pool omission must fail init');
      check(e.rt_open() !== 0, 'pool omission must fail open');
    } else {
      equal(e.rt_init(1), 0, 'SQLite init');
      equal(e.rt_open(), 0, 'SQLite memdb open');
      if (scenario === 'fresh-after-destruction') {
        equal(e.rt_fixture_schema_count(), 0, 'successful schema query proves new empty memdb');
      } else if (scenario === 'entropy-loss') {
        equal(e.rt_hosts(), 1, 'hosts initially available');
        state.entropyAvailable = false;
        throws(() => e.rt_hosts(), /entropy unavailable/);
        // No WASM call is allowed after this host exception; parent destroys worker.
      } else if (scenario === 'pool-canary-corruption') {
        equal(e.rt_pool_check(), 1, 'valid pool');
        const bytes = new Uint8Array(e.memory.buffer);
        bytes[e.rt_pool_start() - 1] ^= 1;
        equal(e.rt_pool_check(), 0, 'pool check detects corrupted boundary');
      } else if (scenario === 'heap-corruption') {
        equal(e.rt_grow(1024 * 1024), 1, 'Rust heap initialized');
        new Uint8Array(e.memory.buffer)[e.rt_heap_ptr()] ^= 1;
        equal(e.rt_heap_check(), 0, 'Rust byte check detects corruption');
      } else if (scenario === 'same-instance') {
        equal(e.rt_fixture_schema_count(), 0, 'initial schema absence');
        equal(e.rt_sql(), 42, 'real commit rollback blob integrity fixture');
        equal(e.rt_rows(), 2, 'committed row count');
        equal(e.rt_pairing(), 1, 'Common BLS pairing in same SQLite instance');
        equal(e.rt_pool_size(), 16 * 1024 * 1024, 'fixed SQLite pool');
        const poolStart = e.rt_pool_start();
        const poolEnd = poolStart + e.rt_pool_size();
        check(poolEnd <= Number(e.__heap_base.value), 'SQLite pool below Rust heap');
        equal(e.rt_pool_check(), 1, 'allocation bounds and canaries');
        equal(e.rt_unsupported_hosts(), 1, 'unsupported filesystem and extension calls fail');
        details.pool = { start: poolStart, end: poolEnd, heapBase: Number(e.__heap_base.value) };
        details.growth = [];
        let expectedTotal = 42;
        for (const megabytes of [8, 32, 64]) {
          const oldBuffer = e.memory.buffer;
          equal(e.rt_grow(megabytes * 1024 * 1024), 1, 'growing Rust allocations');
          check(e.memory.buffer !== oldBuffer, 'growth replaces backing buffer');
          equal(oldBuffer.byteLength, 0, 'old view detached');
          const before = Date.now();
          equal(e.rt_hosts(), 1, 'real entropy writes through refreshed views plus time/sleep');
          const julian = e.rt_time();
          check(julian >= before + 210866760000000 && julian <= Date.now() + 210866760000000,
            'SQLite Julian host time bound');
          equal(e.rt_pairing(), 1, 'pairing after growth');
          expectedTotal += 2;
          equal(e.rt_cycle(), expectedTotal, 'repeated SQL commits rollbacks blobs integrity after crypto/growth');
          equal(e.rt_heap_check(), 1, 'Rust bytes intact');
          equal(e.rt_rows(), 2, 'SQLite rows survive growth');
          equal(e.rt_oom(), 1, 'SQLite OOM and integrity remain checked');
          equal(e.rt_rows(), 2, 'failed OOM write leaves rows intact');
          equal(e.rt_pool_check(), 1, 'pool and canaries survive growth/crypto/OOM');
          details.growth.push({ rustBytes: megabytes * 1024 * 1024, memoryBytes: e.memory.buffer.byteLength });
        }
        check(state.entropyCalls >= 4 && state.timeCalls >= 6 && state.sleepCalls >= 3,
          'actual host call counts');
        details.hosts = { ...state };
      } else throw new Error(`unknown browser scenario ${scenario}`);
    }
    self.postMessage({ ok: true, scenario, details });
  } catch (error) {
    self.postMessage({ ok: false, scenario, error: String(error), stack: error.stack });
  }
};
