import { checkThreaded } from './artifact-check.mjs';
// Both hosts consume exactly the same unmodified generated web-target glue.
export function install({ send, listen, context }) {
  let bindings, exports, memory, ready = false, role, fault;
  listen(async data => {
    try {
      if (data.type === 'init') {
        if (bindings) throw Error('duplicate init');
        role = data.role; fault = data.fault;
        if (fault === 'owner-error' && role === 'owner') throw Error('injected owner bootstrap failure');
        if (fault === 'owner-stall' && role === 'owner') return;
        checkThreaded(data.module);
        bindings = await import(data.bindingsURL);
        if (role === 'owner') {
          exports = await bindings.default({ module_or_path: data.module });
          memory = exports.memory;
          if (!(memory.buffer instanceof SharedArrayBuffer)) throw Error('threaded memory is not shared');
          (await import(new URL('./runtime-host.mjs', data.bindingsURL))).attach(memory, true);
          bindings.owner_prepare(data.count);
          let gated = false;
          try { bindings.parallel_evidence(); } catch { gated = true; }
          if (!gated) throw Error('Rust accepted export before readiness');
          send({ type: 'pool', module: data.module, memory, bindingsURL: data.bindingsURL, context: context() });
        } else {
          if (fault === 'compute-error' && data.index === 1) throw Error('injected compute bootstrap failure');
          if (fault === 'compute-stall' && data.index === 1) return;
          exports = await bindings.default({ module_or_path: data.module, memory: data.memory });
          memory = exports.memory;
          if (memory.buffer !== data.memory.buffer) throw Error('worker did not attach matching shared memory');
          (await import(new URL('./runtime-host.mjs', data.bindingsURL))).attach(memory, false);
          send({ type: 'loaded', index: data.index, context: context(), shared: memory.buffer instanceof SharedArrayBuffer });
          bindings.worker_enter(data.index); // Actual blocking Rayon loop.
          throw Error('Rayon worker returned');
        }
      } else if (data.type === 'build') {
        if (role !== 'owner' || ready) throw Error('unexpected build');
        bindings.owner_build(); ready = true;
        send({ type: 'ready', context: context(), shared: memory.buffer instanceof SharedArrayBuffer });
      } else if (data.type === 'call') {
        if (!ready || role !== 'owner') throw Error('owner not ready');
        const operations = {
          evidence: () => Array.from(bindings.parallel_evidence()),
          sql: () => { if (bindings.owner_sql_init() !== 0) throw Error('SQLite init'); return bindings.owner_sql(); },
          pairing: () => bindings.owner_pairing(), pool: () => bindings.owner_pool_check(),
          cycle: () => bindings.owner_cycle(), growth: () => bindings.owner_grow(...data.args),
          // Scanner integrator supplies a new Rust owner export + explicit entry here.
        };
        if (!Object.hasOwn(operations, data.operation)) throw Error('unknown operation');
        const result = operations[data.operation](); send({ type: 'result', id: data.id, result });
      } else throw Error('unknown message');
    } catch (error) { send({ type: 'error', error: String(error), stack: error.stack }); }
  });
}
