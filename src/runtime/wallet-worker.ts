import type { WalletStorage } from '../../docs/api/public-api.js';
import type { InitializedViews, InitializedSigners } from '../wallet/session.js';
import { installWalletWorker } from '../wallet/worker.js';
import { sameRecord, walletProfile } from './wallet-profile.js';
import type { WalletRuntimeIdentity } from './wallet-profile.js';

const node = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
const builtin = 'node:worker_threads';
const threads = node ? await import(builtin) : undefined;
const control: Pick<MessagePort, 'postMessage' | 'onmessage'> = node
  ? threads.parentPort : globalThis as unknown as MessagePort;
let phase: 'new' | 'starting' | 'ready' | 'failed' = 'new';
let api: {
  runtimeIdentity: WalletRuntimeIdentity;
  initializeWalletRuntime(wasm: Uint8Array): {
    readonly invalid: boolean;
    readonly signers: InitializedSigners;
    open(backend: unknown, format: string, parameters: Uint8Array, genesis: Uint8Array): unknown;
    openMemory(format: string, parameters: Uint8Array, genesis: Uint8Array): unknown;
  };
  prepareThreaded(wasm: Uint8Array, count: number): { module: WebAssembly.Module; memory: WebAssembly.Memory };
  enterThreaded(module: WebAssembly.Module, memory: WebAssembly.Memory, index: number, loaded: () => void): never;
  finishThreaded(): ReturnType<typeof api.initializeWalletRuntime>;
  viewsForStorage(storage: unknown): InitializedViews;
  consensusContext(format: string, parameters: Uint8Array, height: number): unknown;
}
let runtime: ReturnType<typeof api.initializeWalletRuntime>;
let signerPort = false;
let initializationId: number | undefined;

function executableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(node ? 'file:' : 'blob:');
}
function failed(code: string): never { throw new Error(code); }

