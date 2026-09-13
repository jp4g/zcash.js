import type { NetworkDefinition, Op, RuntimeOptions, WalletStorage, WasmArtifact, ZcashError } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { bindNetworkDefinition } from '../network-parameters.js';
import { operation } from '../clients/light-chain-reads.js';
import type { WalletQueueBudget } from '../wallet/host.js';
import { attachWalletWorker } from '../wallet/host.js';
import { acquireArtifacts, artifactEndpoint } from './artifacts.js';
import { sameRecord, walletProfile } from './wallet-profile.js';
import type { WalletRuntimeIdentity } from './wallet-profile.js';

const node = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
const unavailable = () => failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Wallet runtime unavailable.');
const mismatch = () => failure('PROTOCOL_MISMATCH', 'runtime', 'configure', 'Wallet runtime profile mismatch.');
const cancelled = () => failure('ABORTED', 'runtime', 'none', 'Wallet startup aborted.');
const timeout = () => failure('TIMEOUT', 'runtime', 'configure', 'Wallet startup timed out.');
const resource = () => failure('RESOURCE_LIMIT', 'runtime', 'configure', 'Wallet runtime limit unsupported.');
const layout = { 'wallet.mjs': 'module', 'worker.mjs': 'worker', 'bindings_bg.wasm': 'wasm', 'node-fs.mjs': 'glue', 'opfs.mjs': 'glue' } as const;
// Reviewed private producer + actual SDK bootstrap, not arbitrary same-profile JavaScript.
// Updating this immutable executable closure requires reviewing the corresponding package.
const reviewedAssets: Record<keyof typeof layout, string> = {
  'wallet.mjs': 'cb384ab43fc1b7c39c172a9f8c6bc65b018203c56d7ee07753b1a678101d9d7f',
  'worker.mjs': 'e395af0c50d5041fe068936c2aedd0beb06317a4f5812b5575ed7f18cc663fbd',
  'bindings_bg.wasm': '940d807cc35ecefffbc9c3db8130e51c6e758e28b7b44ed52468fd25539a13eb',
  'node-fs.mjs': 'e5ae70677191f3eb9898ea3dac0182cf10491cd98ef04c33ad4edfdb0265bd3e',
  'opfs.mjs': 'ac1c6f7bd38467e655ff84c1a28154a5f9086fb1e877dc9709b21d4fa4c2c645',
};
const policy = { ...walletProfile, mode: 'baseline' as const, maxManifestBytes: 16384,
  maxAssetBytes: 32 * 1024 * 1024, maxTotalAssetBytes: 40 * 1024 * 1024, maxFiles: 5, timeoutMs: 30000 };

function record(value: unknown, keys: string[]): Record<string, any> {
  try {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw 0;
    const owned = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !keys.includes(key)) throw 0;
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, 'value')) throw 0;
      owned[key] = property.value;
    }
    return owned;
  } catch { throw invalidArgument(); }
}

/** Browser capabilities only; this does not qualify a threaded artifact. */
export function browserThreadingPrerequisites(): boolean {
  return globalThis.isSecureContext === true && globalThis.crossOriginIsolated === true
    && typeof SharedArrayBuffer === 'function' && typeof Worker === 'function'
    && typeof Atomics === 'object' && typeof Atomics.wait === 'function' && typeof Atomics.notify === 'function';
}

