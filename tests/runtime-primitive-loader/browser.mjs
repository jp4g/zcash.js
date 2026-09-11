import { openPrimitive } from './src/runtime/primitive-loader.js';
import { run as network } from './network-cases.mjs';
import { run as transaction } from './transaction-cases.mjs';
import { encode, valid, format } from './vectors.mjs';
const check = (ok, why) => { if (!ok) throw Error(why); };
const rejects = async (work, code) => { try { await work; } catch (e) { check(e.code === code, `expected ${code}, got ${e.code}`); return; } throw Error('missing rejection'); };
const nativeWorker = Worker, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
const evidence = window.primitiveEvidence = { workers: [], blobs: [], revoked: [], closures: 0, acknowledged: 0 };
window.Worker = class extends nativeWorker {
  constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
};
URL.createObjectURL = function(...args) { const url = create.apply(this, args); evidence.blobs.push(url); return url; };
URL.revokeObjectURL = function(url) { evidence.revoked.push(url); return revoke.call(this, url); };
async function closure(runtime) {
  if (runtime) { const a = runtime.close(); check(a === runtime.close(), 'cached close'); await a; }
  check(evidence.blobs.length === evidence.revoked.length, 'all owned Blob URLs revoked');
  evidence.closures++;
  // Parent acknowledges observed BiDi realm destruction before the next owner.
  await new Promise(resolve => { window.acknowledgePrimitiveClosure = () => { evidence.acknowledged++; resolve(); }; });
}
window.primitiveResult = (async () => {
  const pin = await (await fetch('/pin.json')).json();
  const artifact = { manifestUrl: location.origin + '/release/manifest.json', manifestSha256: pin.manifestSha256 };
  const blocked = location.pathname !== '/';
  if (blocked) {
    let failure;
    try { const r = await openPrimitive(artifact, { timeoutMs: 5000 }); await r.close(); }
    catch (e) { failure = e.code; }
    check(failure === 'RUNTIME_UNAVAILABLE', `truthful CSP rejection: ${failure}`);
    await closure();
    return { csp: location.pathname, failure, evidence };
  }
  const negatives = await (await fetch('/negative.json')).json();
  for (const fixture of negatives) await rejects(openPrimitive({ manifestUrl: location.origin + fixture.path, manifestSha256: fixture.manifestSha256 }), 'RUNTIME_UNAVAILABLE');
  check(evidence.workers.length === 0 && evidence.blobs.length === 0, 'all corrupt/extra-import fixtures rejected before executable creation');
  const vectors = await (await fetch('/transaction-vectors.json')).json();
  let runtime = await openPrimitive(artifact);
  let n, tx;
  try {
    n = await network(runtime.consensusContext); tx = await transaction(runtime.decodeTransaction, vectors);
    // Native page-realm abort/view controls, with no WebDriver module imports.
    const doc = encode(valid[0].text), detached = doc.slice();
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    await rejects(runtime.consensusContext(format, detached, 20), 'INVALID_ARGUMENT');
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'aborted', { value: false });
    const pending = runtime.consensusContext(format, doc, 20, { signal: controller.signal });
    controller.abort('private detail'); await rejects(pending, 'ABORTED');
    await rejects(runtime.consensusContext(format, doc, 20), 'ABORTED');
  } finally { await closure(runtime); }
  let admissionCases = 0, admissionPosts = 0;
  window.Worker = class extends nativeWorker {
    constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
    postMessage(message, ...rest) { if (message.type !== 'init') admissionPosts++; return super.postMessage(message, ...rest); }
  };
  for (const operation of ['context', 'transaction']) for (const trigger of ['signal', 'timeoutMs', 'getPrototypeOf', 'ownKeys', 'get']) for (const action of ['close', 'reenter']) {
    runtime = await openPrimitive(artifact);
    const invoke = options => operation === 'context' ? runtime.consensusContext(format, encode(valid[0].text), 20, options)
      : runtime.decodeTransaction(Uint8Array.of(1), 0, options);
    let inner, fired = false;
    const callback = () => { if (fired) return; fired = true; inner = action === 'close' ? runtime.close() : invoke(); inner.catch(() => {}); };
    let options = { timeoutMs: 20 };
    if (trigger === 'signal' || trigger === 'timeoutMs') Object.defineProperty(options, trigger, { get() { callback(); return trigger === 'signal' ? undefined : 20; } });
    else options = new Proxy(options, { [trigger](...args) { callback(); return Reflect[trigger](...args); } });
    const before = admissionPosts;
    try {
      await rejects(invoke(options), action === 'close' ? 'CLOSED' : 'RESOURCE_LIMIT');
      if (action === 'close') { await inner; check(admissionPosts === before, 'no dispatch after close'); }
      else {
        if (operation === 'context') check((await inner).branchId === 1991772603, 'real inner owner result');
        else await rejects(inner, 'INVALID_ARGUMENT');
        check(admissionPosts === before + 1, 'one admitted request');
        await new Promise(resolve => setTimeout(resolve, 30));
        check((await runtime.consensusContext(format, encode(valid[0].text), 20)).branchId === 1991772603, 'unadmitted deadline cleared');
      }
      admissionCases++;
    } finally { await closure(runtime); }
  }
  const startup = new AbortController();
  // Hold initialization until the parent observes the actual worker realm, then
  // fire a native page-owned caller signal while startup is still pending.
  evidence.startupAbortPending = true;
  window.abortPrimitiveStartup = () => { evidence.startupAbortPending = false; startup.abort(); };
  window.Worker = class extends nativeWorker {
    constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
    postMessage() {}
  };
  await rejects(openPrimitive(artifact, { signal: startup.signal }), 'ABORTED');
  await closure();
  window.Worker = class extends nativeWorker {
    constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
    postMessage(message, ...rest) { if (message.type === 'init') super.postMessage(message, ...rest); }
  };
  runtime = await openPrimitive(artifact);
  try { await rejects(runtime.consensusContext(format, encode(valid[0].text), 20, { timeoutMs: 20 }), 'TIMEOUT'); }
  finally { await closure(runtime); }
  window.Worker = class extends nativeWorker {
    constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
    postMessage() {} // Lost initialization transport; the native worker is real.
  };
  await rejects(openPrimitive(artifact, { timeoutMs: 3000 }), 'TIMEOUT');
  await closure();
  window.Worker = class extends nativeWorker {
    constructor(url, options) { super(url, options); evidence.workers.push(String(url)); }
  };
  runtime = await openPrimitive(artifact);
  try { check((await runtime.consensusContext(format, encode(valid[0].text), 20)).branchId === 1991772603, 'fresh owner usable'); }
  finally { await closure(runtime); }
  return { admissionCases, integrityRejections: negatives.length, network: n, transaction: tx, nativeSignals: true, nativeViews: true, evidence };
})().then(result => ({ result }), error => ({ error: { name: error.name, message: error.message, stack: error.stack } }));
