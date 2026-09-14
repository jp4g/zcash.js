import type { HttpTransport, TransportOptions, ZcashError } from '../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from './errors.js';
import { JsonNumber, parseJson, protocolError } from './json.js';
import type { Json } from './json.js';

interface State {
  readonly url: string;
  readonly options: TransportOptions;
  nextId: bigint;
}
const transports = new WeakMap<HttpTransport, State>();
const rpcCodes = new WeakMap<object, number>();
/** Only errors produced from a validated RPC envelope carry trusted status. */
export function rpcErrorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? rpcCodes.get(error) : undefined;
}
export function httpSourceId(transport: HttpTransport): string {
  const state = transports.get(transport);
  if (!state) throw invalidArgument();
  return state.options.sourceId;
}
/** Private route identity; credentials supplied by headers are never part of this value. */
export function httpEndpoint(transport: HttpTransport): string {
  const state=transports.get(transport);if(!state)throw invalidArgument();return state.url;
}
const readMethods = new Set(['getblockchaininfo', 'getblockhash', 'getblock', 'getblockheader',
  'getrawtransaction', 'getrawmempool', 'getaddressutxos', 'z_gettreestate', 'z_getsubtreesbyindex']);

function record(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw invalidArgument();
  }
}
function integer(value: unknown, minimum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw invalidArgument();
}

export function http(url: string, options: TransportOptions): HttpTransport {
  let endpoint: URL;
  try {
    if (typeof url !== 'string' || url.trim() !== url) throw invalidArgument();
    endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || url.includes('#')) throw invalidArgument();
    record(options, ['sourceId', 'timeoutMs', 'readRetry', 'maxResponseBytes', 'headers']);
    const { sourceId, timeoutMs, readRetry, maxResponseBytes, headers } = options;
    record(readRetry, ['attempts', 'delayMs']);
    const snapshot: TransportOptions = {
      sourceId, timeoutMs, maxResponseBytes, ...(headers === undefined ? {} : { headers }),
      readRetry: { attempts: readRetry.attempts, delayMs: readRetry.delayMs },
    };
    if (typeof snapshot.sourceId !== 'string' || snapshot.sourceId.trim().length === 0) throw invalidArgument();
    integer(snapshot.timeoutMs, 1);
    integer(snapshot.maxResponseBytes, 1);
    integer(snapshot.readRetry.attempts, 1);
    integer(snapshot.readRetry.delayMs, 0);
    if (snapshot.headers !== undefined && typeof snapshot.headers !== 'function') throw invalidArgument();
    Object.freeze(snapshot.readRetry);
    Object.freeze(snapshot);
    const transport = Object.freeze({}) as HttpTransport;
    transports.set(transport, { url: endpoint.href, options: snapshot, nextId: 0n });
    return transport;
  } catch { throw invalidArgument(); }
}

function aborted(): ZcashError {
  return failure('ABORTED', 'transport', 'none', 'Request aborted.');
}
function timeout(): ZcashError {
  return failure('TIMEOUT', 'transport', 'none', 'Request timed out.', true);
}
function transportError(retryable = true): ZcashError {
  return failure('TRANSPORT_ERROR', 'transport', 'configure', 'HTTP JSON-RPC request failed.', retryable);
}
function resourceLimit(): ZcashError {
  return failure('RESOURCE_LIMIT', 'transport', 'configure', 'Response exceeds configured byte limit.');
}

// Chunk long timers so valid safe-integer durations cannot overflow host timers.
function schedule(ms: number, callback: () => void): () => void {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    const remaining = ms - (performance.now() - start);
    if (remaining <= 0) callback();
    else timer = setTimeout(tick, Math.min(remaining, 2_147_483_647));
  };
  timer = setTimeout(tick, Math.min(ms, 2_147_483_647));
  return () => clearTimeout(timer);
}

