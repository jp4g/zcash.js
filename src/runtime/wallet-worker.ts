import type { WalletStorage } from '../../docs/api/public-api.js';
import type { InitializedViews } from '../wallet/session.js';
import { installWalletWorker } from '../wallet/worker.js';
import { sameRecord, walletProfile } from './wallet-profile.js';
import type { WalletRuntimeIdentity } from './wallet-profile.js';

const node = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
const builtin = 'node:worker_threads';
const threads = node ? await import(builtin) : undefined;
const control: Pick<MessagePort, 'postMessage' | 'onmessage'> = node
  ? threads.parentPort : globalThis as unknown as MessagePort;
let phase: 'new' | 'starting' | 'ready' | 'opening' | 'open' | 'failed' = 'new';
let api: {
  runtimeIdentity: WalletRuntimeIdentity;
  initializeWalletRuntime(wasm: Uint8Array): {
    open(backend: unknown, format: string, parameters: Uint8Array, genesis: Uint8Array): unknown;
    openMemory(format: string, parameters: Uint8Array, genesis: Uint8Array): unknown;
  };
  viewsForStorage(storage: unknown): InitializedViews;
  consensusContext(format: string, parameters: Uint8Array, height: number): unknown;
};
let runtime: ReturnType<typeof api.initializeWalletRuntime>;
let backend: { owned: boolean; release(): void } | undefined;
let owner: InitializedViews | undefined;
function executableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(node ? 'file:' : 'blob:');
}
function failed(code: string): never { throw new Error(code); }

control.onmessage = async ({ data }) => {
  let failure = 'RUNTIME_UNAVAILABLE';
  try {
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
      }) || identity.mode !== 'baseline' || identity.memory?.shared !== false
        || identity.memory.maximumPages !== 4096 || !Number.isSafeInteger(identity.memory.initialPages)
        || identity.memory.initialPages < 1 || identity.memory.initialPages > identity.memory.maximumPages) failed('PROTOCOL_MISMATCH');
      if (!Number.isSafeInteger(data.maxMemoryBytes) || data.maxMemoryBytes < identity.memory.maximumPages * 65536) failed('RESOURCE_LIMIT');
      runtime = api.initializeWalletRuntime(data.wasm);
      data.wasm.fill(0);
      phase = 'ready';
      control.postMessage({ type: 'ready', identity });
      return;
    }
    if (phase !== 'ready' || data?.type !== 'open') failed('PROTOCOL_MISMATCH');
    phase = 'opening';
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
    if (storage.kind === 'memory') opened = runtime.openMemory(data.parametersFormat, data.parameters, data.genesis);
    else {
      if (storage.kind === 'node-filesystem') {
        const filesystem = 'node:fs';
        const fs = await import(filesystem);
        if (phase !== 'opening') failed('PROTOCOL_MISMATCH');
        try { fs.mkdirSync(storage.path, { mode: 0o700 }); }
        catch (error) { if ((error as { code?: string }).code !== 'EEXIST') throw error; }
      }
      const host = await import(data.hostUrl);
      if (phase !== 'opening') failed('PROTOCOL_MISMATCH');
      backend = await host.acquire(storage.kind === 'node-filesystem' ? storage.path : (storage as { name: string }).name, { create: true });
      if (phase !== 'opening') failed('PROTOCOL_MISMATCH');
      opened = runtime.open(backend, data.parametersFormat, data.parameters, data.genesis);
    }
    owner = api.viewsForStorage(opened);
    installWalletWorker(owner, data.port);
    phase = 'open';
    control.postMessage({ type: 'opened' });
  } catch (error) {
    phase = 'failed';
    // Only fixed known tags cross the control channel; never filesystem or native text.
    let tag: unknown;
    try { tag = typeof error === 'string' ? error : Object.getOwnPropertyDescriptor(error, 'message')?.value; } catch { /* Unknown failure remains sanitized. */ }
    try { if (Object.getOwnPropertyDescriptor(error, 'code')?.value === 'EBUSY') failure = 'STORAGE_BUSY'; } catch { /* Keep the fixed fallback. */ }
    const allowed = ['INVALID_ARGUMENT', 'PROTOCOL_MISMATCH', 'RESOURCE_LIMIT', 'NETWORK_MISMATCH', 'SCHEMA_MISMATCH', 'VIEWING_SCHEMA_REQUIRED'];
    if (typeof tag === 'string' && allowed.includes(tag)) failure = tag;
    try { if (owner) owner.close(owner.generation, owner.instance); } catch { /* Whole worker is terminal. */ }
    try { if (backend?.owned) backend.release(); } catch { failure = 'STORAGE_ERROR'; }
    control.postMessage({ type: 'failure', code: failure });
  }
};
