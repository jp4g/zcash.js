import { failure, invalidArgument, isZcashError } from '../errors.js';

// Internal byte admission shared by finite light-client reads.
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const tag = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag)!.get!;
const bufferOf = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
export function ownBytes(bytes: Uint8Array, protocol: () => Error, resourceLimit: () => Error, maximum = 4 * 1024 * 1024): Uint8Array {
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
export function snapshot<T extends object>(args: T, keys: readonly string[], maximum = 4 * 1024 * 1024): T {
  try {
    if (!args || typeof args !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(args))) throw invalidArgument();
    const output = Object.create(null);
    for (const key of Reflect.ownKeys(args)) {
      if (typeof key !== 'string' || !keys.includes(key)) throw invalidArgument();
      const field = Object.getOwnPropertyDescriptor(args, key);
      if (!field || !Object.hasOwn(field, 'value')) throw invalidArgument();
      output[key] = field.value;
    }
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

// Node >=20.19 exposes these builtins without putting Node imports in browser bundles.
const nodeHost = (globalThis as typeof globalThis & { process?: { getBuiltinModule(name: string): {
  types: { isProxy(value: unknown): boolean };
  addAbortListener(signal: AbortSignal, callback: () => void): { [key: symbol]: () => void };
} } }).process;
export const nodeIsProxy = (value: unknown) => nodeHost!.getBuiltinModule('util').types.isProxy(value);
export const nodeEvents = () => nodeHost!.getBuiltinModule('events');
