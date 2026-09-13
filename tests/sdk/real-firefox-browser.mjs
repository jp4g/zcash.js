import {birthdayChecks} from './birthday-checks.mjs';
import {viewingChecks} from './viewing-checks.mjs';
import {publicClientChecks} from './public-client-fixture.mjs';
import {lightClientChecks} from './light-client-fixture.mjs';
// Browser-only probe. The internal read hook is test access, never a public SDK export.
const claims = ['packed-esm', 'packed-bundle', 'amounts-ids', 'no-eager', 'negative-eager',
  'negative-unsupported', 'precision-utf8', 'deadline', 'abort', 'invalid-utf8', 'rpc-error-no-retry', 'public-network','public-light','public-client','public-viewing','public-birthday'];
const check = (condition, label) => { if (!condition) throw Error(label); };
const keys = ['Worker', 'SharedWorker', 'WebAssembly', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
export async function guarded(load) {
  const counts = Object.fromEntries(keys.map(key => [key, 0]));
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true,
      get() { counts[key]++; throw Error(`eager ${key}`); } });
    await load();
    // Include queued tasks from import/construct in the bounded observation window.
    await new Promise(resolve => setTimeout(resolve, 100));
    check(Object.values(counts).every(n => n === 0), 'eager initialization');
  } finally {
    keys.forEach((key, i) => descriptors[i] ? Object.defineProperty(globalThis, key, descriptors[i]) : delete globalThis[key]);
  }
  return counts;
}
export function sanitized(error) {
  check(!JSON.stringify([error.message, error.stack, error]).includes('private-fixture'), 'sanitized structured error');
}
export async function run() {
  const policy = { sourceId: 'firefox-synthetic', timeoutMs: 2000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4096 };
  let sdk, bundled;
  const resourceStart = performance.getEntriesByType('resource').length;
  const violations = [];
  const violation = event => violations.push(event.violatedDirective);
  document.addEventListener('securitypolicyviolation', violation);
  const eager = await guarded(async () => {
    sdk = await import('/package/dist/src/index.js');
    bundled = await import('/bundle.mjs');
    for (const api of [sdk, bundled.sdk]) {
      check(Object.keys(api).sort().join(',') === 'accountFromViewingKey,accountIndex,addresses,blockHash,createLightClient,createPublicClient,defineNetwork,diversifierIndex,formatZec,grpc,http,isZcashError,parseZec,resolveBirthday,txId,viewing', 'root exports');
      check(api.parseZec('9007199254740993.00000001') === 900719925474099300000001n, 'amount parse');
      check(api.formatZec(900719925474099300000001n) === '9007199254740993.00000001', 'amount format');
      check(api.txId('a'.repeat(64)) === 'a'.repeat(64) && api.blockHash('b'.repeat(64)) === 'b'.repeat(64), 'hash IDs');
      check(api.accountIndex(0) === 0 && api.diversifierIndex(0n) === 0n, 'index IDs');
      check(Object.keys(api.http(`${location.origin}/rpc`, policy)).length === 0, 'opaque transport');
    }
  });
  document.removeEventListener('securitypolicyviolation', violation);
  check(violations.length === 0, 'CSP violation during import/construction');
  const importResources = performance.getEntriesByType('resource').slice(resourceStart).map(entry => entry.name);
  check(importResources.every(name => {
    const url = new URL(name);
    return url.origin === location.origin && (url.pathname.startsWith('/package/dist/') || url.pathname === '/bundle.mjs');
  }), 'unexpected import resource');
  let negativeEager = 0;
  try { await guarded(() => import('/negative-eager.mjs')); }
  catch (error) { check(String(error).includes('eager Worker'), 'negative eager cause'); negativeEager++; }
  check(negativeEager === 1, 'negative eager gate must reject');
  let unsupported = false;
  try { await import('/negative-unsupported.mjs'); } catch (error) { unsupported = error instanceof SyntaxError; }
  check(unsupported, 'unimplemented named import must reject in Firefox');
  const network = await networks([sdk, bundled.sdk]);
  const transport = bundled.sdk.http(`${location.origin}/rpc`, policy);
  const read = (mode, signal, t = transport) => bundled.readRpc(t, 'getblockhash', [mode, 7, true, '€'], signal);
  const good = await read('good');
  check(good.value.text === '9007199254740993' && good.text === '€雪😀', 'precision/streamed UTF8');
  const errors = {};
  async function rejects(mode, code, signal, t) {
    const start = performance.now();
    try { await read(mode, signal, t); throw Error(`unexpected success ${mode}`); }
    catch (error) {
      check(bundled.sdk.isZcashError(error) && error.code === code, `${mode}: ${error.code}`);
      sanitized(error);
      check(performance.now() - start < 5000, `${mode} exceeded bound`);
      errors[mode] = { code: error.code, retryable: error.retryable, elapsedMs: performance.now() - start };
    }
  }
  await rejects('deadline', 'TIMEOUT', undefined, bundled.sdk.http(`${location.origin}/rpc`, { ...policy, timeoutMs: 300 }));
  const controller = new AbortController();
  // Wait for the real server to confirm this request entered a stalled response.
  const aborted = rejects('abort', 'ABORTED', controller.signal);
  try {
    const until = performance.now() + 1500;
    while (true) {
      const status = await (await fetch('/fixture-state')).json();
      if (status.abortStarted) break;
      check(performance.now() < until, 'abort fixture did not start');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally { controller.abort(); }
  await aborted;
  await rejects('invalid', 'PROTOCOL_MISMATCH');
  await rejects('rpc-error', 'METHOD_NOT_SUPPORTED', undefined, bundled.sdk.http(`${location.origin}/rpc`,
    { ...policy, readRetry: { attempts: 3, delayMs: 0 } }));
  check(errors['rpc-error'].retryable === false, 'RPC error retryability');
  const vector=await(await fetch('/light-vector.json')).json(),light=[];
  for(const api of [sdk,bundled.sdk]) {
    const previous=(await(await fetch('/fixture-state')).json()).lightRequests.length;
    light.push(await lightClientChecks(api,(mode='good')=>api.grpc(location.origin,{...policy,maxResponseBytes:4*1024*1024,headers:async()=>({'x-fixture-mode':mode})}),vector,async(method,mode)=>{
      const deadline=performance.now()+3000;
      while(performance.now()<deadline) {
        const state=await(await fetch('/fixture-state')).json();
        if(state.lightRequests.slice(previous).some(r=>r.method===method&&r.mode===mode))return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw Error('light dispatch timeout');
    }));
  }
  const publicClients=[];
  for(const api of [sdk,bundled.sdk]) {
    const previous=(await(await fetch('/fixture-state')).json()).publicRequests.length;
    publicClients.push(await publicClientChecks(api,(mode='good')=>api.http(location.origin+'/public-rpc',{...policy,maxResponseBytes:4*1024*1024,headers:()=>({'x-fixture-mode':mode})}),vector,async(method,mode)=>{
      const deadline=performance.now()+3000;
      while(performance.now()<deadline){const state=await(await fetch('/fixture-state')).json();if(state.publicRequests.slice(previous).some(r=>r.method===method&&r.mode===mode))return;await new Promise(resolve=>setTimeout(resolve,10));}
      throw Error('public dispatch timeout');
    }));
  }
  const birthdays=[]; for(const api of [sdk,bundled.sdk]) birthdays.push(await birthdayChecks(api));
  const viewing=[]; for(const api of [sdk,bundled.sdk]) viewing.push(await viewingChecks(api));
  return { ok: true, claims, network, light, publicClients, viewing, birthdays, eager, importResources, negativeEager, precision: good.value.text, utf8: good.text, errors,
    userAgent: navigator.userAgent, secureContext: isSecureContext, crossOriginIsolated };
}

async function networks(apis) {
  const counts = { modules: 0, instances: 0, fetches: 0, workers: 0, descriptors: 0, cancelled: 0 };
  const Module = WebAssembly.Module, Instance = WebAssembly.Instance;
  const fetch = globalThis.fetch, Worker = globalThis.Worker, SharedWorker = globalThis.SharedWorker;
  const definition = () => ({ identity: 'synthetic-regtest', genesisHash: '03'.repeat(32), parametersFormat: 'zcash-js-network/1',
    parameters: new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}') });
  WebAssembly.Module = new Proxy(Module, { construct(target, args) { counts.modules++; return Reflect.construct(target, args); } });
  WebAssembly.Instance = new Proxy(Instance, { construct(target, args) { counts.instances++; return Reflect.construct(target, args); } });
  globalThis.fetch = () => { counts.fetches++; throw Error('network codec fetch'); };
  globalThis.Worker = globalThis.SharedWorker = function () { counts.workers++; throw Error('network codec worker'); };
  try {
    for (const api of apis) {
      const rejected = async (operation, code) => {
        try { await operation; throw Error('unexpected network success'); }
        catch (error) { check(api.isZcashError(error) && error.code === code, `network rejection ${code}`); }
      };
      await rejected(api.defineNetwork({ ...definition(), extra: true }), 'INVALID_ARGUMENT');
      await rejected(api.defineNetwork({ ...definition(), parameters: new Uint8Array(257) }), 'RESOURCE_LIMIT');
      await rejected(api.defineNetwork({ ...definition(), signal: AbortSignal.abort() }), 'ABORTED'); counts.cancelled++;
      const controller = new AbortController();
      const pending = api.defineNetwork({ ...definition(), signal: controller.signal }); controller.abort();
      await rejected(pending, 'ABORTED'); counts.cancelled++;
      check(counts.modules === counts.descriptors, 'cancel before native initialization');
      const input = definition(), created = api.defineNetwork(input);
      input.parameters.fill(0); input.identity = 'mutated';
      const network = await created; counts.descriptors++;
      check(Object.isFrozen(network) && network.identity === 'synthetic-regtest' && network.genesisHash === '03'.repeat(32), 'owned network descriptor');
      check(Object.keys(network).sort().join(',') === 'genesisHash,identity', 'opaque network descriptor');
      const synthetic = new AbortController(); synthetic.signal.dispatchEvent(new Event('abort'));
      await api.defineNetwork({ ...definition(), signal: synthetic.signal });
      check(counts.modules === counts.descriptors && counts.instances === counts.descriptors, 'one native instance per package module');
    }
    check(counts.fetches === 0 && counts.workers === 0, 'no codec workers or fetch');
  } finally {
    WebAssembly.Module = Module; WebAssembly.Instance = Instance;
    globalThis.fetch = fetch; globalThis.Worker = Worker; globalThis.SharedWorker = SharedWorker;
  }
  return counts;
}
