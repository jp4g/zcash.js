import {defineNetwork,pczt} from '../../dist/src/index.js';
import {walletAccounts} from '../../dist/src/wallet/accounts.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
import {walletSign} from '../../dist/src/wallet/sign.js';
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const check=(ok,label)=>{if(!ok)throw Error(label);};
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);

// Actual worker composition, shared by filesystem and OPFS. Full send is qualified separately.
export async function pcztBuildChecks(open,fixture,definition) {
  const network=await defineNetwork(definition);
  for(const scope of ['external','internal']) {
    const data=fixture[scope],wallet=await open(scope),accounts=walletAccounts(wallet,network);
    let signer,reopened,signerAccount;
    try {
      const birthday={network,source:'checkpoint',firstScanHeight:data.import.birthday.firstScanHeight,priorTreeState:hex(data.import.birthday.priorTreeState)};
      const created=await accounts.api.import({mnemonic:new TextEncoder().encode(fixture.mnemonic),accountIndex:fixture.accountIndex,birthday});
      signer=created.signer;
      let revision=(await wallet.session.scan.plan({target:data.target})).revision;
      for(const batch of data.batches)revision=(await wallet.session.scan.ingest({...batch,revision,target:data.target,priorTreeState:hex(batch.priorTreeState),blocks:batch.blocks.map(hex)})).revision;
      const destination=await wallet.session.addresses.next({accountId:created.account.id,request:{format:'transparent'}});
      const proposals=new WalletProposals(wallet.session,network);
      const proposal=await proposals.create({revision:(await wallet.session.scan.state()).revision,accountId:created.account.id,
        payments:[{to:destination.address,amount:10000n}],
        policy:{spendPools:['sapling'],transparent:'disallow',changePool:'sapling',feeRule:'zip317-standard',confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:false},expiry:{kind:'offset',blocks:40},lockExpiryBlocks:20}});
      check(proposal.steps[0].outputs.some(output=>output.kind==='change'&&output.address===null),'proposal defers exact change address');
      const artifact=await proposals.build({proposal}),retained=await wallet.session.pczt.get({operationId:proposal.operationId});
      check(artifact.outputs.some(output=>output.kind==='change'&&typeof output.address==='string'),'native build resolves owned change');
      check(artifact.outputs.some(output=>output.kind==='payment'&&output.address===destination.address&&output.amount===10000n),'built recipient remains exact');
      check((await proposals.build({proposal})).artifactId===artifact.artifactId,'repeated build retains artifact identity');
      check(equal((await wallet.session.pczt.get({operationId:proposal.operationId})).bytes,retained.bytes),'repeated build preserves exact bytes');
      const exchange=await proposals.export(scope==='external'?{pczt:artifact}:{proposal});
      check(exchange.operationId===artifact.operationId&&exchange.artifactId===artifact.artifactId,'export retains operation/artifact association');
      check(exchange.bytes.length<retained.bytes.length&&!new TextDecoder().decode(exchange.bytes).includes('zcash_client_backend:proposal_info'),'export strips retained wallet metadata');
      const exchanged=await pczt.parse({bytes:exchange.bytes,context:proposal.context,maxBytes:65536});
      try {check(!(await pczt.inspect({pczt:exchanged})).authorizationComplete,'serialization does not authorize');}
      finally {await exchanged.dispose();}
      exchange.bytes.fill(0);
      check(equal((await wallet.session.pczt.get({operationId:proposal.operationId})).bytes,retained.bytes),'mutable exchange leaves retained full copy unchanged');
      let authorization;
      if(scope==='internal') {
        const signed=await walletSign(proposals,wallet.session,accounts)({pczt:artifact,signer});
        check(signed.authorizationComplete&&!signed.proofsComplete,'wallet sign persists native authorization');
        authorization={pczt:(await wallet.session.pczt.get({operationId:signed.operationId,artifactId:signed.artifactId})).bytes};
      }
      await accounts.close();
      const capability=await signer.getCapabilities();
      if(scope==='external')signerAccount=await signer.getAccount({network,selector:{kind:'derived',accountIndex:fixture.accountIndex}});
      authorization??=await signer.authorize({requestId:`built-${scope}`,pczt:retained.bytes,context:proposal.context,accountIds:proposal.accountIds,capabilityRevision:capability.revision,reviewCommitment:proposal.reviewCommitment});
      const parsed=await pczt.parse({bytes:authorization.pczt,context:proposal.context,maxBytes:65536});
      try {const inspection=await pczt.inspect({pczt:parsed});check(inspection.authorizationComplete&&!inspection.proofsComplete,'built PCZT signed after wallet close');}
      finally {await parsed.dispose();}
      await signer.dispose();
      reopened=await open(scope);
      const inventory=await reopened.session.proposals.list({afterSequence:'0',limit:200});
      check(inventory.items.length===1,'reopen discovers operation without saved ID');
      const restored=await reopened.session.pczt.get({operationId:inventory.items[0].operationId,artifactId:artifact.artifactId});
      check(restored.artifactId===artifact.artifactId&&equal(restored.bytes,retained.bytes),'reopen retains exact unsigned artifact without rebuild');
      const imports=new WalletProposals(reopened.session,network),operationId=inventory.items[0].operationId;
      if(scope==='external') {
        const controller=new AbortController(),send=MessagePort.prototype.postMessage;
        MessagePort.prototype.postMessage=function(value,...rest){const result=Reflect.apply(send,this,[value,...rest]);if(value?.command==='pczt_import')controller.abort();return result;};
        try {await imports.import({operationId,bytes:authorization.pczt,signal:controller.signal});throw Error('missing dispatched import cancellation');}
        catch(error){check(error.code==='ABORTED'&&reopened.session.completion(error)?.completion==='committed','dispatched import preserves committed receipt');}
        finally {MessagePort.prototype.postMessage=send;}
      }
      const owned=authorization.pczt.slice(),pending=imports.import({operationId,bytes:owned});owned.fill(0);
      const imported=await pending;
      check(imported.artifactId!==artifact.artifactId&&imported.authorizationComplete&&!imported.proofsComplete,'signed artifact retained separately from original');
      const signed=await reopened.session.pczt.get({operationId,artifactId:imported.artifactId});
      const importedRevision=(await reopened.session.scan.state()).revision;
      check((await imports.import({operationId,bytes:authorization.pczt})).artifactId===imported.artifactId,'duplicate signed import reuses artifact identity');
      check((await reopened.session.scan.state()).revision===importedRevision,'duplicate import leaves native revision unchanged');
      if(scope==='external') {
        const proposal=await imports.restore({operationId}),unsigned=await imports.build({proposal});
        let authorizations=0;
        const adapter={
          async getCapabilities(){adapter.authorize=()=>{throw Error('changed adapter method invoked');};return {...capability,authorizations:capability.authorizations.map(role=>({...role,requiredFields:['zakura-signer-full/1'],review:'device'}))};},
          async getAccount(){return signerAccount;},
          async authorize(request){authorizations++;check(!new TextDecoder().decode(request.pczt).includes('zcash_client_backend:proposal_info'),'custom signer receives redacted view');return {requestId:request.requestId,pczt:authorization.pczt};},
        };
        const signed=await walletSign(imports,reopened.session,{attachedSigner(){return adapter;}})({pczt:unsigned});
        check(authorizations===1&&signed.artifactId===imported.artifactId,'captured custom signer contribution is checked and retained');
      }
      await reopened.close();reopened=await open(scope);
      const discovered=await reopened.session.proposals.list({afterSequence:'0',limit:200});
      check(discovered.items.length===1,'reopen discovers signed operation without saved ID');
      const latest=await reopened.session.pczt.get({operationId:discovered.items[0].operationId});
      check(latest.artifactId===imported.artifactId&&latest.authorizationComplete&&equal(latest.bytes,signed.bytes),'signed artifact bytes survive new owner');
      const original=await reopened.session.pczt.get({operationId:discovered.items[0].operationId,artifactId:artifact.artifactId});
      check(equal(original.bytes,retained.bytes)&&!original.authorizationComplete,'old artifact identity still resolves original unsigned bytes');
    } finally {await signerAccount?.viewing.dispose();await signer?.dispose();await reopened?.close();await accounts.close();await wallet.close();}
  }
}
