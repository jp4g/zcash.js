import type { BlockSelector, HttpTransport, Op, PublicBlock } from '../../docs/api/public-api.js';
import { readRpc } from '../http.js';
import { failure, invalidArgument } from '../errors.js';
import { JsonNumber, protocolError } from '../json.js';
import { blockHash, txId } from '../primitives.js';
import { getBlockHeader } from './public-chain-reads.js';

// WebIDL rejects signal proxies; Node's JavaScript getter may accept them.
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const apply = Reflect.apply;
const NativeController = AbortController;
const nativeSignal = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal')!.get!;
const nativeAbort = AbortController.prototype.abort;
const nativeAny = AbortSignal.any;
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const nodeRuntime = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';

// Same bounded native binding as accepted chain reads; no caller method lookup.
async function bindSignal(original?: AbortSignal) {
  if (original === undefined) return { signal: undefined, close() {} };
  const controller = new NativeController();
  const signal: AbortSignal = apply(nativeSignal, controller, []);
  let closed = false;
  const onAbort = () => {
    if (!closed && apply(nativeAborted, original, [])) apply(nativeAbort, controller, []);
  };
  if (nodeRuntime) {
    const builtin = 'node:events';
    const { addAbortListener } = await import(builtin);
    const view: AbortSignal = apply(nativeSignal, new NativeController(), []);
    Object.defineProperties(view, {
      aborted: { get: () => apply(nativeAborted, original, []) },
      addEventListener: { value: (type: string, listener: EventListener, options: AddEventListenerOptions) =>
        apply(nativeAdd, original, [type, listener, { ...options, once: false }]) },
      removeEventListener: { value: (type: string, listener: EventListener) =>
        apply(nativeRemove, original, [type, listener]) },
    });
    const subscription = addAbortListener(view, onAbort);
    const dispose = subscription[(Symbol as SymbolConstructor & { readonly dispose: symbol }).dispose];
    onAbort();
    return { signal, close() { closed = true; apply(dispose, subscription, []); } };
  }
  // Browser dependency propagation is independent of caller event delivery.
  const dependent = apply(nativeAny, AbortSignal, [[original]]);
  apply(nativeAdd, dependent, ['abort', onAbort]);
  onAbort();
  return { signal, close() { closed = true; apply(nativeRemove, dependent, ['abort', onAbort]); } };
}

const unsupportedSignal: (value: unknown) => boolean = (() => {
  try { apply(nativeAborted, new Proxy(new AbortController().signal, {}), []); }
  catch { return () => false; }
  const host = globalThis as typeof globalThis & { process?: {
    getBuiltinModule?: (name: string) => { types: { isProxy: (value: unknown) => boolean } };
  } };
  return host.process?.getBuiltinModule?.('node:util').types.isProxy ?? (() => true);
})();

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

function checkSignal(signal?: AbortSignal): void {
  if (signal === undefined) return;
  let aborted: boolean;
  try {
    if (unsupportedSignal(signal)) throw invalidArgument();
    aborted = apply(nativeAborted, signal, []);
    if (typeof aborted !== 'boolean') throw invalidArgument();
  } catch { throw invalidArgument(); }
  // Actual cancellation wins even over a hostile public getter.
  if (aborted) throw failure('ABORTED', 'transport', 'none', 'Request aborted.');
  try {
    const shadow = Object.getOwnPropertyDescriptor(signal, 'aborted');
    if (shadow && (!Object.hasOwn(shadow, 'value') || typeof shadow.value !== 'boolean')) throw invalidArgument();
  } catch { throw invalidArgument(); }
}

function integer(value: unknown, maximum: number): number {
  if (!(value instanceof JsonNumber) || !/^(?:0|[1-9][0-9]{0,9})$/.test(value.text)) throw protocolError();
  const number = Number(value.text);
  if (!Number.isSafeInteger(number) || number > maximum) throw protocolError();
  return number;
}

/** Internal composition; the owning client must bind the source and validate its network.
 * Checks source/header coherence, not consensus, transaction inclusion or current-chain membership.
 */
export async function getBlock(
  source: { readonly transport: HttpTransport; readonly sourceId: string },
  args: BlockSelector & Op,
): Promise<PublicBlock> {
  source = input(source, ['transport', 'sourceId']);
  args = input(args, ['height', 'hash', 'signal']);
  const { transport, sourceId } = source;
  const { height, hash: requestedHash, signal: caller } = args;
  if (typeof sourceId !== 'string' || sourceId.trim().length === 0
    || Object.hasOwn(args, 'height') === Object.hasOwn(args, 'hash')) throw invalidArgument();
  let selector: string;
  if (Object.hasOwn(args, 'height')) {
    if (typeof height !== 'number' || !Number.isInteger(height) || height < 0 || height > 0xffff_ffff) throw invalidArgument();
    selector = String(height);
  } else selector = blockHash(requestedHash!);

  checkSignal(caller);
  const binding = await bindSignal(caller);
  const { signal } = binding;
  try {
    checkSignal(caller);
    // readRpc owns the configured byte/deadline bounds and lossless JSON decoding.
    const value = await readRpc(transport, 'getblock', [selector, 1], signal);
    if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof JsonNumber) throw protocolError();
    const resolvedHeight = integer(value.height, 0xffff_ffff);
    const time = integer(value.time, 0xffff_ffff);
    // Pinned node TrustedPreallocate: MAX_BLOCK_BYTES / MIN_TRANSPARENT_TX_SIZE = 2_000_000 / 54.
    const count = integer(value.nTx, 37_037);
    if (count === 0 || !Array.isArray(value.tx) || value.tx.length !== count) throw protocolError();
    let hash, previousHash, txids;
    try {
      hash = blockHash(value.hash as string);
      previousHash = blockHash(value.previousblockhash as string);
      txids = value.tx.map(value => txId(value as string));
    } catch { throw protocolError(); }
    if (new Set(txids).size !== count
      || (height !== undefined && resolvedHeight !== height)
      || (requestedHash !== undefined && hash !== requestedHash)) throw protocolError();

    // Snapshot all caller input before callbacks; never look the height up again.
    const header = await getBlockHeader({ transport, sourceId }, { hash, ...(signal === undefined ? {} : { signal }) });
    checkSignal(caller);
    if (header === null || header.point.height !== resolvedHeight || header.point.hash !== hash
      || header.previousHash !== previousHash || header.time !== time) throw protocolError();
    return Object.freeze({ ...header, point: Object.freeze({ ...header.point }),
      raw: header.raw.slice(), txids: Object.freeze(txids) });
  } catch (error) {
    if (caller !== undefined && apply(nativeAborted, caller, [])) {
      checkSignal(caller);
    }
    throw error;
  } finally {
    try { binding.close(); }
    catch { /* Caller mutation must not replace the operation's result or error. */ }
  }
}
