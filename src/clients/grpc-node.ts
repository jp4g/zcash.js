import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { Client, Metadata, credentials, status } from '@grpc/grpc-js';
import type { CustomLightTransport, LightUnaryMethod, LightStreamMethod, ZcashError } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';

const service = '/cash.z.wallet.sdk.rpc.CompactTxStreamer/';
const revision = 'lightwire:80575dbe59a9bf2e6b79e2391eb78679c453f1a0477292eb97ea3b58bb6c8b10:d8d0c8aaa5ceec7d5dcc188ef25b04011df2ec0254901620fce982fc13aeb32d';
const unaryMethods = new Set(['GetLatestBlock', 'GetLightdInfo', 'GetTransaction', 'GetAddressUtxos', 'GetTaddressBalance', 'GetTreeState', 'SendTransaction']);
const streamMethods = new Set(['GetSubtreeRoots', 'GetBlockRange', 'GetTaddressTransactions', 'GetMempoolStream']);
const aborted = () => failure('ABORTED', 'transport', 'none', 'Request aborted.');
const timeout = () => failure('TIMEOUT', 'transport', 'none', 'Request timed out.');
const limit = () => failure('RESOURCE_LIMIT', 'transport', 'configure', 'gRPC byte or message limit exceeded.');
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
type Args<M> = { method: M; request: Uint8Array; signal?: AbortSignal };
export interface GrpcNodeOptions {
  readonly sourceId: string;
  readonly timeoutMs: number;
  readonly headers?: () => Promise<Readonly<Record<string, string>>>;
  readonly limits?: { readonly messageBytes?: number; readonly totalBytes?: number; readonly messages?: number };
}
function record(value: unknown, keys?: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || (keys && !keys.includes(key))
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) throw invalidArgument();
}
function integer(value: unknown, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) throw invalidArgument();
}
function normalize(error: unknown): ZcashError {
  if (isZcashError(error)) return error;
  const code = (error as { code?: number } | null)?.code;
  if (code === status.DEADLINE_EXCEEDED) return timeout();
  if (code === status.CANCELLED) return aborted();
  if (code === status.RESOURCE_EXHAUSTED) return limit();
  return failure(code === status.UNIMPLEMENTED ? 'METHOD_NOT_SUPPORTED' : 'TRANSPORT_ERROR',
    'transport', 'configure', 'gRPC request failed.');
}