// Open requests serialize only acquisition; existing wallet ports keep their own queues.
let opening = Promise.resolve();
control.onmessage = ({ data }) => { opening = opening.then(() => handle(data)); };
async function handle(data: any) {
  let backend: { owned: boolean; release(): void } | undefined;
  let owner: InitializedViews | undefined;
  let nativeOpening = false;
  let failure = 'RUNTIME_UNAVAILABLE';
  try {
    if (phase === 'new' && data?.type === 'compute-initialize') {
      phase = 'starting';
      if (!executableUrl(data.moduleUrl) || !(data.module instanceof WebAssembly.Module)
        || !(data.memory instanceof WebAssembly.Memory) || !(data.memory.buffer instanceof SharedArrayBuffer)
        || !Number.isSafeInteger(data.index) || data.index < 0 || data.index >= 8) failed('PROTOCOL_MISMATCH');
      api = await import(data.moduleUrl);
      // The generated initializer establishes the child's TLS/stack before its
      // blocking native entry. The host may release the owner build meanwhile.
      api.enterThreaded(data.module, data.memory, data.index, () => control.postMessage({type:'compute-loaded', index:data.index}));
      failed('RUNTIME_UNAVAILABLE');
    }
    if (phase === 'starting' && data?.type === 'pool-build' && initializationId !== undefined) {
      runtime = api.finishThreaded();
      phase = 'ready';
      control.postMessage({type:'ready', identity:api.runtimeIdentity, id:initializationId});
      return;
    }
    if (phase === 'new' && data?.type === 'initialize') {
      phase = 'starting';
      if (!executableUrl(data.moduleUrl) || !(data.wasm instanceof Uint8Array)) failed('INVALID_ARGUMENT');
      api = await import(data.moduleUrl);
      if (phase !== 'starting') return;
      const identity = api.runtimeIdentity;
      if (!identity || !sameRecord(walletProfile, {
        contractRevision: identity.contractRevision, abiVersion: identity.abiVersion, schemas: identity.schemas,
      }) || !sameRecord(data.expected, {
        contractRevision: identity.contractRevision, abiVersion: identity.abiVersion, schemas: identity.schemas,
        buildSha256: identity.buildSha256, dependencyGraphSha256: identity.dependencyGraphSha256, mode: identity.mode,
      }) || !['baseline','threaded'].includes(identity.mode) || identity.memory?.shared !== (identity.mode === 'threaded')
        || identity.memory.maximumPages !== 4096 || !Number.isSafeInteger(identity.memory.initialPages)
        || identity.memory.initialPages < 1 || identity.memory.initialPages > identity.memory.maximumPages) failed('PROTOCOL_MISMATCH');
      if (!Number.isSafeInteger(data.maxMemoryBytes) || data.maxMemoryBytes < identity.memory.maximumPages * 65536) failed('RESOURCE_LIMIT');
      if (identity.mode === 'threaded') {
        if (!Number.isSafeInteger(data.workers) || data.workers < 1 || data.workers > 8) failed('RESOURCE_LIMIT');
        initializationId = data.id;
        const pool = api.prepareThreaded(data.wasm, data.workers);
        data.wasm.fill(0);
        control.postMessage({type:'pool', id:data.id, module:pool.module, memory:pool.memory});
        return;
      }
      runtime = api.initializeWalletRuntime(data.wasm);
      data.wasm.fill(0);
      phase = 'ready';
      control.postMessage({ type: 'ready', identity, id: data.id });
      return;
    }
    if (phase === 'ready' && data?.type === 'signers' && !signerPort) {
      if (!(data.port instanceof (node ? threads.MessagePort : MessagePort))) failed('PROTOCOL_MISMATCH');
      installWalletWorker(undefined, data.port, () => runtime.invalid, runtime.signers);
      signerPort = true;
      control.postMessage({ type: 'signers-ready', id: data.id });
      return;
    }
    if (phase !== 'ready' || data?.type !== 'open') failed('PROTOCOL_MISMATCH');
    const storage: WalletStorage = data.storage;
    if (!storage || (storage.kind !== 'memory' && (node ? storage.kind !== 'node-filesystem' : storage.kind !== 'browser-opfs'))
      || (storage.kind !== 'memory' && !executableUrl(data.hostUrl)) || !(data.port instanceof (node ? threads.MessagePort : MessagePort))
      || !(data.genesis instanceof Uint8Array) || data.genesis.length !== 32
      || !(data.parameters instanceof Uint8Array) || data.parameters.length < 1 || data.parameters.length > 256
      || (storage.kind === 'memory' ? Object.keys(storage).length !== 1 : typeof (storage.kind === 'node-filesystem' ? storage.path : (storage as { name: string }).name) !== 'string')) failed('INVALID_ARGUMENT');
    // Native document validation precedes storage acquisition.
    api.consensusContext(data.parametersFormat, data.parameters, 0);
    failure = 'STORAGE_ERROR';
    let opened: unknown;
    if (storage.kind === 'memory') { nativeOpening = true; opened = runtime.openMemory(data.parametersFormat, data.parameters, data.genesis); }
    else {
      if (storage.kind === 'node-filesystem') {
        const filesystem = 'node:fs';
        const fs = await import(filesystem);
        if (phase !== 'ready') failed('PROTOCOL_MISMATCH');
        try { fs.mkdirSync(storage.path, { mode: 0o700 }); }
        catch (error) { if ((error as { code?: string }).code !== 'EEXIST') throw error; }
      }
      const host = await import(data.hostUrl);
      if (phase !== 'ready') failed('PROTOCOL_MISMATCH');
      backend = await host.acquire(storage.kind === 'node-filesystem' ? storage.path : (storage as { name: string }).name, { create: true });
      if (phase !== 'ready') failed('PROTOCOL_MISMATCH');
      nativeOpening = true;
      opened = runtime.open(backend, data.parametersFormat, data.parameters, data.genesis);
    }
    owner = api.viewsForStorage(opened);
    installWalletWorker(owner, data.port, () => runtime.invalid);
    control.postMessage({ type: 'opened', id: data.id });
  } catch (error) {
    if (phase !== 'ready') phase = 'failed';
    // Only fixed known tags cross the control channel; never filesystem or native text.
    let tag: unknown;
    try { tag = typeof error === 'string' ? error : Object.getOwnPropertyDescriptor(error, 'message')?.value; } catch { /* Unknown failure remains sanitized. */ }
    try { if (Object.getOwnPropertyDescriptor(error, 'code')?.value === 'EBUSY'
      || error instanceof DOMException && error.name === 'NoModificationAllowedError') failure = 'STORAGE_BUSY'; } catch { /* Keep the fixed fallback. */ }
    const allowed = ['INVALID_ARGUMENT', 'PROTOCOL_MISMATCH', 'RESOURCE_LIMIT', 'NETWORK_MISMATCH', 'SCHEMA_MISMATCH', 'VIEWING_SCHEMA_REQUIRED'];
    if (typeof tag === 'string' && allowed.includes(tag)) failure = tag;
    let cleanupFailed = false;
    try { if (owner) owner.close(owner.generation, owner.instance); } catch { cleanupFailed = true; }
    try { if (backend?.owned) backend.release(); } catch { cleanupFailed = true; failure = 'STORAGE_ERROR'; }
    const fatal = cleanupFailed || data?.type !== 'open' || phase !== 'ready' || runtime?.invalid === true || nativeOpening && !(typeof tag === 'string' && allowed.includes(tag));
    if (fatal) phase = 'failed';
    control.postMessage({ type: 'failure', code: failure, id: data?.type === 'pool-build' ? initializationId : data?.id, fatal });
  }
}
