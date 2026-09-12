import type { ChainTip, CompactBlock, HeightRange, CustomLightTransport, Op } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { blockHash } from '../primitives.js';

// Structural view of the accepted initialized codec instance; no acquisition or initialization.
interface Lightwire {
  encodeRequest(method: 'GetLatestBlock' | 'GetBlockRange', json: string): Uint8Array;
  decodeResponse(method: 'GetLatestBlock', bytes: Uint8Array): unknown;
  decodeItem(method: 'GetBlockRange', bytes: Uint8Array): unknown;
}

// Exact service.proto and compact_formats.proto SHA256 pair; not LightdInfo's wire version.
const revision = 'lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d';
const protocol = () => failure('PROTOCOL_MISMATCH', 'query', 'configure', 'Invalid light-chain response or schema revision.');
const transportFailure = () => failure('TRANSPORT_ERROR', 'transport', 'configure', 'Light-chain request failed.');
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

// Node's JS AbortSignal getter accepts proxies, unlike WebIDL. Reuse the accepted
// transport's host intrinsic policy, without a Node import in browser modules.
const unsupportedSignalProxy = (() => {
  try { signalAborted.call(new Proxy(new AbortController().signal, {})); }
  catch { return () => false; }
  const host = globalThis as typeof globalThis & { process?: {
    getBuiltinModule?: (name: string) => { types: { isProxy: (value: unknown) => boolean } };
  } };
  return host.process?.getBuiltinModule?.('node:util').types.isProxy ?? (() => true);
})();

function admit(transport: CustomLightTransport, args: Op, keys: readonly string[]): string {
  try {
    if (transport.protocolRevision !== revision) throw protocol();
    if (transport.kind !== 'custom-lightwallet' || typeof transport.sourceId !== 'string'
      || !transport.sourceId.length || transport.sourceId.length > 256) throw invalidArgument();
    if (!args || typeof args !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(args))
      || Reflect.ownKeys(args).some(key => typeof key !== 'string' || !keys.includes(key)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(args, key)!, 'value'))) throw invalidArgument();
    if (args.signal !== undefined) {
      // A native dependent signal must not observe caller-overridden state accessors.
      if (unsupportedSignalProxy(args.signal) || Object.getPrototypeOf(args.signal) !== AbortSignal.prototype
        || Object.hasOwn(args.signal, 'aborted') || Object.hasOwn(args.signal, 'reason')) throw invalidArgument();
      signalAborted.call(args.signal);
    }
    return transport.sourceId;
  } catch (error) { throw isZcashError(error) ? error : invalidArgument(); }
}
function point(dto: unknown) {
  if (!dto || typeof dto !== 'object') throw protocol();
  const { height, hash } = dto as { height: unknown; hash: unknown };
  if (typeof height !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(height)
    || BigInt(height) > 0xffff_ffffn) throw protocol();
  return { height: Number(height), hash: wireBlockHash(hash) };
}
// These two methods carry protocol-order block hashes. This is NOT a TreeState hash adapter.
function wireBlockHash(hash: unknown) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw protocol();
  return blockHash(hash.match(/../g)!.reverse().join(''));
}

const aborted = () => failure('ABORTED', 'query', 'none', 'Light-chain read aborted.');

// Native dependent signals propagate cancellation independently of caller event listeners.
// Keep the dependent signal private: synthetic events on the caller/transport signal cannot cancel us.
function operation(signal: AbortSignal | undefined, release: () => void = () => {}) {
  const controller = new AbortController();
  const dependent = signal === undefined ? undefined : AbortSignal.any([signal]);
  let cancelled = false, closed = false;
  let reject: (error: unknown) => void;
  const interruption = new Promise<never>((_, fail) => { reject = fail; });
  void interruption.catch(() => {});
  function close() {
    if (closed) return;
    closed = true;
    dependent?.removeEventListener('abort', cancel);
    controller.abort();
    release();
  }
  function cancel() {
    if (cancelled || closed) return;
    cancelled = true;
    reject(aborted());
    close();
  }
  function check() {
    if (signal !== undefined && signalAborted.call(signal)) { cancel(); throw aborted(); }
    if (cancelled) throw aborted();
  }
  dependent?.addEventListener('abort', cancel, { once: true });
  return { signal: controller.signal, cancel, check, close,
    wait<T>(value: PromiseLike<T> | T): Promise<T> { return Promise.race([value, interruption]); } };
}