/** One deadline includes the header callback, dispatch, body and parsing. */
async function attempt(state: State, body: string, id: string, caller?: AbortSignal, dispatched?: () => void): Promise<Json> {
  if (caller?.aborted) throw aborted();
  const controller = new AbortController();
  let stopped: ZcashError | undefined;
  let rejectStop: (error: ZcashError) => void = () => {};
  const stopPromise = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
  const stop = (error: ZcashError) => {
    if (stopped) return;
    stopped = error;
    controller.abort();
    rejectStop(error);
  };
  const onAbort = () => stop(aborted());
  caller?.addEventListener('abort', onAbort, { once: true });
  const cancelTimer = schedule(state.options.timeoutMs, () => stop(timeout()));
  const started = performance.now();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  const bounded = <T>(promise: Promise<T>) => Promise.race([promise, stopPromise]);
  try {
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
    if (state.options.headers) {
      let supplied: Readonly<Record<string, string>>;
      try {
        supplied = await bounded(Promise.resolve().then(() => state.options.headers!()));
        if (typeof supplied !== 'object' || supplied === null || Array.isArray(supplied)) throw invalidArgument();
        for (const key of Reflect.ownKeys(supplied)) {
          if (typeof key !== 'string') throw invalidArgument();
          const value = supplied[key];
          if (typeof value !== 'string') throw invalidArgument();
          headers.set(key, value);
        }
        headers.set('content-type', 'application/json');
        headers.set('accept', 'application/json');
      } catch { throw stopped ?? invalidArgument(); }
    }
    if (caller?.aborted) throw aborted();
    if (stopped) throw stopped;
    // Header callbacks and processing can block the timeout timer.
    if (performance.now() - started >= state.options.timeoutMs) throw timeout();
    // Cancel a late response even if a nonconforming injected fetch ignores abort.
    dispatched?.();
    const fetching = fetch(state.url, { method: 'POST', body, headers, signal: controller.signal,
      credentials: 'omit', redirect: 'error', cache: 'no-store' }).then(value => {
      if (stopped) void value.body?.cancel().catch(() => {});
      return value;
    });
    response = await bounded(fetching);
    const httpError = response.ok ? undefined
      : transportError([408, 429, 500, 502, 503, 504].includes(response.status));
    const declared = response.headers.get('content-length');
    if (declared !== null) {
      if (!/^[0-9]+$/.test(declared)) throw protocolError();
      if (BigInt(declared) > BigInt(state.options.maxResponseBytes)) throw resourceLimit();
    }
    if (!response.body) throw httpError ?? protocolError();
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const chunks: string[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await bounded(reader.read());
      if (chunk.done) break;
      if (chunk.value.byteLength > state.options.maxResponseBytes - bytes) throw resourceLimit();
      bytes += chunk.value.byteLength;
      try { chunks.push(decoder.decode(chunk.value, { stream: true })); }
      catch { throw protocolError(); }
    }
    try { chunks.push(decoder.decode()); }
    catch { throw protocolError(); }
    let result: Json;
    try { result = parseEnvelope(chunks.join(''), id); }
    catch (error) {
      // Servers may use HTTP 500 for a structured RPC failure. Preserve those
      // semantics; a non-JSON HTTP error page is still an HTTP transport failure.
      if (httpError && isZcashError(error) && error.code === 'PROTOCOL_MISMATCH') throw httpError;
      throw error;
    }
    if (httpError) throw httpError;
    // Synchronous parsing cannot be interrupted by a timer; check elapsed time.
    if (performance.now() - started >= state.options.timeoutMs) throw timeout();
    return result;
  } catch (error) {
    if (stopped) throw stopped;
    if (isZcashError(error)) throw error;
    throw transportError();
  } finally {
    cancelTimer();
    caller?.removeEventListener('abort', onAbort);
    // Never await a foreign stream's cancellation promise past the deadline.
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else if (response) void response.body?.cancel().catch(() => {});
    controller.abort();
  }
}

