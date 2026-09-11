import { Domain } from './domain.mjs';
import { oneWorker } from './one-worker.mjs';
import { validateEvidence } from './evidence.mjs';
export const context = { secure: isSecureContext, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer };
const spawn = entry => () => {
  const native = new Worker(new URL(entry, import.meta.url), { type: 'module' });
  return { set onmessage(fn) { native.onmessage = fn; }, set onerror(fn) { native.onerror = fn; },
    postMessage: data => native.postMessage(data), terminate: () => native.terminate() };
};
async function moduleAt(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw Error(`asset ${path}: ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (!WebAssembly.validate(bytes)) throw Error('WASM feature validation failed');
  return WebAssembly.compile(bytes);
}
export async function runScenario(scenario) {
  const events = [];
  const fallback = async reason => ({ reason, baseline: await oneWorker(spawn('./browser-baseline.mjs'), {
    module: await moduleAt('./baseline/qualification_bg.wasm'), bindingsURL: new URL('./baseline/qualification.js',import.meta.url).href,
  }) });
  if (scenario === 'no-sab') {
    if (!context.secure || context.isolated || context.sab !== 'undefined') throw Error('not a true secure no-SAB realm');
    const result = await fallback('no shared capability');
    const c = result.baseline.context;
    if (!c.secure || c.isolated || c.sab !== 'undefined') throw Error('baseline worker capability');
    return { ok: true, scenario, context, result };
  }
  if (!context.secure || !context.isolated || context.sab !== 'function') throw Error('isolated shared prerequisites absent');
  const d = new Domain({ spawn: spawn('./browser-worker.mjs'), count: 2, timeout: 10000,
    init: { module: await moduleAt('./threaded/qualification_bg.wasm'),
      bindingsURL: new URL('./threaded/qualification.js',import.meta.url).href, fault: scenario === 'shared' ? undefined : scenario },
    fallback, event: data => { if (data.type !== 'pool') events.push(data); else events.push({ role: data.role, type: data.type, context: data.context }); } });
  try {
    let rejected = false; try { d.call('sql'); } catch { rejected = true; }
    if (!rejected) throw Error('export accepted before readiness');
    const ready = await d.start();
    if (scenario !== 'shared') {
      if (!ready.baseline || ready.baseline.schemaBefore !== 0) throw Error('fresh fallback missing');
      return { ok: true, scenario, context, ready, events };
    }
    if (ready.baseline) throw Error('shared path fell back');
    for (const event of events.filter(e => e.context)) {
      if (!event.context.secure || !event.context.isolated || event.context.sab !== 'function') throw Error('worker isolation missing');
    }
    const rows = validateEvidence(await d.call('evidence'));
    const sql = await d.call('sql'), pairing = await d.call('pairing'), pool = await d.call('pool');
    const growth = await d.call('growth', [32 * 1024 * 1024]);
    const afterGrowth = validateEvidence(await d.call('evidence'));
    const cycle = await d.call('cycle');
    if (sql !== 42 || pairing !== 1 || pool !== 1 || growth !== 1 || cycle !== 44) throw Error('owner fixture result');
    return { ok: true, scenario, context, ready, rows, sql, pairing, pool, growth, afterGrowth, cycle, events };
  } finally { await d.close(); }
}
