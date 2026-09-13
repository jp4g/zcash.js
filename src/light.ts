import type { CustomLightTransport, GrpcTransport, LightClient, Network, Op } from '../docs/api/public-api.js';
import { networkBinding } from './network.js';
import { grpcAdapter, grpcBinding } from './grpc.js';
import { failure, invalidArgument, isZcashError } from './errors.js';
import { snapshot } from './clients/owned-plumbing.js';
import { ownCustomLightTransport } from './clients/custom-light.js';
import * as chain from './clients/light-chain-reads.js';
import * as transactions from './clients/light-transaction-reads.js';
import * as transparent from './clients/light-transparent-reads.js';
import { readLightdInfo } from './clients/light-server-observation.js';

const clients=new WeakMap<LightClient,Readonly<{network:Network;endpoint:string|null}>>();
/** Unknown custom transports have no qualified durable route identity. */
export const lightClientBinding=(client:LightClient)=>clients.get(client);

/** Complete light-client composition; no connection or native initialization at construction. */
export function createLightClient(args: { network: Network; transport: GrpcTransport | CustomLightTransport }): LightClient {
  const input = snapshot(args, ['network', 'transport']);
  const { network } = input;
  const { definition, codec } = networkBinding(network);
  let selected: CustomLightTransport,endpoint:string|null=null;
  try { endpoint=new URL(grpcBinding(input.transport as GrpcTransport).url).href; selected = grpcAdapter(input.transport as GrpcTransport); }
  catch { selected = input.transport as CustomLightTransport; }
  const transport = ownCustomLightTransport(selected);
  const family = definition.parameters.encoding;
  let native: Promise<{ wire: ReturnType<typeof import('./runtime/lightwire-capsule.mjs')['initialize']>;
    address: ReturnType<typeof import('./runtime/transparent-address-capsule.mjs')['initialize']> }> | undefined;
  let verified = false;
  async function ready(signal: AbortSignal) {
    native ??= Promise.all([import('./runtime/lightwire-capsule.mjs'), import('./runtime/transparent-address-capsule.mjs')])
      .then(([wire, address]) => ({ wire: wire.initialize(), address: address.initialize() }));
    let value: Awaited<NonNullable<typeof native>>;
    try { value = await native; }
    catch { throw failure('RUNTIME_UNAVAILABLE', 'runtime', 'configure', 'Light codecs unavailable.'); }
    signal.throwIfAborted();
    if (!verified) {
      const info = await readLightdInfo({ codec: value.wire, transport, sourceId: transport.sourceId }, { signal });
      const branch = codec.consensusContext(definition.parametersFormat, definition.parameters.bytes, info.blockHeight).branchId;
      if (info.chainName !== family || info.saplingActivationHeight !== definition.parameters.heights[1]
        || info.branchId !== branch.toString(16).padStart(8, '0'))
        throw failure('NETWORK_MISMATCH', 'query', 'configure', 'Light server network mismatch.');
      await chain.getTreeState(value.wire, transport, network, family, { hash: network.genesisHash, signal });
      signal.throwIfAborted();
      verified = true;
    }
    return value;
  }
  type Native = Awaited<ReturnType<typeof ready>>;
  function source(value: Native): transactions.LightTransactionSource {
    return { wire: value.wire, transport,
      validateAddress(address) {
        try { return value.address.decode(address, family).canonical; }
        catch { throw invalidArgument(); }
      },
      async decodeTransaction(raw, height) {
        // No mined height is available for mempool/off-chain/submission. Let Rust check the
        // embedded branch against each distinct registered context, including future upgrades.
        const heights = height === null ? [0, ...definition.parameters.heights.filter(h => h !== null)] : [height];
        const branches = new Set(heights.map(at => codec.consensusContext(definition.parametersFormat, definition.parameters.bytes, at).branchId));
        for (const branch of branches) {
          try { return codec.decodeTransaction(raw, branch); } catch { /* Try the next registered native context. */ }
        }
        throw invalidArgument();
      } };
  }
  async function unary<A extends Op, T>(args: A, keys: readonly string[], call: (value: Native, args: A) => Promise<T>, broadcast = false): Promise<T> {
    const owned = snapshot(args, [...keys, 'signal']);
    chain.admit(transport, owned, [...keys, 'signal']);
    const pending = chain.operation(owned.signal);
    try {
      pending.check();
      const value = await pending.wait(ready(pending.signal));
      pending.check();
      // Submission owns the dispatch boundary: cancellation after dispatch is an unknown report.
      if (broadcast) return await call(value, { ...owned, signal: pending.signal });
      const result = await pending.wait(call(value, { ...owned, signal: pending.signal }));
      pending.check();
      return result;
    } finally { pending.close(); }
  }
  function stream<A extends Op, T>(args: A, keys: readonly string[], call: (value: Native, args: A) => AsyncIterable<T>): AsyncIterableIterator<T> {
    const owned = snapshot(args, [...keys, 'signal']);
    chain.admit(transport, owned, [...keys, 'signal']);
    let iterator: AsyncIterator<T> | undefined, finished = false, busy = false;
    let pending: ReturnType<typeof chain.operation> | undefined;
    return {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        if (finished) return { done: true, value: undefined };
        if (busy) throw invalidArgument();
        busy = true;
        try {
          pending ??= chain.operation(owned.signal, () => { void iterator?.return?.().catch(() => {}); });
          pending.check();
          if (!iterator) {
            const value = await pending.wait(ready(pending.signal)); pending.check();
            iterator = call(value, { ...owned, signal: pending.signal })[Symbol.asyncIterator]();
          }
          const result = await pending.wait(iterator.next()); pending.check();
          if (result.done) { finished = true; pending.close(); }
          return result;
        } catch (error) { finished = true; pending?.close(); throw error; }
        finally { busy = false; }
      },
      async return() { finished = true; pending?.cancel(); return { done: true, value: undefined }; },
    };
  }
  const client=Object.freeze({
    network,
    getTip: (args = {}) => unary(args, [], (v, a) => chain.getTip(v.wire, transport, a)),
    getServerInfo: (args = {}) => unary(args, [], async (v, a) => {
      const info = await readLightdInfo({ codec: v.wire, transport, sourceId: transport.sourceId }, a);
      return { networkIdentity: network.identity, vendor: info.vendor, version: info.version,
        protocolRevision: info.protocolRevision, sourceId: info.sourceId, observedAt: info.observedAt };
    }),
    getTreeState: args => unary(args, ['height', 'hash'], (v, a) => chain.getTreeState(v.wire, transport, network, family, a)),
    getAddressUtxos: args => unary(args, ['addresses'], (v, a) => transparent.getAddressUtxos(v.address, v.wire, transport, family, a)),
    getAddressBalance: args => unary(args, ['addresses'], (v, a) => transparent.getAddressBalance(v.address, v.wire, transport, family, a)),
    streamCompactBlocks: args => stream(args, ['fromHeight', 'toHeight'], (v, a) => chain.streamCompactBlocks(v.wire, transport, a)),
    getTransaction: args => unary(args, ['txid'], (v, a) => transactions.getTransaction(source(v), a)),
    getSubtreeRoots: args => stream(args, ['pool', 'startIndex', 'limit'], (v, a) => transactions.getSubtreeRoots(source(v), a)),
    streamAddressTransactions: args => stream(args, ['address', 'fromHeight', 'toHeight'], (v, a) => transactions.streamAddressTransactions(source(v), a)),
    streamMempool: (args = {}) => stream(args, [], (v, a) => transactions.streamMempool(source(v), a)),
    broadcastTransaction: args => unary(args, ['bytes'], (v, a) => transactions.broadcastTransaction(source(v), a), true),
  } satisfies LightClient);
  clients.set(client,Object.freeze({network,endpoint}));return client;
}
