import type {
  AccountDescriptor,
  AddressApi,
  AddressRecord,
  ErrorCode,
  Network,
  NonEmpty,
  Op,
  Pool,
  ViewKeyHandle,
  ViewingApi,
} from './types.js';
import type { ViewingAuthority } from './runtime/primitive-capsule.mjs';
import { networkBinding } from './network.js';
import { snapshot, ownBytes } from './clients/owned-plumbing.js';
import { operation } from './clients/light-chain-reads.js';
import { diversifierIndex } from './primitives.js';
import { failure, invalidArgument, isZcashError } from './errors.js';

const handles = new WeakMap<ViewKeyHandle, { native: ViewingAuthority; network: Network; closed: boolean }>();
const codes: Record<string, ErrorCode> = {
  CLOSED: 'CLOSED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INVALID_ADDRESS: 'INVALID_ARGUMENT',
  MISSING_AUTHORITY: 'RECEIVER_UNAVAILABLE',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  FULL_VIEWING_KEY_REQUIRED: 'FULL_VIEWING_KEY_REQUIRED',
  UNSUPPORTED_POOL: 'UNSUPPORTED_POOL',
  INVALID_DIVERSIFIER: 'INVALID_DIVERSIFIER',
  DIVERSIFIER_EXHAUSTED: 'DIVERSIFIER_EXHAUSTED',
  ADDRESS_SEARCH_LIMIT: 'ADDRESS_SEARCH_LIMIT',
  DISCOVERY_RANGE_UNSAFE: 'DISCOVERY_RANGE_UNSAFE',
  RECEIVER_UNAVAILABLE: 'RECEIVER_UNAVAILABLE',
  RESOURCE_LIMIT: 'RESOURCE_LIMIT',
};
function mapped(error: unknown): never {
  if (isZcashError(error)) throw error;
  const name = typeof error === 'string'
    ? error
    : error instanceof Error
      ? Object.getOwnPropertyDescriptor(error, 'message')?.value
      : undefined;
  const code = typeof name === 'string' ? codes[name] : undefined;
  throw failure(
    code ?? 'RUNTIME_UNAVAILABLE',
    code ? 'address' : 'runtime',
    code === 'CLOSED' ? 'none' : code === 'RESOURCE_LIMIT' || !code ? 'configure' : 'correct-input',
    'Viewing operation failed.',
  );
}
function run<T>(signal: AbortSignal | undefined, action: () => T): T {
  let pending: ReturnType<typeof operation>;
  try {
    pending = operation(signal);
  } catch {
    throw invalidArgument();
  }
  try {
    pending.check();
    const value = action();
    pending.check();
    return value;
  } catch (error) {
    return mapped(error);
  } finally {
    pending.close();
  }
}
function authority(account: unknown) {
  const value = snapshot(account, ['network', 'viewing', 'components', 'enabledPools', 'provenance']);
  if (typeof value.viewing !== 'object' || value.viewing === null) throw invalidArgument();
  const handle = handles.get(value.viewing as ViewKeyHandle);
  if (!handle || value.network !== handle.network) throw invalidArgument();
  if (handle.closed) throw failure('CLOSED', 'account', 'none', 'Viewing authority is disposed.');
  return { ...handle, viewing: value.viewing as ViewKeyHandle };
}
/** Preserve the genuine handle while projecting metadata from its native authority. */
export function checkedAccountDescriptor(account: unknown): AccountDescriptor {
  const owned = snapshot(account, ['network', 'viewing', 'components', 'enabledPools', 'provenance']);
  const state = authority(owned),
    data = state.native.describe();
  return Object.freeze({
    network: state.network,
    viewing: state.viewing,
    components: Object.freeze([...data.components]),
    enabledPools: Object.freeze([...data.enabledPools]),
    provenance: data.provenance,
  });
}
function descriptor(native: ViewingAuthority, network: Network): AccountDescriptor {
  try {
    const data = native.describe();
    const state = { native, network, closed: false };
    const viewing = Object.freeze({
      kind: data.kind,
      async dispose() {
        if (!state.closed) {
          state.closed = true;
          try {
            native.dispose();
          } catch (error) {
            mapped(error);
          }
        }
      },
    }) as ViewKeyHandle;
    handles.set(viewing, state);
    return Object.freeze({
      network,
      viewing,
      components: Object.freeze([...data.components]),
      enabledPools: Object.freeze([...data.enabledPools]),
      provenance: data.provenance,
    });
  } catch (error) {
    native.dispose();
    return mapped(error);
  }
}
function request(value: unknown): string {
  if (value === undefined) return '{"format":"unified"}';
  const owned = snapshot(value as object, ['format', 'transparent', 'sapling', 'ironwood']);
  const shape = owned as Record<string, unknown>,
    keys = Object.keys(shape);
  if (shape.format === 'transparent') {
    if (keys.length !== 1) throw invalidArgument();
  } else if (shape.format !== 'unified') throw invalidArgument();
  else if (keys.length !== 1
    && (keys.length !== 4
      || !['require', 'omit', 'allow'].includes(shape.transparent as string)
      || !['require', 'omit'].includes(shape.sapling as string)
      || !['require', 'omit'].includes(shape.ironwood as string)
      || shape.sapling !== 'require' && shape.ironwood !== 'require')) throw invalidArgument();
  return JSON.stringify(owned);
}
function record(value: ReturnType<ViewingAuthority['derive']>): AddressRecord {
  return {
    address: value.address,
    index: diversifierIndex(BigInt(value.index)),
    receiverTypes: [...value.receiverTypes],
    intendedPools: [...value.intendedPools],
  };
}

