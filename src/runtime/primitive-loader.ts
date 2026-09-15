import type { WasmArtifact, ZcashError } from '../../docs/api/public-api.js';
import { acquireArtifacts } from './artifacts.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';

/** Intentionally internal stateless profile. No H1, runtime_init, wallet or root API. */
export interface Primitive {
  consensusContext(format: string, parameters: Uint8Array, height: number, options?: PrimitiveOptions): Promise<Readonly<{ height: number; branchId: number }>>;
  decodeTransaction(raw: Uint8Array, branch: number, options?: PrimitiveOptions): Promise<Readonly<{ bytes: Uint8Array; txid: Uint8Array; display: string }>>;
  close(): Promise<void>;
}
// Private producer 63d08edb99b1d88e4899c27e61cc955fca5e35d6, accepted Rust acaf7069.
// Pins the entire canonical manifest, including exact executable closure/build/graph.
const manifestPin = '49b8d1b68cb851c473c184bb7986842718d652cdd31995a47ae82bb23565499b';
const policy = {
  contractRevision: 'zakura-private-primitive/1', abiVersion: 'checked-bindgen-0.2.128/1', mode: 'baseline' as const,
  schemas: { operations: { consensusContext: '1', decodeTransaction: '1' }, protobuf: 'not-used',
    networkParameters: 'zcash-js-network/1', database: 'not-used', hostServices: {} },
  maxManifestBytes: 8192, maxAssetBytes: 1048576, maxTotalAssetBytes: 2097152, maxFiles: 3, timeoutMs: 30000,
};
const unavailable = () => failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Primitive startup failed.');
const closed = () => failure('CLOSED', 'runtime', 'none', 'Primitive is closed.');
const crashed = () => failure('WORKER_CRASHED', 'runtime', 'reopen', 'Primitive worker failed.');
const typed = Object.getPrototypeOf(Uint8Array.prototype);
const length = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const buffer = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
const tag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag)!.get!;
const arrayLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
function bytes(value: Uint8Array, max: number): Uint8Array<ArrayBuffer> {
  try {
    if (!(value instanceof Uint8Array) || !ArrayBuffer.isView(value) || tag.call(value) !== 'Uint8Array' ||
      !(buffer.call(value) instanceof ArrayBuffer) || length.call(value) < 1 || length.call(value) > max) throw 0;
    arrayLength.call(buffer.call(value)); return new Uint8Array(value);
  } catch { throw invalidArgument(); }
}
function u32(value: number): void { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw invalidArgument(); }

/** Same-realm native signals only. A cancellation invalidates this stateless owner. */
export interface PrimitiveOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number }
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
function watch(options: PrimitiveOptions | undefined, stop: (error: ZcashError) => void) {
  let signal: AbortSignal | undefined, timeoutMs: number;
  try {
    if (options !== undefined && (!options || Object.getPrototypeOf(options) !== Object.prototype ||
      Reflect.ownKeys(options).some(k => k !== 'signal' && k !== 'timeoutMs'))) throw 0;
    signal = options?.signal; const suppliedTimeout = options?.timeoutMs;
    timeoutMs = suppliedTimeout === undefined ? 30000 : suppliedTimeout;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw 0;
    if (signal !== undefined && (!(signal instanceof AbortSignal) || typeof aborted.call(signal) !== 'boolean')) throw 0;
  } catch { throw invalidArgument(); }
  const start = performance.now();
  const error = () => signal && aborted.call(signal) ? failure('ABORTED', 'runtime', 'none', 'Primitive operation aborted.')
    : performance.now() - start >= timeoutMs ? failure('TIMEOUT', 'runtime', 'none', 'Primitive operation timed out.') : undefined;
  const onAbort = () => { const e = error(); if (e) stop(e); };
  const timer = setTimeout(() => stop(failure('TIMEOUT', 'runtime', 'none', 'Primitive operation timed out.')), timeoutMs);
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true; clearTimeout(timer);
    // Native Node signal hooks can throw/reenter during removal. Cleanup must
    // never discard the resolver already detached from the pending slot.
    try { if (signal) removeListener.call(signal, 'abort', onAbort); } catch { /* Timer and ownership are already released. */ }
  };
  try { if (signal) add.call(signal, 'abort', onAbort); }
  catch { clear(); throw invalidArgument(); }
  return { error, clear };
}

