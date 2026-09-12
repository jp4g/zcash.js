import type { HttpTransport, Op, PublicTransaction, TxId, Inclusion, TransactionObservation } from '../../docs/api/public-api.js';
import { readRpc } from '../http.js';
import { failure, invalidArgument } from '../errors.js';
import { JsonNumber, protocolError } from '../json.js';
import { txId, blockHash } from '../primitives.js';
import { getBlock } from './public-block-reads.js';

// Local native cancellation/descriptor binding follows the accepted chain reads.
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
      // Dynamic and Node-only: works across the public Node engine range, including
      // versions predating process.getBuiltinModule; browsers never resolve this URL.
      const builtin = 'node:util';
      proxyCheck ??= import(builtin).then(module => module.types.isProxy);
      if ((await proxyCheck)(original)) throw invalidArgument();
    }
    // Browser Web IDL branding rejects proxies; Node additionally needs isProxy.
    nativeAborted.call(original);
    const controller = new NativeController();
    const signal: AbortSignal = nativeSignal.call(controller);
    if (nodeRuntime) {
      const builtin = 'node:events';
      const { addAbortListener } = await import(builtin);
      // Node's helper reads public properties. Give it a native signal with
      // trusted forwarding operations, never the caller's overrides.
      const view: AbortSignal = nativeSignal.call(new NativeController());
      Object.defineProperties(view, {
        aborted: { get: () => nativeAborted.call(original) },
        addEventListener: { value: (type: string, listener: EventListener, options: AddEventListenerOptions) =>
          // Keep the resistant listener after synthetic events; only native
          // cancellation consumes the operation, and finally always detaches it.
          nativeAdd.call(original, type, listener, { ...options, once: false }) },
        removeEventListener: { value: nativeRemove.bind(original) },
      });
      const subscription = addAbortListener(view, () => {
        if (nativeAborted.call(original)) nativeAbort.call(controller);
      });
      if (nativeAborted.call(original)) nativeAbort.call(controller);
      return { signal, close: () => subscription[(Symbol as SymbolConstructor & { readonly dispose: symbol }).dispose]() };
    }
    // Web IDL uses native state, not public overrides. Dependency propagation
    // does not rely on delivery of an abort event on the caller's signal.
    const dependent = nativeAny([original]);
    const onAbort = () => nativeAbort.call(controller);
    nativeAdd.call(dependent, 'abort', onAbort);
    if (nativeAborted.call(dependent)) nativeAbort.call(controller);
    return { signal, close: () => nativeRemove.call(dependent, 'abort', onAbort) };
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


function checkAbort(signal?: AbortSignal): void {
  if (signal && nativeAborted.call(signal)) throw failure('ABORTED', 'transport', 'none', 'Request aborted.');
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (!(value instanceof JsonNumber) || !/^(?:0|-?[1-9][0-9]*)$/.test(value.text)) throw protocolError();
  const number = Number(value.text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw protocolError();
  return number;
}

/** Positive internal prerequisite only. Owner establishes source/network and historical
 * context independently; this module neither discovers context nor maps absence.
 */
export async function getTransaction(
  source: { readonly transport: HttpTransport; readonly sourceId: string },
  context: { readonly txid: TxId; readonly decodeTransaction: (raw: Uint8Array) => {
    readonly bytes: Uint8Array; readonly txid: Uint8Array; readonly display: string;
  } },
  args: { readonly txid: TxId } & Op,
): Promise<PublicTransaction> {
  source = input(source, ['transport', 'sourceId']);
  context = input(context, ['txid', 'decodeTransaction']);
  args = input(args, ['txid', 'signal']);
  const { transport, sourceId } = source;
  const { decodeTransaction } = context;
  const requested = txId(args.txid);
  if (typeof sourceId !== 'string' || !sourceId.trim() || context.txid !== requested
    || typeof decodeTransaction !== 'function') throw invalidArgument();
  const owned = await bridge(args.signal);
  const { signal } = owned;
  try {
    checkAbort(signal);
    const value = await readRpc(transport, 'getrawtransaction', [requested, 1], signal);
    checkAbort(signal);
    if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof JsonNumber) throw protocolError();
    let dtoId, hash;
    try {
      dtoId = txId(value.txid as string);
      if (Object.hasOwn(value, 'blockhash')) hash = blockHash(value.blockhash as string);
    } catch { throw protocolError(); }
    const height = Object.hasOwn(value, 'height') ? integer(value.height, -1, 0x7fff_ffff) : undefined;
    const confirmations = Object.hasOwn(value, 'confirmations') ? integer(value.confirmations, 0, Number.MAX_SAFE_INTEGER) : undefined;
    if (typeof value.in_active_chain !== 'boolean' || dtoId !== requested
      || typeof value.hex !== 'string' || !value.hex.length || value.hex.length > 4194304
      || value.hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value.hex)) throw protocolError();
    const raw = Uint8Array.from(value.hex.match(/../g)!, byte => parseInt(byte, 16));
    try {
      checkAbort(signal);
      const decoded = decodeTransaction(raw.slice());
      checkAbort(signal);
      if (!(decoded.bytes instanceof Uint8Array) || !(decoded.txid instanceof Uint8Array)
        || decoded.bytes.length !== raw.length || decoded.bytes.some((byte, i) => byte !== raw[i])
        || decoded.txid.length !== 32 || decoded.display !== requested
        || Array.from(decoded.txid).reverse().map(byte => byte.toString(16).padStart(2, '0')).join('') !== requested) throw protocolError();
    } catch { checkAbort(signal); throw protocolError(); }
    let state: TransactionObservation['state'];
    let inclusion: Inclusion | null = null;
    if (!value.in_active_chain && hash === undefined && height === undefined && confirmations === undefined) state = 'mempool';
    else if (!value.in_active_chain && hash !== undefined && height === -1 && confirmations === 0) state = 'offMainChain';
    else if (value.in_active_chain && height !== undefined && height >= 0 && confirmations !== undefined && confirmations > 0) {
      state = 'unknown';
      if (hash !== undefined) {
        const block = await getBlock({ transport, sourceId }, { height, ...(signal === undefined ? {} : { signal }) });
        checkAbort(signal);
        if (block.point.hash === hash) {
          if (block.point.height !== height || !block.txids.includes(requested)) throw protocolError();
          state = 'mined'; inclusion = Object.freeze({ height, blockHash: hash, confirmations: null });
        }
      }
    } else throw protocolError();
    checkAbort(signal);
    const observedAt = new Date().toISOString();
    return Object.freeze({ txid: requested, raw: raw.slice(), sourceId, observedAt,
      observation: Object.freeze({ txid: requested, state, inclusion, tip: null, priorInclusion: null, sourceId, observedAt }) });
  } catch (error) { checkAbort(signal); throw error; }
  finally { try { owned.close(); } catch { /* Cleanup must not replace the outcome. */ } }
}
