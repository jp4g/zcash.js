import { admitSignal } from '../abort.js';
import { invalidArgument, failure, isZcashError } from '../errors.js';
import { snapshot, ownBytes } from './owned-plumbing.js';

/** Capture broadcast bytes before a client handshake or custom callback can yield. */
export function broadcastInput(args: unknown) {
  const input = snapshot(args, ['bytes', 'signal']);
  const bytes = ownBytes(input.bytes, invalidArgument,
    () => failure('RESOURCE_LIMIT', 'query', 'configure', 'Client input exceeds limit.'));
  const signal = input.signal;
  admitSignal(signal);
  return { bytes, ...(signal === undefined ? {} : { signal }) };
}

/** Own a bounded address list without invoking caller element getters. */
export function addressInput(args: unknown) {
  try {
    const input = snapshot(args, ['addresses', 'signal']);
    const values = input.addresses;
    if (!Array.isArray(values) || !values.length || values.length > 1000) throw invalidArgument();
    const read = (index: number): string => {
      const field = Object.getOwnPropertyDescriptor(values, String(index));
      if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string') throw invalidArgument();
      return field.value;
    };
    const addresses: [string, ...string[]] = [read(0)];
    for (let index = 1; index < values.length; index++) addresses.push(read(index));
    const signal = input.signal;
    admitSignal(signal);
    return { addresses, ...(signal === undefined ? {} : { signal }) };
  } catch (error) {
    throw isZcashError(error) ? error : invalidArgument();
  }
}
