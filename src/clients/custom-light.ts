import type { CustomLightTransport, LightUnaryMethod, LightStreamMethod, Op } from '../types.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { ownBytes } from './owned-plumbing.js';
import { admit, operation } from './light-chain-reads.js';

const unaryMethods = new Set<LightUnaryMethod>(['GetLatestBlock', 'GetLightdInfo', 'GetTransaction', 'GetAddressUtxos', 'GetTaddressBalance', 'GetTreeState', 'SendTransaction']);
const streamMethods = new Set<LightStreamMethod>(['GetSubtreeRoots', 'GetBlockRange', 'GetTaddressTransactions', 'GetMempoolStream']);
const protocol = () => failure('PROTOCOL_MISMATCH', 'transport', 'configure', 'Invalid custom light response.');
const limit = () => failure('RESOURCE_LIMIT', 'transport', 'configure', 'Custom light response exceeds limit.');
const normalized = (error: unknown) => isZcashError(error) ? error : failure('TRANSPORT_ERROR', 'transport', 'configure', 'Custom light request failed.');

/** Capture application transport authority once; all requests and responses are owned. */
export function ownCustomLightTransport(value: CustomLightTransport): CustomLightTransport {
  let captured: CustomLightTransport;
  try {
    if (!value || typeof value !== 'object') throw 0;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !['kind', 'sourceId', 'protocolRevision', 'unary', 'stream'].includes(key)) throw 0;
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !Object.hasOwn(field, 'value')) throw 0;
      snapshot[key] = field.value;
    }
    if (typeof snapshot.unary !== 'function' || typeof snapshot.stream !== 'function') throw 0;
    captured = Object.freeze(snapshot) as unknown as CustomLightTransport;
  } catch { throw invalidArgument(); }
  admit(captured, {}, []);
  function request<T extends LightUnaryMethod | LightStreamMethod>(args: { method: T; request: Uint8Array } & Op, methods: Set<T>) {
    admit(captured, args, ['method', 'request', 'signal']);
    if (!methods.has(args.method)) throw invalidArgument();
    return { method: args.method, request: ownBytes(args.request, invalidArgument, limit), signal: args.signal };
  }
  return Object.freeze({ kind: 'custom-lightwallet', sourceId: captured.sourceId, protocolRevision: captured.protocolRevision,
    async unary(args: Parameters<CustomLightTransport['unary']>[0]) {
      const input = request(args, unaryMethods), pending = operation(input.signal);
      try {
        pending.check();
        const result = await pending.wait(Reflect.apply(captured.unary, value, [{ method: input.method, request: input.request, signal: pending.signal }]));
        pending.check();
        return ownBytes(result, protocol, limit);
      } catch (error) { pending.check(); throw normalized(error); }
      finally { pending.close(); }
    },
    stream(args: Parameters<CustomLightTransport['stream']>[0]): AsyncIterableIterator<Uint8Array> {
      const input = request(args, streamMethods);
      let iterator: AsyncIterator<Uint8Array> | undefined;
      let iterable: AsyncIterable<Uint8Array> & Partial<AsyncIterator<Uint8Array>>;
      let next: AsyncIterator<Uint8Array>['next'];
      let pending: ReturnType<typeof operation> | undefined;
      let finished = false, busy = false, total = 0, count = 0;
      let released: object | undefined;
      function release() {
        const owned = iterator ?? iterable;
        if (!owned || released === owned) return;
        released = owned;
        try { void Promise.resolve(owned.return?.()).catch(() => {}); } catch { /* Foreign cleanup cannot delay or replace terminality. */ }
      }
      return {
        [Symbol.asyncIterator]() { return this; },
        async next() {
          if (finished) return { done: true, value: undefined };
          if (busy) throw invalidArgument();
          busy = true;
          try {
            if (!pending) {
              pending = operation(input.signal, release); pending.check();
              iterable = Reflect.apply(captured.stream, value, [{ method: input.method, request: input.request, signal: pending.signal }]);
              pending.check();
              const acquire = iterable[Symbol.asyncIterator]; pending.check();
              iterator = Reflect.apply(acquire, iterable, []); pending.check();
              next = iterator!.next;
            }
            pending.check();
            const item = await pending.wait(Reflect.apply(next, iterator, [])); pending.check();
            if (!item || typeof item !== 'object') throw protocol();
            const done = item.done; pending.check();
            if (done) { finished = true; pending.close(); return { done: true, value: undefined }; }
            const bytes = ownBytes(item.value, protocol, limit);
            total += bytes.length;
            if (total > 64 * 1024 * 1024 || ++count > 65536) throw limit();
            pending.check();
            return { done: false, value: bytes };
          } catch (error) {
            finished = true;
            try { pending?.check(); } finally { pending?.close(); release(); }
            throw normalized(error);
          } finally { busy = false; }
        },
        async return() {
          finished = true; pending?.cancel(); release();
          return { done: true, value: undefined };
        },
      };
    },
  });
}