/** Internal baseline construction. The returned session is not the complete WalletClient. */
export async function openWalletRuntime(options: { runtime: RuntimeOptions; storage: WalletStorage; network: NetworkDefinition } & Op) {
  const input = record(options, ['runtime', 'storage', 'network', 'signal']);
  const runtime = record(input.runtime, ['baseline', 'threading', 'maxMemoryBytes', 'maxQueuedBytes', 'maxQueuedJobs', 'scanBatchSize', 'maxPcztBytes', 'onDiagnostic']);
  const baseline = record(runtime.baseline, ['manifestUrl', 'manifestSha256']);
  const threading = record(runtime.threading, ['mode', 'artifact', 'workers', 'startupTimeoutMs']);
  if (!['baseline', 'prefer-threaded'].includes(threading.mode)) throw invalidArgument();
  if (threading.mode === 'baseline') {
    if (Object.keys(threading).length !== 1) throw invalidArgument();
  } else {
    if (Object.keys(threading).length !== 4) throw invalidArgument();
    artifactEndpoint(record(threading.artifact, ['manifestUrl', 'manifestSha256']) as unknown as WasmArtifact);
    for (const key of ['workers', 'startupTimeoutMs']) {
      if (!Number.isSafeInteger(threading[key]) || threading[key] <= 0) throw invalidArgument();
    }
  }
  const fallback = threading.mode === 'prefer-threaded' && !node && !browserThreadingPrerequisites();
  for (const key of ['maxMemoryBytes', 'maxQueuedBytes', 'maxQueuedJobs', 'scanBatchSize', 'maxPcztBytes']) {
    if (!Number.isSafeInteger(runtime[key]) || runtime[key] <= 0) throw invalidArgument();
  }
  // Reserve native maximum, verified inventory + executable staging copies, one
  // WASM initialization copy, manifest working space, and admitted payload/control
  // records. This bounds owned-allocation admission, not the engine/process RSS.
  // Reserve conversion space for bounded scan lowering and <=6 MiB native query
  // JSON, including parsed/projected records, <=2 MiB raw bytes and reply copies.
  const nativeScratchBytes = 64 * 1024 * 1024;
  const reserved = nativeScratchBytes + 4096 * 65536 + 2 * policy.maxTotalAssetBytes + policy.maxAssetBytes
    + 4 * policy.maxManifestBytes + runtime.maxQueuedBytes + 8192 * runtime.maxQueuedJobs
    + 8192 * 1024; // Native lifetime signer ceiling: one retained token/cleanup control each.
  if (!Number.isSafeInteger(reserved) || runtime.maxMemoryBytes < reserved) throw resource();
  if (runtime.onDiagnostic !== undefined && typeof runtime.onDiagnostic !== 'function') throw invalidArgument();
  const storage = record(input.storage, ['kind', 'path', 'name']);
  if (storage.kind !== 'memory' && storage.kind !== (node ? 'node-filesystem' : 'browser-opfs')) throw unavailable();
  const name = node ? 'path' : 'name';
  if (storage.kind === 'memory') { if (Object.keys(storage).length !== 1) throw invalidArgument(); }
  else if (Object.keys(storage).length !== 2 || typeof storage[name] !== 'string' || !storage[name].length
    || storage[name].includes('\0') || (!node && !/^[a-zA-Z0-9_-]{1,128}$/.test(storage.name))) throw invalidArgument();
  const network = bindNetworkDefinition(record(input.network, ['identity', 'genesisHash', 'parameters', 'parametersFormat']) as unknown as NetworkDefinition);
  const parameters = network.parameters.bytes;
  const genesis = Uint8Array.from(network.genesisHash.match(/../g)!.reverse(), hex => parseInt(hex, 16));
  const signal: AbortSignal | undefined = input.signal;
  // This qualified profile has no shared-memory executable. Only missing browser
  // prerequisites select baseline; a capable host must not silently downgrade.
  if (threading.mode === 'prefer-threaded' && !fallback) throw unavailable();
  artifactEndpoint(baseline as WasmArtifact);
  const pending = operation(signal);
  try { pending.check(); } catch (error) { pending.close(); throw error; }
  // Same immutable executable and limits share authority; no key migration across owners.
  const key = JSON.stringify([baseline.manifestUrl, baseline.manifestSha256, threading.mode,
    runtime.maxMemoryBytes, runtime.maxQueuedBytes, runtime.maxQueuedJobs, runtime.scanBatchSize, runtime.maxPcztBytes]);
  let entry = owners.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { refs: 0, wallets: 0, controller, ready: undefined! };
    const created = entry;
    entry.ready = createOwner(baseline as WasmArtifact, runtime, runtime.maxMemoryBytes-reserved, controller.signal, () => {
      if (owners.get(key) === created) owners.delete(key);
    });
    owners.set(key, entry);
  }
  if (entry.wallets >= runtime.maxQueuedJobs) { pending.close(); throw resource(); }
  entry.refs++; entry.wallets++;
  const selected = entry;
  let released = false, capacityReleased = false;
  const release = async (abandoned = false) => {
    if (!abandoned && !capacityReleased) { capacityReleased = true; selected.wallets--; }
    if (released) return;
    released = true; selected.refs--;
    if (!selected.refs) {
      if (owners.get(key) === selected) owners.delete(key);
      selected.controller.abort();
      try { await (await selected.ready).destroy(); } catch { /* Startup failure owns its cleanup. */ }
    }
  };
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let opening: Promise<OpenedWallet> | undefined;
  let opened: OpenedWallet | undefined;
  try {
    pending.check();
    const owner = await pending.wait(selected.ready);
    pending.check();
    try { runtime.onDiagnostic?.(Object.freeze(fallback ? { code: 'THREADED_FALLBACK', reason: 'prerequisiteMissing' } : { code: 'BASELINE_SELECTED', reason: 'requested' })); } catch { /* Diagnostics do not own startup. */ }
    pending.check();
    opening = owner.open(storage as WalletStorage, network.parametersFormat, parameters, genesis, release);
    const timed = new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(timeout()), 30000); });
    opened = await pending.wait(Promise.race([opening, timed]));
    pending.check();
    return Object.freeze({ identity: owner.identity, session: opened.session, close: opened.close,
      // Internal signer composition retains this owner independently of its creating wallet.
      owner: Object.freeze({
        identity: owner.token,
        check: owner.check,
        maxPcztBytes: runtime.maxPcztBytes,
        signers: owner.signers,
        invalidate: owner.invalidate,
        retain() {
          owner.check(); selected.refs++; let done = false;
          return async () => {
            if (done) return; done = true; selected.refs--;
            if (!selected.refs) {
              if (owners.get(key) === selected) owners.delete(key);
              selected.controller.abort(); await owner.destroy();
            }
          };
        },
      }),
    });
  } catch (error) {
    if (opened) await opened.close().catch(() => {});
    else if (opening) {
      // An abandoned acquisition keeps a capacity slot, never a lifetime lease.
      // Last-consumer destruction also cancels a host acquisition that cannot settle.
      await release(true);
      void opening.then(value => value.close(), () => release()).catch(() => {});
    }
    else await release();
    throw error;
  } finally { clearTimeout(deadline); pending.close(); }
}

