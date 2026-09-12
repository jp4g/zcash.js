import type { GrpcTransport, TransportOptions } from '../docs/api/public-api.js';
import { invalidArgument } from './errors.js';

const transports = new WeakMap<GrpcTransport, Readonly<{ url: string; options: TransportOptions }>>();

// Capture data once: header callbacks are invoked only by an actual request.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw invalidArgument();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw invalidArgument();
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !Object.hasOwn(field, 'value')) throw invalidArgument();
    result[key] = field.value;
  }
  return result;
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalidArgument();
  return value;
}

/** Opaque configuration only; platform loading and connections are lazy. */
export function grpc(url: string, options: TransportOptions): GrpcTransport {
  try {
    if (typeof url !== 'string' || /[\s\\?#]/.test(url) || !/^https?:\/\//.test(url)) throw invalidArgument();
    const endpoint = new URL(url);
    if (endpoint.username || endpoint.password || endpoint.pathname !== '/') throw invalidArgument();
    const input = record(options, ['sourceId', 'timeoutMs', 'readRetry', 'maxResponseBytes', 'headers']);
    const retry = record(input.readRetry, ['attempts', 'delayMs']);
    if (typeof input.sourceId !== 'string' || !input.sourceId.trim() || input.sourceId.length > 256
      || (input.headers !== undefined && typeof input.headers !== 'function')) throw invalidArgument();
    const snapshot: TransportOptions = Object.freeze({
      sourceId: input.sourceId,
      timeoutMs: integer(input.timeoutMs, 1, 2_147_483_647),
      maxResponseBytes: integer(input.maxResponseBytes, 1),
      readRetry: Object.freeze({ attempts: integer(retry.attempts, 1), delayMs: integer(retry.delayMs, 0) }),
      ...(input.headers === undefined ? {} : { headers: input.headers as NonNullable<TransportOptions['headers']> }),
    });
    const transport = Object.freeze({}) as GrpcTransport;
    // Preserve the explicit authority/port; URL normalization drops default ports.
    transports.set(transport, Object.freeze({ url, options: snapshot }));
    return transport;
  } catch { throw invalidArgument(); }
}

export function grpcBinding(transport: GrpcTransport) {
  const binding = transports.get(transport);
  if (!binding) throw invalidArgument();
  return binding;
}