function exact(value: any, keys: string[]): boolean {
  return !!value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

export async function openPrimitive(artifact: WasmArtifact, options?: PrimitiveOptions): Promise<Primitive> {
  let worker: { postMessage(value: unknown, transfer: ArrayBuffer[]): void; terminate(): void | Promise<number> } | undefined;
  let remove = () => {};
  let terminal: ZcashError | undefined, closing: Promise<void> | undefined;
  let id = 0, started = false;
  type Watch = ReturnType<typeof watch>;
  let pending: { id: number; type: string; value: number; size: number; resolve: (value: any) => void; reject: (error: ZcashError) => void; watch: Watch } | undefined;
  let readyResolve!: (value: Primitive) => void, readyReject!: (error: ZcashError) => void;
  const ready = new Promise<Primitive>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const acquisition = new AbortController();
  let startup: Watch;
  const close = (error = closed()): Promise<void> => {
    if (closing) return closing;
    terminal = error;
    const call = pending; pending = undefined;
    // Latch before termination can produce any late exit/error/message callbacks.
    closing = Promise.resolve().then(async () => {
      try { await worker?.terminate(); } finally { remove(); }
    }).catch(() => { throw unavailable(); });
    startup?.clear(); acquisition.abort(); call?.watch.clear();
    void closing.catch(() => {});
    void closing.then(() => { readyReject(error); call?.reject(error); }, () => { readyReject(unavailable()); call?.reject(unavailable()); });
    return closing;
  };
  try { startup = watch(options, error => { void close(error); }); }
  catch (error) { throw error; }
  const stopped = () => {
    const error = terminal ?? startup.error();
    if (error) { void close(error); return true; }
    return false;
  };
  const request = (type: string, raw: Uint8Array, value: number, format: string | undefined, options?: PrimitiveOptions): Promise<any> => {
    let control: Watch | undefined;
    try {
      if (terminal) throw terminal;
      if (pending) throw failure('RESOURCE_LIMIT', 'runtime', 'none', 'Primitive already has a request.');
      u32(value);
      if (type === 'context' && format !== 'zcash-js-network/1') throw invalidArgument();
      const owned = bytes(raw, type === 'context' ? 256 : 2097152);
      control = watch(options, error => { if (control && pending?.watch === control) void close(error); });
      const error = control.error();
      // Normalization and native signal registration can run caller code.
      // Recheck after both, before assigning the sole pending resolver.
      if (terminal) throw terminal;
      if (pending) throw failure('RESOURCE_LIMIT', 'runtime', 'none', 'Primitive already has a request.');
      if (error) { control.clear(); throw error; } // Not admitted: owner stays usable.
      if (id === Number.MAX_SAFE_INTEGER) { control.clear(); void close(closed()); throw closed(); }
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        pending = { id: requestId, type, value, size: owned.length, resolve, reject, watch: control! };
        try { worker!.postMessage({ type, id: requestId, bytes: owned, value, ...(type === 'context' ? { format } : {}) }, [owned.buffer]); }
        catch { void close(crashed()); }
      });
    } catch (error) { control?.clear(); return Promise.reject(isZcashError(error) ? error : unavailable()); }
  };
  const runtime: Primitive = Object.freeze({
    consensusContext: (format: string, parameters: Uint8Array, height: number, options?: PrimitiveOptions) => request('context', parameters, height, format, options),
    decodeTransaction: (raw: Uint8Array, branch: number, options?: PrimitiveOptions) => request('transaction', raw, branch, undefined, options),
    close: () => close(),
  });
  const message = (data: any) => {
    if (terminal) return;
    if (!started && exact(data, ['type']) && data.type === 'ready') {
      if (stopped()) return;
      started = true; startup.clear(); readyResolve(runtime); return;
    }
    if (!started || !pending || !exact(data, data?.type === 'result' ? ['type', 'id', 'result'] : ['type', 'id']) || data.id !== pending.id || !['result', 'invalid'].includes(data.type)) { void close(started ? crashed() : unavailable()); return; }
    const error = pending.watch.error(); if (error) { void close(error); return; }
    const call = pending;
    try {
      let result;
      if (data.type === 'result') {
        const r = data.result;
        if (call.type === 'context') {
          if (!exact(r, ['height', 'branchId']) || r.height !== call.value) throw 0;
          u32(r.branchId); result = Object.freeze({ height: r.height, branchId: r.branchId });
        } else {
          if (!exact(r, ['bytes', 'txid', 'display']) || typeof r.display !== 'string' || !/^[0-9a-f]{64}$/.test(r.display)) throw 0;
          const raw = bytes(r.bytes, 2097152), txid = bytes(r.txid, 32);
          if (raw.length !== call.size || txid.length !== 32 ||
            Array.from(txid).reverse().map(n => n.toString(16).padStart(2, '0')).join('') !== r.display) throw 0;
          result = Object.freeze({ bytes: raw, txid, display: r.display });
        }
      }
      pending = undefined; call.watch.clear();
      if (data.type === 'invalid') call.reject(invalidArgument()); else call.resolve(result);
    } catch { void close(crashed()); }
  };
  // Setup can still settle after cancellation; every awaited boundary checks the
  // latched terminal state before allocating executable resources.
  void (async () => {
    if (stopped()) return;
    const verified = await acquireArtifacts(artifact, policy, acquisition.signal);
    try {
      if (stopped()) return;
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', verified.copyManifest() as Uint8Array<ArrayBuffer>));
      if (stopped()) return;
      if (Array.from(hash, n => n.toString(16).padStart(2, '0')).join('') !== manifestPin) throw unavailable();
      let moduleUrl: string;
      if (typeof window === 'undefined') {
        // Constant native host modules, never caller-controlled executable URLs.
        // Local native surface avoids adding a Node type/package dependency.
        const [fs, os, path, url, threads] = await Promise.all(['node:fs', 'node:os', 'node:path', 'node:url', 'node:worker_threads'].map(name => import(name)));
        if (stopped()) return;
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zakura-primitive-'));
        remove = () => fs.rmSync(directory, { recursive: true, force: true });
        for (const name of ['primitive.mjs', 'worker.mjs']) fs.writeFileSync(path.join(directory, name), verified.copyFile(name), { flag: 'wx', mode: 0o600 });
        moduleUrl = url.pathToFileURL(path.join(directory, 'primitive.mjs')).href;
        const nodeWorker = new threads.Worker(url.pathToFileURL(path.join(directory, 'worker.mjs')));
        worker = nodeWorker; nodeWorker.on('message', message);
        nodeWorker.on('messageerror', () => { void close(crashed()); });
        nodeWorker.on('error', () => { void close(started ? crashed() : unavailable()); });
        nodeWorker.on('exit', () => { if (!terminal) void close(started ? crashed() : unavailable()); });
      } else {
        const urls: string[] = [];
        remove = () => { urls.forEach(value => URL.revokeObjectURL(value)); urls.length = 0; };
        for (const name of ['primitive.mjs', 'worker.mjs']) urls.push(URL.createObjectURL(new Blob([verified.copyFile(name) as Uint8Array<ArrayBuffer>], { type: 'text/javascript' })));
        moduleUrl = urls[0]!;
        const browserWorker = new Worker(urls[1]!, { type: 'module' });
        worker = browserWorker; browserWorker.onmessage = event => message(event.data);
        browserWorker.onerror = event => { event.preventDefault(); void close(started ? crashed() : unavailable()); };
        browserWorker.onmessageerror = () => { void close(crashed()); };
      }
      const wasm = verified.copyFile('bindings_bg.wasm');
      worker!.postMessage({ type: 'init', moduleUrl, wasm }, [wasm.buffer as ArrayBuffer]);
    } finally { verified.dispose(); }
  })().catch(error => { void close(isZcashError(error) ? error : unavailable()); });
  return ready;
}
