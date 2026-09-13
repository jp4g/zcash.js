import type { AccountDescriptor, MemorySigner, Network, Op, Signer, SignerCapabilities } from '../../docs/api/public-api.js';
import { networkBinding } from '../network.js';
import { accountFromViewingKey } from '../viewing.js';
import { accountIndex } from '../primitives.js';
import { operation } from '../clients/light-chain-reads.js';
import { snapshot, ownBytes } from '../clients/owned-plumbing.js';
import { signerCapabilities, signingRequest } from '../signer.js';
import { failure, invalidArgument } from '../errors.js';
import { pczt } from '../pczt.js';
import type { createMnemonicAccount } from './mnemonic.js';

type Authority = Awaited<ReturnType<typeof createMnemonicAccount>>['authority'];
const maximum = 4 * 1024 * 1024;
const mismatch = () => failure('SIGNER_CAPABILITY_MISMATCH','authorization','reattach-signer','Signer cannot satisfy the request.');
const resource = () => failure('RESOURCE_LIMIT','authorization','configure','Signer PCZT exceeds limit.');

/** Compose a complete caller-owned signer from an already retained native authority.
 * Ownership transfers here, including cleanup if native identity admission fails. */
export async function memorySigner(network: Network, authority: Authority): Promise<MemorySigner> {
  let description: Awaited<ReturnType<Authority['describe']>>;
  let capabilities: SignerCapabilities;
  let bound: ReturnType<typeof networkBinding>;
  const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
  let genesis: Uint8Array;
  try {
    bound = networkBinding(network);
    const parameters = hex(bound.definition.parameters.bytes);
    genesis = Uint8Array.from(network.genesisHash.match(/../g)!.reverse(), byte => parseInt(byte,16));
    description = await authority.describe();
    const native = await authority.capabilities();
    if (description.parameters !== parameters || native.parameters !== parameters
      || description.genesis !== hex(genesis) || native.genesis !== hex(genesis)) {
      throw failure('NETWORK_MISMATCH','account','correct-input','Signer network does not match.');
    }
    const { parameters: _parameters, genesis: _genesis, ...roles } = native;
    capabilities = signerCapabilities({...roles,networks:[network.identity]});
    accountIndex(description.accountIndex);
    if (capabilities.maxPcztBytes !== maximum) throw mismatch();
  } catch (error) { await authority.dispose().catch(() => {}); throw error; }
  let disposing: Promise<void> | undefined;
  const check = () => { if (disposing) throw failure('CLOSED','authorization','none','Signer is disposed.'); };
  const sameNetwork = (value: Network) => {
    if (networkBinding(value).definition.binding !== bound.definition.binding) throw failure('NETWORK_MISMATCH','authorization','correct-input','Signer network does not match.');
  };
  return Object.freeze({
    async getCapabilities(args: Op = {}) {
      const input = snapshot(args,['signal']), pending = operation(input.signal);
      try { pending.check(); check(); return signerCapabilities(capabilities); }
      finally { pending.close(); }
    },
    async getAccount(args: Parameters<Signer['getAccount']>[0]) {
      const input = snapshot(args,['network','selector','signal']);
      sameNetwork(input.network);
      const selector = snapshot(input.selector,['kind','accountIndex']);
      if (selector.kind !== 'derived' || accountIndex(selector.accountIndex) !== description.accountIndex) throw mismatch();
      const pending = operation(input.signal);
      let account: AccountDescriptor | undefined;
      try {
        pending.check(); check();
        account = await accountFromViewingKey({network:input.network,format:'ufvk',encoded:description.viewingKey,
          enabledPools:['transparent','sapling','ironwood'],signal:pending.signal});
        pending.check(); check();
        return Object.freeze({...account,provenance:{accountIndex:accountIndex(description.accountIndex),scheme:'zip32-and-bip44' as const}});
      } catch (error) { if (account) await account.viewing.dispose(); throw error; }
      finally { pending.close(); }
    },
    async authorize(args: Parameters<Signer['authorize']>[0]) {
      const {request,signal} = signingRequest(args,maximum);
      sameNetwork(request.context.network);
      if (request.capabilityRevision !== capabilities.revision) throw mismatch();
      const pending = operation(signal);
      try {
        pending.check(); check();
        const handle = await pczt.parse({bytes:request.pczt,context:request.context,maxBytes:maximum,signal:pending.signal});
        try {
          const info = await pczt.inspect({pczt:handle,signal:pending.signal});
          if (info.pools.some(pool => !capabilities.authorizations.some(role => role.pool === pool
            && role.txVersion === info.transactionVersion && role.pcztVersions.includes(info.pcztVersion)
            && role.branchIds.includes(request.context.branchId)))) throw mismatch();
        } finally { await handle.dispose(); }
        pending.check(); check();
        const bytes = await authority.authorize({format:bound.definition.parametersFormat,parameters:bound.definition.parameters.bytes,
          genesis,height:request.context.targetHeight,branch:request.context.branchId,bytes:request.pczt,maximum,signal:pending.signal});
        pending.check(); check();
        // requestId/reviewCommitment are application associations, not native approval tokens.
        // The wallet validates immutable effects and associates returned bytes before accepting them.
        return {requestId:request.requestId,pczt:ownBytes(bytes,invalidArgument,resource,maximum)};
      } finally { pending.close(); }
    },
    dispose() { return disposing ??= authority.dispose(); },
  }) as MemorySigner;
}
