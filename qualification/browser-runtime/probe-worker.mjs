// Browser-only runtime acceptance tests. Every scenario owns one real instance.
import { loadRuntime } from './loader.mjs';
import { state } from './runtime-host.mjs';

function check(value, message) { if (!value) throw new Error(message); }
function equal(actual, expected, label) {
  check(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}
function throws(fn, pattern) {
  try { fn(); } catch (error) {
    check(pattern.test(String(error)), `unexpected exception: ${error}`);
    return;
  }
  throw new Error(`expected exception ${pattern}`);
}

self.onmessage = async ({ data: { scenario, manifest } }) => {
  try {
    const context = {
      secure: isSecureContext,
      isolated: crossOriginIsolated,
      sab: typeof SharedArrayBuffer,
      dedicatedWorker: self instanceof DedicatedWorkerGlobalScope,
      userAgent: navigator.userAgent,
    };
    equal(context.secure, true, 'secure worker');
    equal(context.isolated, false, 'non-isolated worker');
    equal(context.sab, 'undefined', 'SAB unavailable naturally');
    equal(context.dedicatedWorker, true, 'dedicated worker');
    const { exports: e, evidence } = await loadRuntime(manifest);
    check(e.memory.buffer instanceof ArrayBuffer, 'non-shared linear memory');
    let details = {};
    if (scenario === 'entropy-unavailable') {
      state.entropyAvailable = false;
      throws(() => e.rt_init(1), /entropy unavailable/);
    } else if (scenario === 'omitted-pool') {
      check(e.rt_init(0) !== 0, 'ZERO_MALLOC must reject omitted pool');
      check(e.rt_open() !== 0, 'database must remain unavailable');
    } else {
      equal(e.rt_init(1), 0, 'initialize pool');
      equal(e.rt_open(), 0, 'open memdb');
      switch (scenario) {
        case 'same-instance':
        case 'destruction-original':
          equal(e.rt_sql(), 42, 'SQL commit rollback blob integrity');
          equal(e.rt_pairing(), 1, 'Common BLS pairing in same instance');
          equal(e.rt_rows(), 2, 'SQL state survives pairing');
          details = { sqlTotal: 42, rows: 2, pairing: 1 };
          break;
        case 'pool':
          equal(e.rt_pool_check(), 1, 'pool exhaustion bounds alignment canaries');
          equal(e.rt_pool_size(), 16 * 1024 * 1024, 'pool bytes');
          check(e.rt_pool_start() + e.rt_pool_size() <= Number(e.__heap_base.value), 'pool below Rust heap');
          details = { poolStart: e.rt_pool_start(), poolBytes: e.rt_pool_size(), heapBase: Number(e.__heap_base.value) };
          break;
        case 'canary-corruption':
          new Uint8Array(e.memory.buffer)[e.rt_pool_start() - 1] ^= 1;
          equal(e.rt_pool_check(), 0, 'actual pool canary corruption detected');
          break;
        case 'heap-corruption':
          equal(e.rt_grow(1024 * 1024), 1, 'Rust allocation before corruption');
          new Uint8Array(e.memory.buffer)[e.rt_heap_ptr()] ^= 1;
          equal(e.rt_heap_check(), 0, 'actual Rust heap corruption detected');
          break;
        case 'oom':
          equal(e.rt_sql(), 42, 'SQL fixture');
          equal(e.rt_oom(), 1, 'SQLite OOM and integrity');
          equal(e.rt_rows(), 2, 'rows survive OOM');
          equal(e.rt_pool_check(), 1, 'pool survives OOM');
          break;
        case 'growth': {
          equal(e.rt_sql(), 42, 'SQL before Rust growth');
          const old = e.memory.buffer;
          const oldBytes = old.byteLength;
          equal(e.rt_grow(32 * 1024 * 1024), 1, 'Rust growth/check');
          check(e.memory.buffer !== old, 'Rust allocation must grow memory');
          equal(old.byteLength, 0, 'old views detached');
          equal(e.rt_rows(), 2, 'SQL after Rust growth');
          equal(e.rt_cycle(), 44, 'SQL commit rollback blob integrity with live Rust allocation');
          equal(e.rt_cycle(), 46, 'repeat SQL mutation with live Rust allocation');
          equal(e.rt_hosts(), 1, 'host calls after growth');
          equal(state.lastEntropyMemoryBytes, e.memory.buffer.byteLength, 'entropy refreshed view');
          equal(e.rt_heap_check(), 1, 'Rust bytes after host calls');
          equal(e.rt_pool_check(), 1, 'pool after Rust growth');
          equal(e.rt_pairing(), 1, 'pairing after Rust growth');
          details = { oldBytes, memoryBytes: e.memory.buffer.byteLength, ...state };
          break;
        }
        case 'hosts': {
          const before = Date.now();
          equal(e.rt_hosts(), 1, 'entropy time sleep through memdb VFS');
          const julian = e.rt_time();
          check(julian >= before + 210866760000000 && julian <= Date.now() + 210866760000000, 'Julian time range');
          check(state.entropyCalls >= 2 && state.timeCalls >= 2 && state.sleepCalls >= 1, 'host callback counts');
          equal(e.rt_unsupported_hosts(), 1, 'unsupported lower host operations fail explicitly');
          details = { julian, ...state };
          break;
        }
        case 'entropy-loss':
          state.entropyAvailable = false;
          throws(() => e.rt_hosts(), /entropy unavailable/);
          break;
        case 'time-loss':
          state.timeAvailable = false;
          throws(() => e.rt_time(), /time unavailable/);
          break;
        case 'sleep-loss':
          state.sleepAvailable = false;
          throws(() => e.rt_hosts(), /sleep unavailable/);
          break;
        case 'destruction-fresh':
          equal(e.rt_fixture_schema_count(), 0, 'successful fresh schema absence query');
          details = { fixtureSchemaCount: 0 };
          break;
        default: throw new Error(`unknown scenario ${scenario}`);
      }
    }
    self.postMessage({ ok: true, scenario, context, evidence, details });
  } catch (error) {
    self.postMessage({ ok: false, scenario, error: String(error), stack: error.stack });
  }
};
