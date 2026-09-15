import type { ConsensusContext, ErrorCode, PcztApi, PcztHandle } from './types.js';
import type { StandalonePczt } from './runtime/primitive-capsule.mjs';
import { snapshot, ownBytes } from './clients/owned-plumbing.js';
import { operation } from './clients/light-chain-reads.js';
import { networkBinding } from './network.js';
import { failure, invalidArgument, isZcashError } from './errors.js';
const resource = () => failure('RESOURCE_LIMIT', 'validation', 'configure', 'PCZT exceeds configured limit.');
const codes: readonly ErrorCode[] = [
  'INVALID_ARGUMENT',
  'INVALID_PCZT',
  'NETWORK_MISMATCH',
  'UNSUPPORTED_VERSION',
  'UNSUPPORTED_POOL',
  'PCZT_ASSOCIATION_MISMATCH',
  'RESOURCE_LIMIT',
  'CLOSED',
];
function mapped(error: unknown): never {
  if (isZcashError(error)) throw error;
  const name = typeof error === 'string'
    ? error
    : error instanceof Error
      ? Object.getOwnPropertyDescriptor(error, 'message')?.value
      : undefined;
  const code = codes.includes(name) ? name as ErrorCode : 'RUNTIME_UNAVAILABLE';
  throw failure(
    code,
    code === 'RUNTIME_UNAVAILABLE' ? 'runtime' : 'validation',
    code === 'CLOSED'
      ? 'none'
      : code === 'RESOURCE_LIMIT' || code === 'RUNTIME_UNAVAILABLE'
        ? 'configure'
        : 'correct-input',
    'PCZT operation failed.',
  );
}
interface Owner { native: StandalonePczt | undefined; context: ConsensusContext; maximum: number }
const owners = new WeakMap<PcztHandle, Owner>();
function owner(handle: PcztHandle): Owner & { native: StandalonePczt } {
  const value = owners.get(handle);
  if (!value) throw invalidArgument();
  if (!value.native) throw failure('CLOSED', 'validation', 'none', 'PCZT is disposed.');
  return value as Owner & { native: StandalonePczt };
}
function publish(native: StandalonePczt, context: ConsensusContext, maximum: number): PcztHandle {
  const state: Owner = { native, context, maximum };
  const handle = Object.freeze({
    async dispose() {
      const value = state.native;
      state.native = undefined;
      try {
        value?.dispose();
      } catch (error) {
        mapped(error);
      }
    },
  }) as PcztHandle;
  owners.set(handle, state);
  return handle;
}
function run<T>(signal: AbortSignal | undefined, action: () => T, discard?: (value: T) => void): T {
  const pending = operation(signal);
  let value: T | undefined,
    returned = false;
  try {
    pending.check();
    value = action();
    returned = true;
    pending.check();
    return value;
  } catch (error) {
    if (returned && discard) discard(value!);
    return mapped(error);
  } finally {
    pending.close();
  }
}
export const pczt = Object.freeze<PcztApi>({
  async parse(args) {
    if (!args || typeof args !== 'object') throw invalidArgument();
    let maximum: number;
    try {
      maximum = Object.getOwnPropertyDescriptor(args, 'maxBytes')?.value;
    } catch {
      throw invalidArgument();
    }
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 0xffffffff) throw invalidArgument();
    const input = snapshot(args, ['bytes', 'context', 'maxBytes', 'signal']);
    const bytes = ownBytes(input.bytes, invalidArgument, resource, maximum);
    if (input.maxBytes !== maximum) throw invalidArgument();
    const context = snapshot(input.context, ['network', 'targetHeight', 'branchId']),
      bound = networkBinding(context.network);
    if (!Number.isInteger(context.targetHeight) || context.targetHeight < 0 || context.targetHeight > 0xffffffff

      || !Number.isInteger(context.branchId)
      || context.branchId < 0
      || context.branchId > 0xffffffff) throw invalidArgument();
    const genesis = Uint8Array.from(context.network.genesisHash.match(/../g)!.reverse(), byte => parseInt(byte, 16));
    const native = run(
      input.signal,
      () => bound.codec.parseStandalonePczt(
        bound.definition.parameters.bytes,
        genesis,
        context.targetHeight,
        context.branchId,
        bytes,
        maximum,
      ),
      value => value.dispose(),
    );
    return publish(native, Object.freeze({ ...context }), maximum);
  },
  async serialize(args) {
    const input = snapshot(args, ['pczt', 'signal']),
      value = owner(input.pczt);
    return run(
      input.signal,
      () => ownBytes(value.native.serialize(), invalidArgument, resource, value.maximum),
    );
  },
  async inspect(args) {
    const input = snapshot(args, ['pczt', 'signal']),
      value = owner(input.pczt);
    return run(input.signal, () => {
      const result = value.native.inspect();
      return {
        pcztVersion: result.pcztVersion,
        transactionVersion: result.transactionVersion,
        context: { ...value.context },
        pools: [...result.pools],
        proofsComplete: result.proofsComplete,
        authorizationComplete: result.authorizationComplete,
      };
    });
  },
  async combine(args) {
    const input = snapshot(args, ['pczts', 'signal']);
    let length: number;
    try {
      if (!Array.isArray(input.pczts)) throw invalidArgument();
      length = Object.getOwnPropertyDescriptor(input.pczts, 'length')?.value;
      if (!Number.isInteger(length) || length < 1) throw invalidArgument();
    } catch {
      throw invalidArgument();
    }
    if (length > 1024) throw resource();
    const values: ReturnType<typeof owner>[] = [];
    try {
      for (let i = 0; i < length; i++) {
        const field = Object.getOwnPropertyDescriptor(input.pczts, String(i));
        if (!field || !Object.hasOwn(field, 'value')) throw invalidArgument();
        values.push(owner(field.value));
      }
    } catch (error) {
      throw isZcashError(error) ? error : invalidArgument();
    }
    const first = values[0]!,
      bound = networkBinding(first.context.network).definition.binding;
    if (values.some(
      value => networkBinding(value.context.network).definition.binding !== bound,
    )) {
      throw failure(
        'NETWORK_MISMATCH',
        'validation',
        'correct-input',
        'PCZT network mismatch.',
      );
    }
    const native = run(input.signal, () => {
      let combined = first.native.combine(first.native);
      try {
        for (const value of values.slice(1)) {
          const next = combined.combine(value.native);
          combined.dispose();
          combined = next;
        }
        return combined;
      } catch (error) {
        combined.dispose();
        throw error;
      }
    }, value => value.dispose());
    return publish(
      native,
      first.context,
      values.reduce((minimum, value) => Math.min(minimum, value.maximum), first.maximum),
    );
  },
  async redact(args) {
    const input = snapshot(args, ['pczt', 'profile', 'signal']),
      value = owner(input.pczt);
    const native = run(
      input.signal,
      () => value.native.redact(input.profile),
      result => result.dispose(),
    );
    return publish(native, value.context, value.maximum);
  },
});
