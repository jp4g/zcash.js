import type {Proposal,WalletClient} from '../types.js';
import type {openWalletRuntime} from '../runtime/wallet.js';
import type {walletAccounts} from './accounts.js';
import type {WalletPayments} from './payments.js';
import {WalletProposals,proposalBinding,pcztArtifactBinding} from './proposals.js';
import {memorySignerAuthority} from './memory-signer.js';
import {walletSign,canAuthorize} from './sign.js';
import {boundedSigner} from '../signer.js';
import {pczt} from '../pczt.js';
import {snapshot} from '../clients/owned-plumbing.js';
import {operation} from '../clients/light-chain-reads.js';
import {failure,invalidArgument,isZcashError} from '../errors.js';

/** Choose the existing local fused or explicit PCZT route; native code owns execution. */
export function walletExecute(wallet:Awaited<ReturnType<typeof openWalletRuntime>>,accounts:ReturnType<typeof walletAccounts>,
  proposals:WalletProposals,payments:WalletPayments,propose:WalletClient['propose']):Pick<WalletClient,'send'|'shield'>{
  const sign=walletSign(proposals,wallet.session,accounts);
  async function execute(kind:'send'|'shield',args:Parameters<WalletClient['send']>[0]|Parameters<WalletClient['shield']>[0]){
    const input=snapshot(args,kind==='send'?['proposal','accountId','to','amount','memo','payments','idempotencyKey','maxFee','signer','signal']
      :['accountId','fromAddresses','toPool','threshold','idempotencyKey','maxFee','signer','signal']);
    const {signer,signal,...intent}=input,pending=operation(signal);
    let proposal:Proposal|undefined;
    try{
      pending.check();wallet.session.check();
      if('proposal'in intent){
        if(Object.keys(intent).some(key=>key!=='proposal'))throw invalidArgument();
        proposalBinding(intent.proposal,wallet.session);proposal=intent.proposal;
      }else proposal=await propose({...intent,...(kind==='shield'?{kind:'shield' as const}:{}),signal:pending.signal} as Parameters<WalletClient['propose']>[0]);
      const state=await payments.operations.get({operationId:proposal.operationId,signal:pending.signal});
      if(!state)throw failure('OPERATION_NOT_FOUND','proposal','reopen','Retained operation is unavailable.');
      const finalized=state.steps.length>0&&state.steps.every(step=>step.txid!==null);
      if(!finalized){
        if(state.steps.some(step=>step.txid!==null))throw failure('RECOVERY_REQUIRED','finalization','reopen','Finalized operation is incomplete.');
        const signerForAccount=signer??accounts.attachedSigner(proposal.accountIds[0]);
        if(!signerForAccount)throw failure('SIGNER_REQUIRED','authorization','reattach-signer','A signer is required.');
        const authority=memorySignerAuthority(signerForAccount);
        if(authority)await proposals.execute(wallet,authority,{proposal,signal:pending.signal});
        else{
          if(proposal.steps.length!==1)throw failure('PCZT_MULTI_STEP_UNSUPPORTED','authorization','correct-input','Custom signing requires a single-step proposal.');
          const captured=boundedSigner(signerForAccount,wallet.session.pczt.maximum);
          const capabilities=await captured.getCapabilities({signal:pending.signal});
          let artifact=await proposals.build({proposal,signal:pending.signal});
          const retained=await wallet.session.pczt.get({...pcztArtifactBinding(artifact,wallet.session),signal:pending.signal});
          if(!retained)throw failure('INVALID_PCZT','authorization','reopen','Retained artifact is unavailable.');
          const handle=await pczt.parse({bytes:retained.bytes,context:proposal.context,maxBytes:wallet.session.pczt.maximum,signal:pending.signal});
          let proofFirst:boolean;
          try{
            const info=await pczt.inspect({pczt:handle,signal:pending.signal});
            proofFirst=!canAuthorize(capabilities,info,'zakura-signer-full/1');
            if(proofFirst&&!canAuthorize(capabilities,{...info,proofsComplete:true},'zakura-signer-full/1'))
              throw failure('SIGNER_CAPABILITY_MISMATCH','authorization','reattach-signer','Signer cannot satisfy the retained transaction.');
          }finally{await handle.dispose();}
          if(proofFirst)artifact=await proposals.prove({pczt:artifact,signal:pending.signal});
          artifact=await sign({pczt:artifact,signer:captured,signal:pending.signal});
          if(!artifact.proofsComplete)artifact=await proposals.prove({pczt:artifact,signal:pending.signal});
          await proposals.finalize({pczt:artifact,signal:pending.signal});
        }
      }
      pending.check();return await payments.dispatch({operationId:proposal.operationId,origin:kind,signal:pending.signal});
    }catch(error){
      if(proposal&&isZcashError(error)&&error.operationId===undefined){
        const state=await payments.operations.get({operationId:proposal.operationId}).catch(()=>null);
        const enriched=failure(error.code,error.stage,error.recovery,error.message,error.retryable,error.syncStatus,state??undefined,proposal.operationId);
        const receipt=wallet.session.completion(error);
        if(receipt?.completion==='committed')wallet.session.committed(enriched,receipt.value);
        throw enriched;
      }
      throw error;
    }finally{pending.close();}
  }
  return {send:args=>execute('send',args),shield:args=>execute('shield',args)};
}