/** Internal composition only. Caller supplies the accepted initialized lightwire instance. */
export async function getTip(codec: Lightwire, transport: CustomLightTransport, args: Op = {}): Promise<ChainTip> {
  const sourceId = admit(transport, args, ['signal']);
  const pending = operation(args.signal);
  try {
    pending.check();
    let request: Uint8Array;
    try { request = codec.encodeRequest('GetLatestBlock', '{}'); } catch { throw protocol(); }
    pending.check();
    const bytes = await pending.wait(transport.unary({ method: 'GetLatestBlock', request, signal: pending.signal }));
    pending.check();
    let checked;
    try { checked = point(codec.decodeResponse('GetLatestBlock', ownBytes(bytes))); }
    catch (error) { throw isZcashError(error) ? error : protocol(); }
    pending.check();
    return { ...checked, sourceId, observedAt: new Date().toISOString() };
  } catch (error) {
    pending.check();
    throw isZcashError(error) ? error : transportFailure();
  } finally { pending.close(); pending.check(); }
}
const resourceLimit = () => failure('RESOURCE_LIMIT', 'query', 'configure', 'Light-chain byte limit exceeded.');
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag)!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
function ownBytes(bytes: Uint8Array): Uint8Array {
  try {
    if (tag.call(bytes) !== 'Uint8Array') throw protocol();
    const buffer = bufferOf.call(bytes);
    bufferLength.call(buffer);
    typedArray.values.call(bytes); // Reject detached/out-of-bounds original views.
    const length = lengthOf.call(bytes);
    if (length > 4 * 1024 * 1024) throw resourceLimit();
    return new Uint8Array(new Uint8Array(buffer, offsetOf.call(bytes), length));
  } catch (error) { throw isZcashError(error) ? error : protocol(); }
}

/** Internal finite range; successful exhaustion is required for complete coverage. */
export function streamCompactBlocks(codec: Lightwire, transport: CustomLightTransport,
  args: HeightRange & Op): AsyncIterableIterator<CompactBlock> {
  const sourceId = admit(transport, args, ['fromHeight', 'toHeight', 'signal']);
  const { fromHeight, toHeight, signal } = args;
  if (!Number.isInteger(fromHeight) || !Number.isInteger(toHeight) || fromHeight < 0
    || toHeight > 0xffff_ffff || toHeight < fromHeight || toHeight - fromHeight >= 1024) throw invalidArgument();
  let iterator: AsyncIterator<Uint8Array> | undefined;
  let pending: ReturnType<typeof operation> | undefined;
  let height = fromHeight, previous: string | undefined, total = 0;
  let finished = false, busy = false, released = false;
  function release() {
    if (!iterator || released) return;
    released = true;
    try { void Promise.resolve(iterator?.return?.()).catch(() => {}); }
    catch { /* Release is best effort for an uncooperative custom transport; never replace the outcome. */ }
  }
  return {
    [Symbol.asyncIterator]() { return this; },
    async next() {
      if (finished) return { done: true, value: undefined };
      if (busy) throw invalidArgument();
      busy = true;
      try {
        if (!pending) {
          pending = operation(signal, release);
          pending.check();
          let request: Uint8Array;
          try { request = codec.encodeRequest('GetBlockRange', JSON.stringify({
            start: { height: String(fromHeight) }, end: { height: String(toHeight) },
          })); } catch { throw protocol(); }
          pending.check();
          iterator = transport.stream({ method: 'GetBlockRange', request, signal: pending.signal })[Symbol.asyncIterator]();
        }
        pending.check();
        const item = await pending.wait(iterator!.next());
        pending.check();
        if (item.done) {
          if (height !== toHeight + 1) throw protocol();
          finished = true; pending.close(); pending.check();
          return { done: true, value: undefined };
        }
        if (height > toHeight) throw protocol();
        const encoded = ownBytes(item.value);
        total += encoded.length;
        if (total > 64 * 1024 * 1024) throw resourceLimit();
        let checked, previousHash;
        try {
          const dto = codec.decodeItem('GetBlockRange', encoded) as { prev_hash: string };
          checked = point(dto); previousHash = wireBlockHash(dto.prev_hash);
        } catch { throw protocol(); }
        if (checked.height !== height || (previous !== undefined && previousHash !== previous)) throw protocol();
        pending.check();
        height++; previous = checked.hash;
        return { done: false, value: { point: checked, previousHash, encoded, sourceId, observedAt: new Date().toISOString() } };
      } catch (error) {
        finished = true;
        try { pending?.check(); } finally { pending?.close(); release(); }
        throw isZcashError(error) ? error : transportFailure();
      } finally { busy = false; }
    },
    async return() {
      if (!finished) { pending?.cancel(); finished = true; }
      return { done: true, value: undefined };
    },
  };
}
