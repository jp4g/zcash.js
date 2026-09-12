import type { Network, NetworkDefinition, Op } from '../docs/api/public-api.js';
import { bindNetworkDefinition } from './network-parameters.js';
import { ownBytes } from './clients/owned-plumbing.js';
import { failure, invalidArgument, isZcashError } from './errors.js';

type Codec = typeof import('./runtime/primitive-capsule.mjs');
const networks = new WeakMap<Network, Readonly<{ definition: ReturnType<typeof bindNetworkDefinition>; codec: Codec }>>();
let codec: Promise<Codec> | undefined;
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nodeProcess = (globalThis as { process?: { versions?: { node?: string }; getBuiltinModule(id: string): { types: { isProxy(value: unknown): boolean } } } }).process;
const cancelled = () => failure('ABORTED', 'validation', 'none', 'Network definition aborted.');
const limit = () => failure('RESOURCE_LIMIT', 'validation', 'correct-input', 'Network definition exceeds limit.');

/** Package-owned handle-free codecs: lazy native initialization, no worker or fetch. */
export async function defineNetwork(args: NetworkDefinition & Op): Promise<Network> {
  let input: Record<string, unknown>;
  try {
    if (!args || typeof args !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(args))) throw 0;
    input = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(args)) {
      if (typeof key !== 'string' || !['identity', 'genesisHash', 'parameters', 'parametersFormat', 'signal'].includes(key)) throw 0;
      const field = Object.getOwnPropertyDescriptor(args, key);
      if (!field || !Object.hasOwn(field, 'value')) throw 0;
      input[key] = field.value;
    }
  } catch { throw invalidArgument(); }
  if (typeof input.identity !== 'string') throw invalidArgument();
  if (input.identity.length > 1024) throw limit();
  const parameters = ownBytes(input.parameters as Uint8Array, invalidArgument, limit);
  if (parameters.length > 256) throw limit();
  const definition = bindNetworkDefinition({ identity: input.identity, genesisHash: input.genesisHash as NetworkDefinition['genesisHash'],
    parametersFormat: input.parametersFormat as string, parameters });
  const signal = input.signal;
  if (signal !== undefined) {
    try {
      // getBuiltinModule is available throughout the declared Node engine range.
      if (nodeProcess?.versions?.node && nodeProcess.getBuiltinModule('util').types.isProxy(signal)) throw 0;
      if (aborted.call(signal)) throw cancelled();
    } catch (error) { throw isZcashError(error) ? error : invalidArgument(); }
  }
  let native: Codec;
  try {
    codec ??= import('./runtime/primitive-capsule.mjs');
    native = await codec;
  } catch { throw failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Network codecs unavailable.'); }
  // Cancellation is observed before and after the module-load boundary; synchronous pure native work
  // has no independently running job or handle to abandon.
  if (signal !== undefined && aborted.call(signal)) throw cancelled();
  try { native.initialize(); }
  catch { throw failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Network codecs unavailable.'); }
  try { native.consensusContext(definition.parametersFormat, parameters, 0); }
  catch { throw invalidArgument(); }
  const network = Object.freeze({ identity: definition.identity, genesisHash: definition.genesisHash }) as Network;
  networks.set(network, Object.freeze({ definition, codec: native }));
  return network;
}

/** Internal instance admission; structurally similar user objects are not Networks. */
export function networkBinding(network: Network) {
  const bound = networks.get(network);
  if (!bound) throw invalidArgument();
  return bound;
}