function object(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof JsonNumber);
}
function parseEnvelope(text: string, id: string): Json {
  const envelope = parseJson(text);
  if (!object(envelope) || envelope.jsonrpc !== '2.0' || envelope.id !== id
    || Object.keys(envelope).some(key => !['jsonrpc', 'id', 'result', 'error'].includes(key))
    || Object.hasOwn(envelope, 'result') === Object.hasOwn(envelope, 'error')) throw protocolError();
  if (Object.hasOwn(envelope, 'result')) return envelope.result!;
  const error = envelope.error!;
  if (!object(error) || !(error.code instanceof JsonNumber) || typeof error.message !== 'string'
    || !/^-?(?:0|[1-9][0-9]*)$/.test(error.code.text)
    || !Number.isSafeInteger(Number(error.code.text))
    || Object.keys(error).some(key => !['code', 'message', 'data'].includes(key))) throw protocolError();
  const normalized = error.code.text === '-32601'
    ? failure('METHOD_NOT_SUPPORTED', 'transport', 'configure', 'RPC method is not supported.')
    : transportError(false);
  rpcCodes.set(normalized, Number(error.code.text));
  throw normalized;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw aborted();
  if (ms === 0) return;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { cancel(); signal?.removeEventListener('abort', onAbort); reject(aborted()); };
    const cancel = schedule(ms, () => { signal?.removeEventListener('abort', onAbort); resolve(); });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

type RpcParameter = string | number | boolean | { readonly addresses: readonly string[]; readonly chainInfo: true };
function ownParameters(method: string, params: readonly RpcParameter[]): RpcParameter[] {
  const parameters = [...params];
  if (method === 'getaddressutxos' && parameters.length === 1 && typeof parameters[0] === 'object') {
    const input = parameters[0];
    record(input, ['addresses', 'chainInfo']);
    const { addresses, chainInfo } = input;
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 1024 || chainInfo !== true) throw invalidArgument();
    const owned: string[] = [];
    const count = addresses.length;
    for (let index = 0; index < count; index++) {
      const value: unknown = addresses[index];
      if (typeof value !== 'string' || !value.length || value.length > 512) throw invalidArgument();
      owned.push(value);
    }
    return [{ addresses: owned, chainInfo: true }];
  }
  if (parameters.some(value => !['string', 'boolean'].includes(typeof value)
    && !(typeof value === 'number' && Number.isSafeInteger(value)))) throw invalidArgument();
  return parameters;
}

/** Internal read engine; no public raw-RPC escape hatch or broadcast replay. */
export async function readRpc(transport: HttpTransport, method: string, params: readonly RpcParameter[], signal?: AbortSignal): Promise<Json> {
  const state = transports.get(transport);
  if (!state || !readMethods.has(method) || !Array.isArray(params)
    || (signal !== undefined && !(signal instanceof AbortSignal))) throw invalidArgument();
  const parameters = ownParameters(method, params);
  for (let index = 0; index < state.options.readRetry.attempts; index++) {
    const id = (++state.nextId).toString();
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: parameters });
    try { return await attempt(state, body, id, signal); }
    catch (error) {
      if (!isZcashError(error) || !error.retryable || index + 1 >= state.options.readRetry.attempts) throw error;
      await delay(state.options.readRetry.delayMs, signal);
    }
  }
  throw invalidArgument();
}

/** Internal single-attempt write. Before dispatch errors throw; afterward uncertainty is explicit. */
export async function sendRawTransaction(transport: HttpTransport, hex: string, signal?: AbortSignal): Promise<{ result: Json } | { error: unknown }> {
  const state = transports.get(transport);
  if (!state || typeof hex !== 'string' || !hex.length || hex.length > 4 * 1024 * 1024
    || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex) || (signal !== undefined && !(signal instanceof AbortSignal))) throw invalidArgument();
  const id = (++state.nextId).toString();
  const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'sendrawtransaction', params: [hex] });
  let dispatched = false;
  try { return { result: await attempt(state, body, id, signal, () => { dispatched = true; }) }; }
  catch (error) { if (!dispatched) throw error; return { error }; }
}