/** Caller-owned native viewing authority, independent of wallet storage. */
export async function accountFromViewingKey(
  args: { network: Network; format: 'ufvk' | 'uivk'; encoded: string; enabledPools: NonEmpty<Pool> } & Op,
): Promise<AccountDescriptor> {
  const owned = snapshot(args, ['network', 'format', 'encoded', 'enabledPools', 'signal']);
  const bound = networkBinding(owned.network);
  if (!Array.isArray(owned.enabledPools) || !owned.enabledPools.length
    || owned.enabledPools.length > 3) throw invalidArgument();
  const pools: Pool[] = [];
  for (let i = 0; i < owned.enabledPools.length; i++) {
    const field = Object.getOwnPropertyDescriptor(owned.enabledPools, String(i));
    if (!field || !Object.hasOwn(field, 'value')
      || !['transparent', 'sapling', 'ironwood'].includes(field.value)) throw invalidArgument();
    pools.push(field.value);
  }
  let native: ViewingAuthority | undefined;
  try {
    run(owned.signal, () => {
      native = bound.codec.openViewingAuthority(
        bound.definition.parameters.bytes,
        owned.format,
        owned.encoded,
        JSON.stringify(pools),
      );
    });
    return descriptor(native!, owned.network);
  } catch (error) {
    native?.dispose();
    return mapped(error);
  }
}
export const viewing = Object.freeze<ViewingApi>({
  async export(args) {
    const owned = snapshot(args, ['account', 'format', 'acknowledge', 'signal']);
    const handle = authority(owned.account);
    return run(owned.signal, () => handle.native.export(owned.format, owned.acknowledge));
  },
  async toIncoming(args) {
    const owned = snapshot(args, ['account', 'signal']),
      handle = authority(owned.account);
    let native: ViewingAuthority | undefined;
    try {
      run(owned.signal, () => {
        native = handle.native.toIncoming();
      });
      return descriptor(native!, handle.network);
    } catch (error) {
      native?.dispose();
      return mapped(error);
    }
  },
});
export const addresses = Object.freeze<AddressApi>({
  async derive(args) {
    const owned = snapshot(args, ['account', 'index', 'request', 'signal']),
      handle = authority(owned.account);
    const index = diversifierIndex(owned.index).toString(),
      shape = request(owned.request);
    return run(owned.signal, () => record(handle.native.derive(index, shape)));
  },
  async find(args) {
    const owned = snapshot(args, ['account', 'start', 'request', 'maxAttempts', 'signal']),
      handle = authority(owned.account);
    const index = diversifierIndex(owned.start).toString(),
      shape = request(owned.request);
    return run(owned.signal, () => record(handle.native.find(index, shape, owned.maxAttempts)));
  },
  async decode(args) {
    const owned = snapshot(args, ['network', 'address', 'signal']),
      bound = networkBinding(owned.network);
    return run(
      owned.signal,
      () => ({
        network: owned.network,
        ...bound.codec.decodeViewingAddress(bound.definition.parameters.bytes, owned.address),
      }),
    );
  },
  async selectReceiver(args) {
    const owned = snapshot(args, ['address', 'pool', 'context', 'signal']);
    const address = snapshot(owned.address, ['network', 'encoded', 'knownReceivers', 'unknownTypecodes']);
    const context = snapshot(owned.context, ['network', 'targetHeight', 'branchId']);
    const bound = networkBinding(address.network),
      other = networkBinding(context.network);
    if (bound.definition.binding !== other.definition.binding) {
      throw failure(
        'NETWORK_MISMATCH',
        'address',
        'correct-input',
        'Receiver context uses a different network.',
      );
    }
    return run(owned.signal, () => {
      const result = bound.codec.selectViewingReceiver(
        bound.definition.parameters.bytes,
        address.encoded,
        owned.pool,
        context.targetHeight,
        context.branchId,
      );
      return {
        ...result,
        bytes: ownBytes(
          result.bytes,
          invalidArgument,
          () => failure('RESOURCE_LIMIT', 'address', 'configure', 'Receiver exceeds limit.'),
        ),
      };
    });
  },
});
