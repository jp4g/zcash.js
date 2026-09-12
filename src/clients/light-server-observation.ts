import type { Op } from '../../docs/api/public-api.js';
import type { createGrpcWebByteTransport } from './grpc-web.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';

// Structural view of the accepted, already initialized lightwire instance.
type Codec = {
  encodeRequest(method: 'GetLightdInfo', json: string): Uint8Array;
  decodeResponse(method: 'GetLightdInfo', bytes: Uint8Array): unknown;
};
type Source = { readonly codec: Codec; readonly transport: Pick<ReturnType<typeof createGrpcWebByteTransport>, 'unary'>; readonly sourceId: string };
export type LightdObservation = {
  readonly version: string; readonly vendor: string; readonly protocolRevision: 'v0.5.0';
  readonly sourceId: string; readonly observedAt: string; readonly chainName: string;
  readonly saplingActivationHeight: number; readonly branchId: string; readonly blockHeight: number;
  readonly taddrSupport: boolean;
};
const apply = Reflect.apply;
// Capture native operations before any caller callback. The byte transport receives only a private signal.
const NativeController = AbortController;
const nativeSignal = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal')!.get!;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAbort = AbortController.prototype.abort;
const nativeAny = AbortSignal.any.bind(AbortSignal);
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const nodeRuntime = typeof globalThis === 'object'
  && typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
let proxyCheck: Promise<(value: unknown) => boolean> | undefined;

async function bridge(original?: AbortSignal) {
  if (original === undefined) return { signal: undefined, close() {} };
  try {
    if (nodeRuntime) {
      // Node-only proxy check; browsers never resolve this URL.
      const builtin = 'node:util';
      proxyCheck ??= import(builtin).then(module => module.types.isProxy);
      if ((await proxyCheck)(original)) throw invalidArgument();
    }
    // Browser Web IDL branding rejects proxies; Node additionally needs isProxy.
    apply(nativeAborted, original, []);
    const controller = new NativeController();
    const signal: AbortSignal = apply(nativeSignal, controller, []);
    Object.defineProperties(signal, {
      aborted: { get: () => apply(nativeAborted, signal, []) },
      addEventListener: { value: nativeAdd.bind(signal) },
      removeEventListener: { value: nativeRemove.bind(signal) },
    });
    if (nodeRuntime) {
      const builtin = 'node:events';
      const { addAbortListener } = await import(builtin);
      // Node's helper reads public properties. Give it a native signal with
      // trusted forwarding operations, never the caller's overrides.
      const view: AbortSignal = apply(nativeSignal, new NativeController(), []);
      Object.defineProperties(view, {
        aborted: { get: () => apply(nativeAborted, original, []) },
        addEventListener: { value: (type: string, listener: EventListener, options: AddEventListenerOptions) =>
          // Keep the resistant listener after synthetic events; only native
          // cancellation consumes the operation, and finally always detaches it.
          apply(nativeAdd, original, [type, listener, { ...options, once: false }]) },
        removeEventListener: { value: nativeRemove.bind(original) },
      });
      const subscription = addAbortListener(view, () => {
        if (apply(nativeAborted, original, [])) apply(nativeAbort, controller, []);
      });
      if (apply(nativeAborted, original, [])) apply(nativeAbort, controller, []);
      return { signal, close: () => subscription[(Symbol as SymbolConstructor & { readonly dispose: symbol }).dispose]() };
    }
    // Web IDL uses native state, not public overrides. Dependency propagation
    // does not rely on delivery of an abort event on the caller's signal.
    const dependent = nativeAny([original]);
    const onAbort = () => apply(nativeAbort, controller, []);
    apply(nativeAdd, dependent, ['abort', onAbort]);
    if (apply(nativeAborted, dependent, [])) apply(nativeAbort, controller, []);
    return { signal, close: () => apply(nativeRemove, dependent, ['abort', onAbort]) };
  } catch { throw invalidArgument(); }
}

// Copy only admitted data descriptors; never reread caller properties after validation.
function input<T extends object>(value: T, keys: readonly string[]): T {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalidArgument();
    const snapshot = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !keys.includes(key)) throw invalidArgument();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalidArgument();
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch { throw invalidArgument(); }
}

// Only data methods of the trusted actual instances are captured; this does not
// admit arbitrary transports/codecs as an alternative initialization boundary.
function method<T extends object, K extends keyof T>(owner: T, key: K): T[K] {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') throw invalidArgument();
    return descriptor.value;
  } catch { throw invalidArgument(); }
}
const protocol = () => failure('PROTOCOL_MISMATCH', 'transport', 'configure', 'Invalid light server metadata.');
function height(value: unknown): number {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,9})$/.test(value)
    || (value.length === 10 && value > '4294967295')) throw protocol();
  return Number(value);
}
function check(signal?: AbortSignal): void {
  if (signal && apply(nativeAborted, signal, [])) throw failure('ABORTED', 'transport', 'none', 'Request aborted.');
}

/** Internal, unbound endpoint observations. The composition owner supplies initialized inputs. */
export async function readLightdInfo(source: Source, args: Op = {}): Promise<LightdObservation> {
  const { codec, transport, sourceId } = input(source, ['codec', 'transport', 'sourceId']);
  const original = input(args, ['signal']).signal;
  if (typeof sourceId !== 'string' || !sourceId.trim()) throw invalidArgument();
  const encode = method(codec, 'encodeRequest'), decode = method(codec, 'decodeResponse');
  const unary = method(transport, 'unary');
  const owned = await bridge(original);
  const { signal } = owned;
  let stage: 'codec' | 'transport' = 'codec';
  try {
    check(signal);
    const request: Uint8Array = apply(encode, codec, ['GetLightdInfo', '{}']);
    check(signal);
    stage = 'transport';
    const bytes: Uint8Array = await apply(unary, transport, [{ method: 'GetLightdInfo', request, ...(signal ? { signal } : {}) }]);
    check(signal);
    stage = 'codec';
    const dto = apply(decode, codec, ['GetLightdInfo', bytes]) as Record<string, unknown>;
    check(signal);
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)
      || typeof dto.version !== 'string' || typeof dto.vendor !== 'string'
      || dto.lightwallet_protocol_version !== 'v0.5.0'
      || typeof dto.chain_name !== 'string' || !dto.chain_name
      || typeof dto.consensus_branch_id !== 'string' || !/^[0-9a-f]{8}$/.test(dto.consensus_branch_id)
      || typeof dto.taddr_support !== 'boolean') throw protocol();
    const saplingActivationHeight = height(dto.sapling_activation_height), blockHeight = height(dto.block_height);
    check(signal);
    return { version: dto.version, vendor: dto.vendor, protocolRevision: 'v0.5.0', sourceId,
      chainName: dto.chain_name, saplingActivationHeight, branchId: dto.consensus_branch_id,
      blockHeight, taddrSupport: dto.taddr_support, observedAt: new Date().toISOString() };
  } catch (error) {
    check(signal);
    if (isZcashError(error)) throw error;
    throw stage === 'codec' ? protocol() : failure('TRANSPORT_ERROR', 'transport', 'configure', 'Light server request failed.');
  } finally { owned.close(); }
}
