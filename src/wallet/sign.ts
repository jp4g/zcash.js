import type { WalletClient, Signer } from '../../docs/api/public-api.js';
import type { openWalletRuntime } from '../runtime/wallet.js';
import type { walletAccounts } from './accounts.js';
import { WalletProposals, pcztArtifactBinding } from './proposals.js';
import { memorySignerAuthority } from './memory-signer.js';
import { boundedSigner } from '../signer.js';
import { snapshot } from '../clients/owned-plumbing.js';
import { operation } from '../clients/light-chain-reads.js';
import { pczt } from '../pczt.js';
import { viewing } from '../viewing.js';
import { failure } from '../errors.js';

type Session=Awaited<ReturnType<typeof openWalletRuntime>>['session'];
const mismatch=()=>failure('SIGNER_CAPABILITY_MISMATCH','authorization','reattach-signer','Signer cannot satisfy the retained transaction.');
/** Public sign shape composed with the existing account and native artifact owners. */
export function walletSign(proposals:WalletProposals,session:Session,accounts:Pick<ReturnType<typeof walletAccounts>,'attachedSigner'>):WalletClient['sign'] {
  return async args=>{
    const input=snapshot(args,['pczt','signer','signal']),binding=pcztArtifactBinding(input.pczt,session),pending=operation(input.signal);
    try {
      pending.check();session.check();
      const proposal=await proposals.restore({operationId:binding.operationId,signal:pending.signal});
      if(!proposal)throw failure('OPERATION_NOT_FOUND','authorization','correct-input','Operation does not exist.');
      if(proposal.steps.length!==1)throw failure('PCZT_MULTI_STEP_UNSUPPORTED','authorization','correct-input','PCZT signing requires one step.');
      const accountId=proposal.accountIds[0];
      const authority:Signer|undefined=input.signer??accounts.attachedSigner(accountId);
      if(!authority)throw failure('SIGNER_REQUIRED','authorization','reattach-signer','A signer is required.');
      const signer=boundedSigner(authority,session.pczt.maximum),capabilities=await signer.getCapabilities({signal:pending.signal});
      if(!capabilities.networks.includes(proposal.context.network.identity))throw mismatch();
      const retained=await session.pczt.get({...binding,signal:pending.signal});
      if(!retained||retained.accountId!==accountId||retained.artifactId!==binding.artifactId||retained.operationId!==binding.operationId)throw mismatch();
      const handle=await pczt.parse({bytes:retained.bytes,context:proposal.context,maxBytes:session.pczt.maximum,signal:pending.signal});
      const native=memorySignerAuthority(authority);
      try {
        const info=await pczt.inspect({pczt:handle,signal:pending.signal});
        const profile=native?'zakura-native-role-input/1':'zakura-signer-full/1';
        for(const pool of info.pools) {
          const circuit=pool==='sapling'?'sapling-groth16/1':pool==='ironwood'?'ironwood-post-nu6_3/1':undefined;
          if(!capabilities.authorizations.some(role=>role.pool===pool&&role.txVersion===info.transactionVersion
            &&role.branchIds.includes(proposal.context.branchId)&&role.pcztVersions.includes(info.pcztVersion)
            &&(circuit===undefined?role.circuitVersions.length===0:role.circuitVersions.includes(circuit))
            &&(role.proofState!=='required'||info.proofsComplete)&&role.requiredFields.every(field=>field===profile)))throw mismatch();
        }
        // Account IDs are hints; native viewing-key correspondence gates disclosure.
        if(native){
          const description=await native.describe();
          if(await session.accounts.checkKey({accountId,viewingKey:description.viewingKey,signal:pending.signal})!=='ready')throw mismatch();
        }else{
          const account=await session.accounts.get({accountId,signal:pending.signal});
          if(!account||account.accountIndex===null||!capabilities.exportableViewing.includes('ufvk'))throw mismatch();
          const descriptor=await signer.getAccount({network:proposal.context.network,selector:{kind:'derived',accountIndex:account.accountIndex},signal:pending.signal});
          try {
            const key=await viewing.export({account:descriptor,format:'ufvk',acknowledge:'discloses-viewing-authority',signal:pending.signal});
            if(await session.accounts.checkKey({accountId,viewingKey:key,signal:pending.signal})!=='ready')throw mismatch();
          }finally{await descriptor.viewing.dispose();}
        }
        const bytes=native?retained.bytes:(await proposals.export({pczt:input.pczt,signal:pending.signal})).bytes;
        const maximum=Math.min(session.pczt.maximum,capabilities.maxPcztBytes);
        if(bytes.length>maximum)throw failure('RESOURCE_LIMIT','authorization','configure','Signer PCZT exceeds limit.');
        pending.check();session.check();
        const result=await boundedSigner(signer,maximum).authorize({requestId:binding.artifactId,pczt:bytes,context:proposal.context,
          accountIds:proposal.accountIds,capabilityRevision:capabilities.revision,reviewCommitment:proposal.reviewCommitment,signal:pending.signal});
        pending.check();session.check();
        return await proposals.import({operationId:binding.operationId,bytes:result.pczt,signal:pending.signal});
      }finally{await handle.dispose();}
    }finally{pending.close();}
  };
}
