import {defineNetwork,pczt,viewing,accountFromViewingKey} from '../../dist/src/index.js';
import {walletAccounts} from '../../dist/src/wallet/accounts.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
import {walletSign} from '../../dist/src/wallet/sign.js';
import {saplingAssets} from '../../dist/src/wallet/proving-assets.js';
import {networkBinding} from '../../dist/src/network.js';
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const check=(ok,label)=>{if(!ok)throw Error(label);};
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);

// Actual worker composition, shared by filesystem and OPFS. Full send is qualified separately.
export async function pcztBuildChecks(open,fixture,definition,provingOrigin) {
  const network=await defineNetwork(definition);
  const namespace=`wallet-proof-${crypto.randomUUID()}`,total=saplingAssets.reduce((n,value)=>n+value.byteLength,0);
  let loads=0;
  const proving={kind:'local',maxConcurrentProofs:1,cache:{kind:'persistent',namespace,maxBytes:total},
    assets:saplingAssets.map(({sha256,blake2b512,...asset})=>({...asset,digest:{algorithm:'sha256',hex:sha256}})),
    async loadAsset({requirement,signal}){loads++;const response=await fetch(new URL(`/proving/${requirement.assetId}`,provingOrigin),{signal,credentials:'omit'});check(response.ok,'canonical asset TLS response');return new Uint8Array(await response.arrayBuffer());}};
  const proofLimits={maxMemoryBytes:1024*1024*1024,maxQueuedBytes:104*1024*1024};
  try {
  for(const scope of ['external','internal']) {
    globalThis.walletPhase=`pczt-${scope}`;
    if(globalThis.process?.versions?.node)console.error(JSON.stringify({pcztPhase:globalThis.walletPhase}));
    const data=fixture[scope],wallet=await open(scope),accounts=walletAccounts(wallet,network);
    let signer,reopened,signerAccount,failed=false,accountsClosed=false;
    try {
      const birthday={network,source:'checkpoint',firstScanHeight:data.import.birthday.firstScanHeight,priorTreeState:hex(data.import.birthday.priorTreeState)};
      let created=await accounts.api.import({mnemonic:new TextEncoder().encode(fixture.mnemonic),accountIndex:fixture.accountIndex,birthday});
      signer=created.signer;
      if(scope==='external') {
        const descriptor=await signer.getAccount({network,selector:{kind:'derived',accountIndex:fixture.accountIndex}});
        let key;try{key=await viewing.export({account:descriptor,format:'ufvk',acknowledge:'discloses-viewing-authority'});}finally{await descriptor.viewing.dispose();}
        await accounts.api.remove({accountId:created.account.id,acknowledge:'deletes-local-history'});
        created={...created,account:await accounts.api.import({viewingKey:key,birthday,enabledPools:['transparent','sapling','ironwood']})};
        check(created.account.accountIndex===null,'external signer case uses actual UFVK-imported account');
      }
      let revision=(await wallet.session.scan.plan({target:data.target})).revision;
      for(const batch of data.batches)revision=(await wallet.session.scan.ingest({...batch,revision,target:data.target,priorTreeState:hex(batch.priorTreeState),blocks:batch.blocks.map(hex)})).revision;
      const destination=await wallet.session.addresses.next({accountId:created.account.id,request:{format:'transparent'}});
      const ironwood=provingOrigin&&scope==='internal'?await wallet.session.addresses.next({accountId:created.account.id,
        request:{format:'unified',transparent:'omit',sapling:'omit',ironwood:'require'}}):undefined;
      const proposals=new WalletProposals(wallet.session,network);
      const proposal=await proposals.create({revision:(await wallet.session.scan.state()).revision,accountId:created.account.id,
        payments:[{to:destination.address,amount:10000n},...(ironwood?[{to:ironwood.address,amount:10000n}]:[])],
        policy:{spendPools:['sapling'],transparent:'disallow',changePool:provingOrigin&&scope==='internal'?'ironwood':'sapling',feeRule:'zip317-standard',confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:false},expiry:{kind:'offset',blocks:40},lockExpiryBlocks:20}});
      check(proposal.steps[0].outputs.some(output=>output.kind==='change'&&output.address===null),'proposal defers exact change address');
      const artifact=await proposals.build({proposal}),retained=await wallet.session.pczt.get({operationId:proposal.operationId});
      check(artifact.outputs.some(output=>output.kind==='change'&&typeof output.address==='string'),'native build resolves owned change');
      check(artifact.outputs.some(output=>output.kind==='payment'&&output.address===destination.address&&output.amount===10000n),'built recipient remains exact');
      if(ironwood)check(artifact.outputs.some(output=>output.kind==='payment'&&output.pool==='ironwood'&&output.address===ironwood.address&&output.amount===10000n),'built Ironwood recipient remains exact');
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
      if(provingOrigin){
        try{await new WalletProposals(wallet.session,network,proving).prove({pczt:artifact});throw Error('missing queue admission');}
        catch(error){check(error.code==='RESOURCE_LIMIT'&&loads===(scope==='external'?0:2),'proof queue bound precedes asset callback');}
      }
      let authorization;
      if(scope==='internal') {
        const signed=await walletSign(proposals,wallet.session,accounts)({pczt:artifact,signer});
        check(signed.authorizationComplete&&!signed.proofsComplete,'wallet sign persists native authorization');
        authorization={pczt:(await wallet.session.pczt.get({operationId:signed.operationId,artifactId:signed.artifactId})).bytes};
      }
      accountsClosed=true;await accounts.close();
      const capability=await signer.getCapabilities();
      if(scope==='external')signerAccount=await signer.getAccount({network,selector:{kind:'derived',accountIndex:fixture.accountIndex}});
      authorization??=await signer.authorize({requestId:`built-${scope}`,pczt:retained.bytes,context:proposal.context,accountIds:proposal.accountIds,capabilityRevision:capability.revision,reviewCommitment:proposal.reviewCommitment});
      const parsed=await pczt.parse({bytes:authorization.pczt,context:proposal.context,maxBytes:65536});
      try {const inspection=await pczt.inspect({pczt:parsed});check(inspection.authorizationComplete&&!inspection.proofsComplete,'built PCZT signed after wallet close');}
      finally {await parsed.dispose();}
      await signer.dispose();
      if(provingOrigin&&scope==='external'){
        const limited=await open(scope,{...proofLimits,maxMemoryBytes:640*1024*1024});
        try{const api=new WalletProposals(limited.session,network,proving),existing=await api.restore({operationId:proposal.operationId});
          const owned=await api.build({proposal:existing});
          try{await api.prove({pczt:owned});throw Error('missing proof memory admission');}
          catch(error){check(error.code==='RESOURCE_LIMIT'&&loads===0,'proof working-memory bound precedes asset callback');}
        }finally{await limited.close();}
      }
      reopened=await open(scope,provingOrigin?proofLimits:undefined);
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
          async getAccount({selector}){
            const key=await viewing.export({account:signerAccount,format:'ufvk',acknowledge:'discloses-viewing-authority'});
            const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('');
            check(selector.kind==='fingerprint'&&selector.fingerprint===fingerprint,'external adapter receives canonical UFVK fingerprint');
            return accountFromViewingKey({network,format:'ufvk',encoded:key,enabledPools:['transparent','sapling','ironwood']});
          },
          async authorize(request){authorizations++;check(!new TextDecoder().decode(request.pczt).includes('zcash_client_backend:proposal_info'),'custom signer receives redacted view');return {requestId:request.requestId,pczt:authorization.pczt};},
        };
        const attached=walletAccounts(reopened,network);
        const binding=await attached.api.attachSigner({accountId:created.account.id,signer:adapter});
        const signed=await walletSign(imports,reopened.session,attached)({pczt:unsigned});
        await binding.dispose();
        check(authorizations===1&&signed.artifactId===imported.artifactId,'captured custom signer contribution is checked and retained');
      }
      let proved,finalized;
      if(provingOrigin){
        const cancelled=new AbortController();
        const cancelledApi=new WalletProposals(reopened.session,network,{...proving,cache:{...proving.cache,namespace:namespace+'-cancel'},
          loadAsset(){cancelled.abort();return new Promise(()=>{});}});
        try{await cancelledApi.prove({pczt:imported,signal:cancelled.signal});throw Error('missing asset-load cancellation');}
        catch(error){check(error.code==='ABORTED','asset-load cancellation leaves owner usable');}
        const proofApi=new WalletProposals(reopened.session,network,proving);
        globalThis.walletPhase=`native-proof-${scope}`;
        proved=await proofApi.prove({pczt:imported});
        check(proved.proofsComplete&&proved.authorizationComplete&&proved.artifactId!==imported.artifactId,'real native proof retains signed artifact version');
        const proof=await reopened.session.pczt.get({operationId,artifactId:proved.artifactId});
        const inspected=await pczt.parse({bytes:proof.bytes,context:proposal.context,maxBytes:65536});
        try{const info=await pczt.inspect({pczt:inspected});check(info.proofsComplete&&info.authorizationComplete,'native serialized proof state');
          check(info.pools.includes('sapling')&&(scope!=='internal'||info.pools.includes('ironwood')),'nonempty native proof pools');}
        finally{await inspected.dispose();}
        const count=loads;
        check((await proofApi.prove({pczt:proved})).artifactId===proved.artifactId&&loads===count,'already proven artifact loads no assets');
        check(loads===2,'persistent parameter cache reused across independent owners');
        globalThis.walletPhase=`native-finalize-${scope}`;
        finalized=await proofApi.finalize({pczt:proved});
        const decoded=networkBinding(network).codec.decodeTransaction(finalized.bytes,proposal.context.branchId);
        check(decoded.display===finalized.txid,'native finalized bytes match transaction identity');
        const stored=finalized.bytes.slice(),beforeFinalizeLoads=loads;
        const repeated=await new WalletProposals(reopened.session,network).finalize({pczt:proved});
        check(repeated.txid===finalized.txid&&equal(repeated.bytes,stored)&&loads===beforeFinalizeLoads,'finalization retry returns exact bytes without proving assets');
        repeated.bytes.fill(0);
        check(equal((await reopened.session.pczt.finalized({operationId})).transactions[0].bytes,stored),'caller bytes cannot mutate finalized outbox');
        proved={artifact:proved,bytes:proof.bytes};
      }
      const closing=reopened;reopened=undefined;await closing.close();reopened=await open(scope,provingOrigin?proofLimits:undefined);
      const discovered=await reopened.session.proposals.list({afterSequence:'0',limit:200});
      check(discovered.items.length===1,'reopen discovers signed operation without saved ID');
      const latest=await reopened.session.pczt.get({operationId:discovered.items[0].operationId});
      check(latest.artifactId===(proved?.artifact.artifactId??imported.artifactId)&&latest.authorizationComplete&&equal(latest.bytes,proved?.bytes??signed.bytes),'latest artifact bytes survive new owner');
      if(proved){const previous=await reopened.session.pczt.get({operationId,artifactId:imported.artifactId});check(equal(previous.bytes,signed.bytes)&&!previous.proofsComplete,'proving preserves preceding signed version');}
      if(finalized){
        const stored=(await reopened.session.pczt.finalized({operationId:discovered.items[0].operationId})).transactions[0];
        check(stored.txid===finalized.txid&&stored.exactBytesSha256===finalized.exactBytesSha256&&equal(stored.bytes,finalized.bytes),'ID-free reopen finds exact finalized bytes');
      }
      const original=await reopened.session.pczt.get({operationId:discovered.items[0].operationId,artifactId:artifact.artifactId});
      check(equal(original.bytes,retained.bytes)&&!original.authorizationComplete,'old artifact identity still resolves original unsigned bytes');
    } catch(error) {
      failed=true;console.error('PCZT workflow failed',globalThis.walletPhase,error);throw error;
    } finally {
      let cleanupError;
      for(const close of [()=>signerAccount?.viewing.dispose(),()=>signer?.dispose(),()=>reopened?.close(),()=>accountsClosed?undefined:accounts.close()]){
        try{await close();}catch(error){console.error('PCZT cleanup failed',globalThis.walletPhase,error);cleanupError??=error;}
      }
      if(!failed&&cleanupError)throw cleanupError;
    }
  }
  }finally{
    if(provingOrigin){
      for(const value of [namespace,namespace+'-cancel']){
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
        const name='zakura-proving-'+hash,fs=globalThis.process?.getBuiltinModule?.('fs/promises');
        if(fs){const os=process.getBuiltinModule('os'),path=process.getBuiltinModule('path'),directory=path.join(os.homedir(),'.cache','zakura',name);await fs.rm(directory,{recursive:true,force:true});check(!await fs.stat(directory).catch(()=>null),'proof filesystem cache cleanup');}
        else {await caches.delete(name);check(!(await caches.keys()).includes(name),'proof CacheStorage cleanup');}
      }
    }
  }
}
