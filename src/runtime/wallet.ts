import type { NetworkDefinition, Op, RuntimeOptions, WalletStorage, ZcashError } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { bindNetworkDefinition } from '../network-parameters.js';
import { attachWalletWorker } from '../wallet/host.js';
import { acquireArtifacts } from './artifacts.js';
import { sameRecord, walletProfile } from './wallet-profile.js';
import type { WalletRuntimeIdentity } from './wallet-profile.js';

const node = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const any = AbortSignal.any.bind(AbortSignal);
const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
const unavailable = () => failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Wallet runtime unavailable.');
const mismatch = () => failure('PROTOCOL_MISMATCH', 'runtime', 'configure', 'Wallet runtime profile mismatch.');
const cancelled = () => failure('ABORTED', 'runtime', 'none', 'Wallet startup aborted.');
const timeout = () => failure('TIMEOUT', 'runtime', 'configure', 'Wallet startup timed out.');
const resource = () => failure('RESOURCE_LIMIT', 'runtime', 'configure', 'Wallet runtime limit unsupported.');
const layout = { 'wallet.mjs': 'module', 'worker.mjs': 'worker', 'bindings_bg.wasm': 'wasm', 'node-fs.mjs': 'glue', 'opfs.mjs': 'glue' } as const;
// Reviewed private producer + actual SDK bootstrap, not arbitrary same-profile JavaScript.
// Updating this immutable executable closure requires reviewing the corresponding package.
const reviewedAssets: Record<keyof typeof layout, string> = {
  'wallet.mjs': 'f88d909c18840202dbb2f6ed2c50f33c9de8d44348cfe3d3018daeacc69245b1',
  'worker.mjs': '626ced33e44c558c39943199d4028409df3bd02454684c85c29e9d6416f15f93',
  'bindings_bg.wasm': 'ad7d54174492992a453e6565ea90cfc42189697d8ceb5458fe7cc7d5b7458c62',
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

/** Internal baseline construction. The returned session is not the complete WalletClient. */
export async function openWalletRuntime(options: { runtime: RuntimeOptions; storage: WalletStorage; network: NetworkDefinition } & Op) {
  const input = record(options, ['runtime', 'storage', 'network', 'signal']);
  const runtime = record(input.runtime, ['baseline', 'threading', 'maxMemoryBytes', 'maxQueuedBytes', 'maxQueuedJobs', 'scanBatchSize', 'maxPcztBytes', 'onDiagnostic']);
  const baseline = record(runtime.baseline, ['manifestUrl', 'manifestSha256']);
  const threading = record(runtime.threading, ['mode', 'artifact', 'workers', 'startupTimeoutMs']);
  if (!['baseline', 'prefer-threaded'].includes(threading.mode)) throw invalidArgument();
  if (threading.mode !== 'baseline') throw unavailable();
  if (Object.keys(threading).length !== 1) throw invalidArgument();
  for (const key of ['maxMemoryBytes', 'maxQueuedBytes', 'maxQueuedJobs', 'scanBatchSize', 'maxPcztBytes']) {
    if (!Number.isSafeInteger(runtime[key]) || runtime[key] <= 0) throw invalidArgument();
  }
  if (runtime.maxMemoryBytes < 4096 * 65536) throw resource();
  if (runtime.onDiagnostic !== undefined && typeof runtime.onDiagnostic !== 'function') throw invalidArgument();
  const storage = record(input.storage, ['kind', 'path', 'name']);
  if (storage.kind !== (node ? 'node-filesystem' : 'browser-opfs')) throw unavailable();
  const name = node ? 'path' : 'name';
  if (Object.keys(storage).length !== 2 || typeof storage[name] !== 'string' || !storage[name].length
    || storage[name].includes('\0') || (!node && !/^[a-zA-Z0-9_-]{1,128}$/.test(storage.name))) throw invalidArgument();
  const network = bindNetworkDefinition(record(input.network, ['identity', 'genesisHash', 'parameters', 'parametersFormat']) as unknown as NetworkDefinition);
  const parameters = network.parameters.bytes;
  const genesis = Uint8Array.from(network.genesisHash.match(/../g)!, hex => parseInt(hex, 16));
  const signal: AbortSignal | undefined = input.signal;
  let dependent: AbortSignal | undefined;
  if (signal !== undefined) {
    try {
      if (node) { const util = 'node:util'; if ((await import(util)).types.isProxy(signal)) throw 0; }
      if (aborted.call(signal)) throw cancelled();
      // Native signals only; do not invoke caller-shadowed state while building dependencies.
      if (Object.getOwnPropertyDescriptor(signal, 'aborted')) throw 0;
      dependent = any([signal]);
    } catch (error) { throw isZcashError(error) ? error : invalidArgument(); }
  }
  let worker: { postMessage(value: unknown, transfer: any[]): void; terminate(): unknown } | undefined;
  let session: ReturnType<typeof attachWalletWorker> | undefined;
  let port: MessagePort | undefined, peer: MessagePort | undefined;
  let removeAssets = () => {}, removeEvents = () => {};
  let destroying: Promise<void> | undefined, stopped: ZcashError | undefined;
  let pending: { resolve: (value: any) => void; reject: (error: unknown) => void } | undefined;
  const acquisition = new AbortController();
  const destroy = () => destroying ??= Promise.resolve().then(async () => {
    try { await worker?.terminate(); }
    finally { removeEvents(); port?.close(); peer?.close(); removeAssets(); }
  });
  const stop = (error: ZcashError) => {
    stopped ??= error; acquisition.abort(); pending?.reject(stopped); pending = undefined;
    if (session) session.crashed();
  };
  const check = () => { if (dependent && aborted.call(dependent)) stop(cancelled()); if (stopped) throw stopped; };
  const onAbort = () => stop(cancelled());
  if (dependent) add.call(dependent, 'abort', onAbort);
  const timer = setTimeout(() => stop(timeout()), 30000);
  const request = (value: unknown, transfer: any[] = []) => new Promise<any>((resolve, reject) => {
    pending = { resolve, reject };
    try { check(); worker!.postMessage(value, transfer); }
    catch (error) { pending = undefined; reject(error); }
  });
  const message = (data: any) => {
    if (stopped) return;
    if (!pending) { stop(mismatch()); return; }
    const waiting = pending; pending = undefined;
    if (data?.type === 'failure') {
      const codes = ['STORAGE_ERROR', 'STORAGE_BUSY', 'NETWORK_MISMATCH', 'INVALID_ARGUMENT', 'RESOURCE_LIMIT', 'PROTOCOL_MISMATCH', 'RUNTIME_UNAVAILABLE'];
      const code = ['SCHEMA_MISMATCH', 'VIEWING_SCHEMA_REQUIRED'].includes(data.code) ? 'MIGRATION_REQUIRED' : data.code;
      waiting.reject(code === 'MIGRATION_REQUIRED' || codes.includes(code)
        ? failure(code, code.startsWith('STORAGE') || code === 'MIGRATION_REQUIRED' ? 'storage' : 'runtime', 'configure', 'Wallet startup failed.') : unavailable());
    } else waiting.resolve(data);
  };
  try {
    check();
    const verified = await acquireArtifacts(baseline as { manifestUrl: string; manifestSha256: string }, policy, acquisition.signal);
    try {
      check();
      if (verified.manifest.files.length !== 5 || verified.manifest.files.some(file => !Object.hasOwn(layout, file.url)
        || layout[file.url as keyof typeof layout] !== file.kind || reviewedAssets[file.url as keyof typeof layout] !== file.sha256)) throw mismatch();
      const { format, files, ...expected } = verified.manifest;
      const urls: Record<string, string> = {};
      let channels: MessageChannel;
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
        check(); channels = new threads.MessageChannel(); port = channels.port1; peer = channels.port2;
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
        check(); channels = new MessageChannel(); port = channels.port1; peer = channels.port2;
        const instance = new Worker(urls['worker.mjs']!, { type: 'module' }); worker = instance;
        instance.onmessage = event => message(event.data);
        instance.onerror = event => { event.preventDefault(); stop(unavailable()); };
        instance.onmessageerror = () => stop(mismatch());
        removeEvents = () => { instance.onmessage = null; instance.onerror = null; instance.onmessageerror = null; };
      }
      port = channels.port1;
      const wasm = verified.copyFile('bindings_bg.wasm');
      const ready = await request({ type: 'initialize', moduleUrl: urls['wallet.mjs'], wasm, expected,
        maxMemoryBytes: runtime.maxMemoryBytes }, [wasm.buffer]);
      check();
      const identity: WalletRuntimeIdentity = ready?.identity;
      if (ready?.type !== 'ready' || !identity || !sameRecord(expected, {
        contractRevision: identity.contractRevision, abiVersion: identity.abiVersion, schemas: identity.schemas,
        buildSha256: identity.buildSha256, dependencyGraphSha256: identity.dependencyGraphSha256, mode: identity.mode,
      }) || !sameRecord(identity.memory, { initialPages: 306, maximumPages: 4096, shared: false })) throw mismatch();
      try { runtime.onDiagnostic?.(Object.freeze({ code: 'BASELINE_SELECTED', reason: 'requested' })); } catch { /* Diagnostics do not own startup. */ }
      check();
      const opened = await request({ type: 'open', storage, hostUrl: urls[node ? 'node-fs.mjs' : 'opfs.mjs'],
        parametersFormat: network.parametersFormat, parameters, genesis, port: channels.port2 }, [channels.port2]);
      check(); if (opened?.type !== 'opened') throw mismatch();
      session = attachWalletWorker(port, destroy, { maxQueuedJobs: runtime.maxQueuedJobs, maxQueuedBytes: runtime.maxQueuedBytes });
      return Object.freeze({ identity: Object.freeze(identity), session, close: () => session!.close() });
    } finally { verified.dispose(); }
  } catch (error) {
    stop(isZcashError(error) ? error : unavailable());
    try { await destroy(); } catch { /* Retain the startup error. */ }
    throw stopped;
  } finally {
    clearTimeout(timer);
    if (dependent) remove.call(dependent, 'abort', onAbort);
  }
}
