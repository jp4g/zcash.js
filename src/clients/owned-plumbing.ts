import { failure, invalidArgument, isZcashError } from '../errors.js';

// Internal byte admission shared by finite light-client reads.
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag)!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
export function ownBytes(bytes: unknown, protocol: () => Error, resourceLimit: () => Error, maximum = 4 * 1024 * 1024): Uint8Array {
  try {
    if (tag.call(bytes) !== 'Uint8Array') throw protocol();
    const buffer = bufferOf.call(bytes);
    bufferLength.call(buffer);
    typedArray.values.call(bytes); // Reject detached/out-of-bounds original views.
    const length = lengthOf.call(bytes);
    if (length > maximum) throw resourceLimit();
    return new Uint8Array(new Uint8Array(buffer, offsetOf.call(bytes), length));
  } catch (error) { throw isZcashError(error) ? error : protocol(); }
}

const resource = () => failure('RESOURCE_LIMIT', 'query', 'configure', 'Client input exceeds limit.');
export function snapshot<T extends object>(args: T, keys: readonly string[], maximum?: number): T;
export function snapshot(args: unknown, keys: readonly string[], maximum?: number): Record<string, unknown>;
export function snapshot(args: unknown, keys: readonly string[], maximum = 4 * 1024 * 1024): Record<string, unknown> {
  try {
    const output = recordFields(args, keys);
    if ('bytes' in output) output.bytes = ownBytes(output.bytes, invalidArgument, resource, maximum);
    if ('addresses' in output) {
      const values = output.addresses;
      if (!Array.isArray(values) || !values.length || values.length > 1000) throw invalidArgument();
      const copy: string[] = [];
      for (let index = 0; index < values.length; index++) {
        const field = Object.getOwnPropertyDescriptor(values, String(index));
        if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string') throw invalidArgument();
        copy.push(field.value);
      }
      output.addresses = copy;
    }
    return output;
  } catch (error) { throw isZcashError(error) ? error : invalidArgument(); }
}

// Descriptor copying is shared; callers retain their existing error/ownership policies.
function recordFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalidArgument();
  const output: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw invalidArgument();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalidArgument();
    output[key] = descriptor.value;
  }
  return output;
}

/** Shallow data-only options; foreign errors are always sanitized as invalid input. */
export function copyRecord<T extends object>(value: T, keys: readonly string[]): T;
export function copyRecord(value: unknown, keys: readonly string[]): Record<string, unknown>;
export function copyRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (Array.isArray(value)) throw invalidArgument();
    return recordFields(value, keys);
  } catch { throw invalidArgument(); }
}
