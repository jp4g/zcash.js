import {defineNetwork,pczt} from '../../dist/src/index.js';
import {walletAccounts} from '../../dist/src/wallet/accounts.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const check=(ok,label)=>{if(!ok)throw Error(label);};
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);

// Actual worker composition, shared by filesystem and OPFS. Full send is qualified separately.
export async function pcztBuildChecks(open,fixture,definition) {
  const network=await defineNetwork(definition);
  for(const scope of ['external','internal']) {
    const data=fixture[scope],wallet=await open(scope),accounts=walletAccounts(wallet,network);
    let signer,reopened;
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
      await accounts.close();
      const capability=await signer.getCapabilities();
      const authorization=await signer.authorize({requestId:`built-${scope}`,pczt:retained.bytes,context:proposal.context,accountIds:proposal.accountIds,capabilityRevision:capability.revision,reviewCommitment:proposal.reviewCommitment});
      const parsed=await pczt.parse({bytes:authorization.pczt,context:proposal.context,maxBytes:65536});
      try {const inspection=await pczt.inspect({pczt:parsed});check(inspection.authorizationComplete&&!inspection.proofsComplete,'built PCZT signed after wallet close');}
      finally {await parsed.dispose();}
      await signer.dispose();
      reopened=await open(scope);
      const inventory=await reopened.session.proposals.list({afterSequence:'0',limit:200});
      check(inventory.items.length===1,'reopen discovers operation without saved ID');
      const restored=await reopened.session.pczt.get({operationId:inventory.items[0].operationId});
      check(restored.artifactId===artifact.artifactId&&equal(restored.bytes,retained.bytes),'reopen retains exact unsigned artifact without rebuild');
    } finally {await signer?.dispose();await reopened?.close();await accounts.close();await wallet.close();}
  }
}