/** Node-only bounded protobuf adapter. No handshake, decoding, retries, or provider selection. */
export function createGrpcNodeTransport(url: string, options: GrpcNodeOptions): CustomLightTransport {
  let endpoint: URL;
  let sourceId: string, timeoutMs: number, headers: GrpcNodeOptions['headers'];
  const limits = { messageBytes: 4 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, messages: 65536 };
  try {
    if (typeof url !== 'string' || /[\s\\?#]/.test(url) || !/^https?:\/\//.test(url)) throw invalidArgument();
    endpoint = new URL(url);
    if (endpoint.username || endpoint.password || endpoint.pathname !== '/') throw invalidArgument();
    record(options, ['sourceId', 'timeoutMs', 'headers', 'limits']);
    ({ sourceId, timeoutMs, headers } = options);
    if (typeof sourceId !== 'string' || !sourceId.length || sourceId.length > 256) throw invalidArgument();
    integer(timeoutMs, 2147483647);
    if (headers !== undefined && typeof headers !== 'function') throw invalidArgument();
    if (options.limits !== undefined) {
      record(options.limits, Object.keys(limits));
      for (const key of Object.getOwnPropertyNames(options.limits) as (keyof typeof limits)[]) {
        const value = options.limits[key]; integer(value, limits[key]); limits[key] = value;
      }
    }
  } catch { throw invalidArgument(); }

  function admit<M extends string>(args: Args<M>, methods: Set<string>): Args<M> {
    try {
      record(args, ['method', 'request', 'signal']);
      if (!methods.has(args.method) || !types.isUint8Array(args.request)) throw invalidArgument();
      const buffer = bufferOf.call(args.request);
      if (types.isSharedArrayBuffer(buffer) || resizable?.call(buffer)) throw invalidArgument();
      const view = new Uint8Array(buffer, offsetOf.call(args.request), lengthOf.call(args.request));
      if (view.length > limits.messageBytes) throw limit();
      const request = new Uint8Array(view); // Own bytes before lazy dispatch.
      const signal = args.signal;
      if (signal !== undefined) {
        if (types.isProxy(signal) || Object.getPrototypeOf(signal) !== AbortSignal.prototype
          || Object.hasOwn(signal, 'aborted') || Object.hasOwn(signal, 'reason')) throw invalidArgument();
        signalAborted.call(signal);
      }
      return { method: args.method, request, ...(signal === undefined ? {} : { signal }) };
    } catch (error) { throw isZcashError(error) ? error : invalidArgument(); }
  }

  function operation(signal?: AbortSignal) {
    // Private dependent signals observe native cancellation, not caller-dispatched events.
    const dependent = signal === undefined ? undefined : AbortSignal.any([signal]);
    const deadline = Date.now() + timeoutMs;
    let stopped: ZcashError | undefined, client: Client | undefined, call: { cancel(): void } | undefined;
    let rejectStop!: (error: ZcashError) => void;
    const interruption = new Promise<never>((_, reject) => { rejectStop = reject; });
    void interruption.catch(() => {});
    const stop = (error: ZcashError) => {
      if (stopped) return;
      stopped = error; rejectStop(error); cleanup();
    };
    const onAbort = () => stop(aborted());
    const timer = setTimeout(() => stop(timeout()), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      dependent?.removeEventListener('abort', onAbort);
      call?.cancel(); client?.close();
    }
    if (signal) {
      dependent!.addEventListener('abort', onAbort, { once: true });
      if (signalAborted.call(signal)) onAbort();
    }
    function check() {
      if (signal !== undefined && signalAborted.call(signal)) onAbort();
      if (!stopped && Date.now() >= deadline) stop(timeout());
      if (stopped) throw stopped;
    }
    return {
      deadline, cleanup, cancel: onAbort, check,
      async bounded<T>(promise: Promise<T>): Promise<T> {
        const value = await Promise.race([promise, interruption]); check(); return value;
      },
      own(value: { cancel(): void }) { call = value; },
      async start() {
        check();
        const metadata = new Metadata();
        if (headers) {
          let supplied: unknown;
          try { supplied = await this.bounded(Promise.resolve().then(headers)); }
          catch { check(); throw invalidArgument(); }
          record(supplied);
          let bytes = 0;
          for (const key of Object.getOwnPropertyNames(supplied)) {
            const value = supplied[key];
            if (!/^[0-9a-z_.-]+$/.test(key) || /^(grpc-|content-|:)|-bin$/.test(key)
              || ['host', 'connection', 'te', 'user-agent'].includes(key)
              || typeof value !== 'string' || /[^\x20-\x7e]/.test(value)) throw invalidArgument();
            bytes += key.length + value.length + 32;
            if (bytes > 8192) throw invalidArgument();
            metadata.set(key, value);
          }
        }
        check();
        // One owned channel per operation keeps disposal out of the custom transport contract.
        client = new Client(`${endpoint.hostname}:${endpoint.port || (endpoint.protocol === 'https:' ? '443' : '80')}`, endpoint.protocol === 'https:' ? credentials.createSsl() : credentials.createInsecure(), {
          'grpc.enable_retries': 0, 'grpc.max_receive_message_length': limits.messageBytes,
          'grpc.max_send_message_length': limits.messageBytes,
          'grpc.enable_http_proxy': 0,
        });
        return { client, metadata };
      },
    };
  }
  return Object.freeze({
    kind: 'custom-lightwallet', sourceId, protocolRevision: revision,
    async unary(args: Args<LightUnaryMethod>) {
      const owned = admit(args, unaryMethods), op = operation(owned.signal);
      try {
        const { client, metadata } = await op.start();
        const response = await op.bounded(new Promise<Uint8Array>((resolve, reject) => {
          op.own(client.makeUnaryRequest(service + owned.method, Buffer.from, bytes => new Uint8Array(bytes),
            owned.request, metadata, { deadline: op.deadline }, (error, value) => {
              if (error) reject(error); else if (value === undefined) reject(failure('PROTOCOL_MISMATCH', 'transport', 'configure', 'Missing gRPC response.'));
              else resolve(value);
            }));
        }));
        if (response.length > limits.totalBytes) throw limit();
        return response;
      } catch (error) { throw normalize(error); } finally { op.cleanup(); }
    },
    stream(args: Args<LightStreamMethod>): AsyncIterableIterator<Uint8Array> {
      const owned = admit(args, streamMethods);
      let op: ReturnType<typeof operation> | undefined, finished = false, busy = false;
      async function* run() {
        op = operation(owned.signal);
        try {
          const { client, metadata } = await op.start();
          const call = client.makeServerStreamRequest(service + owned.method, Buffer.from, bytes => new Uint8Array(bytes),
            owned.request, metadata, { deadline: op.deadline });
          op.own(call);
          call.on('error', () => {}); // Cancellation remains handled even between pulls.
          const terminal = new Promise<void>((resolve, reject) => call.once('status', value => {
            if (value.code === status.OK) resolve(); else reject(normalize(value));
          }));
          void terminal.catch(() => {});
          const iterator = call[Symbol.asyncIterator]();
          let total = 0, count = 0;
          for (;;) {
            const item = await op.bounded(iterator.next());
            if (item.done) break;
            total += item.value.length;
            if (total > limits.totalBytes || ++count > limits.messages) throw limit();
            yield item.value as Uint8Array;
          }
          await op.bounded(terminal);
        } catch (error) { throw normalize(error); } finally { op.cleanup(); }
      }
      const iterator = run();
      return {
        [Symbol.asyncIterator]() { return this; },
        async next() {
          if (finished) return { done: true, value: undefined };
          if (busy) throw invalidArgument();
          busy = true;
          try {
            op?.check();
            const result = await iterator.next();
            if (result.done) finished = true;
            return result;
          } catch (error) { finished = true; op?.cleanup(); throw normalize(error); }
          finally { busy = false; }
        },
        async return() {
          finished = true; op?.cancel();
          void iterator.return(undefined).catch(() => {});
          return { done: true, value: undefined };
        },
      };
    },
  });
}