type OpenedWallet = { session: ReturnType<typeof attachWalletWorker>; close(): Promise<void> };
type Owner = Awaited<ReturnType<typeof createOwner>>;
const owners = new Map<string, { refs: number; wallets: number; controller: AbortController; ready: Promise<Owner> }>();

async function createOwner(baseline: WasmArtifact, runtime: Record<string, any>, provingCapacity: number, signal: AbortSignal, forget: () => void) {
  let worker: { postMessage(value: unknown, transfer: any[]): void; terminate(): unknown } | undefined;
  const sessions = new Set<ReturnType<typeof attachWalletWorker>>();
  const budget: WalletQueueBudget = { jobs: 0, bytes: 0, active: false, wake: new Set(), signers: new Map(), proving: {capacity:provingCapacity,bytes:0,active:false} };
  let removeAssets = () => {}, removeEvents = () => {};
  let destroying: Promise<void> | undefined, stopped: ZcashError | undefined;
  let nextId = 0;
  const waiting = new Map<number, { resolve(value: any): void; reject(error: unknown): void }>();
  const destroy = () => destroying ??= Promise.resolve().then(async () => {
    forget();
    try { await worker?.terminate(); }
    finally { removeEvents(); removeAssets(); }
  });
  const stop = (error: ZcashError) => {
    if (stopped) return;
    stopped = error; forget();
    for (const request of waiting.values()) request.reject(error);
    waiting.clear();
    for (const session of sessions) session.crashed();
    void destroy().catch(() => {});
  };
  budget.crash = () => stop(failure('WORKER_CRASHED', 'runtime', 'reopen', 'Wallet worker failed.'));
  const check = () => { if (signal.aborted) throw cancelled(); if (stopped) throw stopped; };
  const onAbort = () => stop(cancelled());
  signal.addEventListener('abort', onAbort, {once:true});
  const timer = setTimeout(() => stop(timeout()), 30000);
  const request = (value: unknown, transfer: any[] = []) => new Promise<any>((resolve, reject) => {
    if (nextId >= Number.MAX_SAFE_INTEGER) { reject(resource()); return; }
    const id = ++nextId;
    try { check(); waiting.set(id, {resolve,reject}); worker!.postMessage({ ...(value as object), id }, transfer); }
    catch (error) { waiting.delete(id); reject(error); }
  });
  const message = (data: any) => {
    if (stopped) return;
    const pending = waiting.get(data?.id);
    if (!pending) { stop(mismatch()); return; }
    waiting.delete(data.id);
    if (data?.type === 'failure') {
      const codes = ['STORAGE_ERROR', 'STORAGE_BUSY', 'NETWORK_MISMATCH', 'INVALID_ARGUMENT', 'RESOURCE_LIMIT', 'PROTOCOL_MISMATCH', 'RUNTIME_UNAVAILABLE'];
      const code = ['SCHEMA_MISMATCH', 'VIEWING_SCHEMA_REQUIRED'].includes(data.code) ? 'MIGRATION_REQUIRED' : data.code;
      pending.reject(code === 'MIGRATION_REQUIRED' || codes.includes(code)
        ? failure(code, code.startsWith('STORAGE') || code === 'MIGRATION_REQUIRED' ? 'storage' : 'runtime', 'configure', 'Wallet startup failed.') : unavailable());
    } else pending.resolve(data);
    if (data.fatal === true) stop(unavailable());
  };
  try {
    check();
    const verified = await acquireArtifacts(baseline, policy, signal);
    try {
      check();
      if (verified.manifest.files.length !== 5 || verified.manifest.files.some(file => !Object.hasOwn(layout, file.url)
        || layout[file.url as keyof typeof layout] !== file.kind || reviewedAssets[file.url as keyof typeof layout] !== file.sha256)) throw mismatch();
      const { format, files, ...expected } = verified.manifest;
      const urls: Record<string, string> = {};
      let channels: () => MessageChannel;
      if (node) {
        const [fs, os, path, url, threads] = await Promise.all(['node:fs', 'node:os', 'node:path', 'node:url', 'node:worker_threads'].map(name => import(name)));
        check();
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zcash-wallet-runtime-'));
        removeAssets = () => fs.rmSync(directory, { recursive: true, force: true });
        for (const name of ['wallet.mjs', 'worker.mjs', 'node-fs.mjs']) {
          const file = path.join(directory, name);
          fs.writeFileSync(file, verified.copyFile(name), { flag: 'wx', mode: 0o600 });
          urls[name] = url.pathToFileURL(file).href;
        }
        channels = () => new threads.MessageChannel();
        const instance = new threads.Worker(new URL(urls['worker.mjs']!), { trackUnmanagedFds: true });
        worker = instance;
        const crash = () => stop(failure('WORKER_CRASHED', 'runtime', 'reopen', 'Wallet worker failed.'));
        instance.on('message', message); instance.on('messageerror', crash); instance.on('error', crash); instance.on('exit', crash);
        removeEvents = () => { instance.off('message', message); instance.off('messageerror', crash); instance.off('error', crash); instance.off('exit', crash); };
      } else {
        const created: string[] = [];
        removeAssets = () => { for (const url of created) URL.revokeObjectURL(url); };
        for (const name of ['wallet.mjs', 'worker.mjs', 'opfs.mjs']) {
          urls[name] = URL.createObjectURL(new Blob([verified.copyFile(name) as Uint8Array<ArrayBuffer>], { type: 'text/javascript' }));
          created.push(urls[name]!);
        }
        channels = () => new MessageChannel();
        const instance = new Worker(urls['worker.mjs']!, { type: 'module' }); worker = instance;
        instance.onmessage = event => message(event.data);
        instance.onerror = event => { event.preventDefault(); stop(unavailable()); };
        instance.onmessageerror = () => stop(mismatch());
        removeEvents = () => { instance.onmessage = null; instance.onerror = null; instance.onmessageerror = null; };
      }
      const wasm = verified.copyFile('bindings_bg.wasm');
      const ready = await request({ type: 'initialize', moduleUrl: urls['wallet.mjs'], wasm, expected,
        maxMemoryBytes: runtime.maxMemoryBytes }, [wasm.buffer]);
      check();
      const identity: WalletRuntimeIdentity = ready?.identity;
      if (ready?.type !== 'ready' || !identity || !sameRecord(expected, {
        contractRevision: identity.contractRevision, abiVersion: identity.abiVersion, schemas: identity.schemas,
        buildSha256: identity.buildSha256, dependencyGraphSha256: identity.dependencyGraphSha256, mode: identity.mode,
      }) || !sameRecord(identity.memory, { initialPages: 321, maximumPages: 4096, shared: false })) throw mismatch();
      const authorityChannel = channels();
      let authority: ReturnType<typeof attachWalletWorker>;
      try {
        const reply = await request({type:'signers',port:authorityChannel.port2},[authorityChannel.port2]);
        if (reply?.type !== 'signers-ready') throw mismatch();
        authority = attachWalletWorker(authorityChannel.port1, async () => {},
          {maxQueuedJobs:runtime.maxQueuedJobs,maxQueuedBytes:runtime.maxQueuedBytes,maxPcztBytes:runtime.maxPcztBytes},budget);
        sessions.add(authority);
      } catch (error) { authorityChannel.port1.close(); authorityChannel.port2.close(); throw error; }
      return {
        token: Object.freeze({}), identity: Object.freeze(identity), check, destroy, signers: authority.signers,
        invalidate: () => { stop(failure('WORKER_CRASHED','runtime','reopen','Native authority cleanup failed.')); return destroy(); },
        async open(storage: WalletStorage, parametersFormat: string, parameters: Uint8Array, genesis: Uint8Array, release: () => Promise<void>): Promise<OpenedWallet> {
          check();
          const channel = channels();
          try {
            const opened = await request({ type: 'open', storage, ...(storage.kind === 'memory' ? {} : { hostUrl: urls[node ? 'node-fs.mjs' : 'opfs.mjs'] }),
              parametersFormat, parameters, genesis, port: channel.port2 }, [channel.port2]);
            check(); if (opened?.type !== 'opened') { stop(mismatch()); throw mismatch(); }
            const session = attachWalletWorker(channel.port1, async () => { sessions.delete(session); await release(); },
              {maxQueuedJobs:runtime.maxQueuedJobs,maxQueuedBytes:runtime.maxQueuedBytes,maxPcztBytes:runtime.maxPcztBytes}, budget);
            sessions.add(session);
            return { session, close: () => session.close() };
          } catch (error) { channel.port1.close(); channel.port2.close(); await release(); throw error; }
        },
      };
    } finally { verified.dispose(); }
  } catch (error) {
    stop(isZcashError(error) ? error : unavailable());
    await destroy().catch(() => {});
    throw stopped;
  } finally {
    clearTimeout(timer);
    // Lifetime cancellation remains connected after startup, until the last lease.
    if (stopped) signal.removeEventListener('abort', onAbort);
  }
}
