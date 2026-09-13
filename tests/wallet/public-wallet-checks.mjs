import {createWalletClient,defineNetwork} from '../../dist/src/index.js';
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const check=(ok,label)=>{if(!ok)throw Error(label);};

// Shared Node FS / Firefox OPFS workflow. Funding is native-emitted synthetic state;
// this does not claim public synchronization of the compact-only funding fixture.
// options(name) supplies the existing qualified runtime/storage and actual light route;
// seed(name,bytes) uses the existing closed-database fixture staging. submitted() returns
// immutable {txid,hex} records from the existing synthetic transport's actual dispatches.
export async function publicWalletChecks(options,seed,fixture,definition,submitted) {
  const network=await defineNetwork(definition),data=fixture.publicWallet;
  const confirmations={trusted:1,untrusted:1,allowZeroConfirmationShielding:false};
  const observation={pollIntervalMs:1000,maxBufferedUpdates:16};
  const common={network,confirmations,observation};
  for(const mode of ['transfer','shield','tex']) {
    const name=`public-${mode}`;
    await seed(name,hex(data.database));
    let authorityWallet,wallet,signer;
    try {
      authorityWallet=await createWalletClient({...options(`${name}-authority`),...common,storage:{kind:'memory'},recovery:{mode:'offline'}});
      const imported=await authorityWallet.accounts.import({mnemonic:new TextEncoder().encode(fixture.mnemonic),accountIndex:fixture.accountIndex,
        birthday:{network,source:'checkpoint',firstScanHeight:fixture.external.import.birthday.firstScanHeight,priorTreeState:hex(fixture.external.import.birthday.priorTreeState)}});
      signer=imported.signer;await authorityWallet.close();authorityWallet=undefined;
      const configured={...options(name),...common,transactionPolicy:{spendPools:mode==='shield'?['transparent']:['sapling'],transparent:mode==='shield'?'allow-owned':'disallow',changePool:'sapling',feeRule:'zip317-standard',confirmations,expiry:{kind:'offset',blocks:40},lockExpiryBlocks:20,shieldingThreshold:10000n,freshness:{mode:'require-synced',maxLagBlocks:0}}};
      wallet=await createWalletClient(configured);
      check((await wallet.accounts.list()).some(account=>account.id===data.accountId),'public native-funded account discovery');
      await wallet.accounts.attachSigner({accountId:data.accountId,signer});
      const destination=mode==='tex'?data.tex:(await wallet.addresses.next({accountId:data.accountId,request:{format:'transparent'}})).address;
      const intent=mode==='shield'?{accountId:data.accountId,toPool:'sapling',threshold:10000n,idempotencyKey:`public-${mode}`}:{accountId:data.accountId,to:destination,amount:10000n,idempotencyKey:`public-${mode}`};
      const before=submitted().length;
      const pending=await (mode==='shield'?wallet.shield(intent):wallet.send(intent));
      const first=await pending.snapshot(),expected=mode==='tex'?2:1;
      check(first.steps.length===expected&&first.steps.every(step=>step.txid!==null&&step.exactBytesSha256!==null),'public local execution persists every native transaction');
      check(first.steps.every(step=>step.attempts.length===1&&step.attempts[0].outcome==='acknowledged'),'public initial dispatch accounts for every step');
      if(mode==='tex')check(first.steps[1].dependsOn.length===1&&first.steps[1].dependsOn[0]===0,'real native TEX dependency');
      const original=submitted().slice(before);
      check(original.length===expected&&original.every((row,index)=>row.txid===first.steps[index].txid),'native transaction bytes dispatched in parent order');
      await signer.dispose();signer=undefined;
      const retry=await (mode==='shield'?wallet.shield(intent):wallet.send(intent));
      check(retry.operationId===pending.operationId,'idempotent send needs no disposed signer or rebuilt transaction');
      check(submitted().slice(before).every(row=>original.some(saved=>saved.txid===row.txid&&saved.hex===row.hex)),'retries preserve exact native bytes');
      await wallet.close();wallet=undefined;
      // Discover from the authoritative database, without an application-saved ID.
      const sentBeforeOpen=submitted().length;
      const {proving,...withoutProving}=configured;wallet=await createWalletClient({...withoutProving,recovery:{mode:'offline'}});
      check(submitted().length===sentBeforeOpen,'offline reopen never submits');
      const page=await wallet.operations.list({limit:1});
      check(page.items.length===1&&page.nextCursor===null,'public operation inventory survives new owner');
      const restored=await wallet.operations.resume({operationId:page.items[0].operationId});
      const state=await restored.snapshot();
      check(state.steps.length===expected&&state.steps.every((step,index)=>step.txid===original[index].txid&&step.exactBytesSha256===first.steps[index].exactBytesSha256),'all exact transaction identities survive reopen');
      const controller=new AbortController();controller.abort();
      try {await restored.broadcast({signal:controller.signal});throw Error('missing public broadcast cancellation');}catch(error){check(error.code==='ABORTED','public cancellation preserves typed identity');}
      check(submitted().length===sentBeforeOpen,'canceled broadcast never dispatches');
      await restored.broadcast();
      check(submitted().slice(before).every(row=>original.some(saved=>saved.txid===row.txid&&saved.hex===row.hex)),'resumed dispatch uses original bytes without authority or proving');
    }finally{await wallet?.close();await authorityWallet?.close();await signer?.dispose();}
  }
  return {publicWallet:true,localTransfer:true,localShield:true,localTex:true};
}

// Payload handler for the existing native gRPC / gRPC-Web test servers. Framing,
// TLS and status delivery stay with those servers; status 5 is real NOT_FOUND.
export async function publicWalletResponses(fixture,definition) {
  const {initialize:wire}=await import('../../dist/src/runtime/lightwire-capsule.mjs');
  const native=await import('../../dist/src/runtime/primitive-capsule.mjs');
  const {scalar,bytesField,concat}=await import('../clients/light-chain-reads-fixtures.mjs');
  native.initialize();const codec=wire(),target=fixture.publicWallet.target;
  const branch=native.consensusContext(definition.parametersFormat,definition.parameters,target.height).branchId;
  const encoded=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
  const request=(method,input)=>encoded(codec.encodeRequest(method,JSON.stringify(input)));
  const sent=[],known=new Map();
  return {submitted:()=>sent.map(row=>({...row})),response(method,payload){
    const key=encoded(payload);
    if(method==='GetLightdInfo')return {payload:concat(text(1,'fixture'),text(2,'synthetic'),text(4,'regtest'),scalar(5,20),text(6,branch.toString(16).padStart(8,'0')),scalar(7,target.height),text(18,'v0.5.0'))};
    if(method==='GetLatestBlock')return {payload:concat(scalar(1,target.height),bytesField(2,hex(target.hash).reverse()))};
    if(method==='GetTreeState') {
      const genesis=key===request(method,{hash:definition.genesisHash});
      check(genesis||key===request(method,{height:String(target.height)}),'known public wallet tree request');
      return {payload:concat(text(1,'regtest'),scalar(2,genesis?0:target.height),text(3,genesis?definition.genesisHash:target.hash),text(5,'000000'),text(6,'000000'),text(7,'000000'))};
    }
    if(method==='SendTransaction') {
      const dto=codec.decodeResponse('GetTransaction',payload),raw=hex(dto.data);
      const tx=native.decodeTransaction(raw,branch),row={txid:tx.display,hex:encoded(raw)};
      sent.push(row);known.set(request('GetTransaction',{hash:encoded(tx.txid)}),raw);
      return {payload:text(2,JSON.stringify(tx.display))};
    }
    if(method==='GetTransaction') {
      const raw=known.get(key);return raw?{payload:concat(bytesField(1,raw),scalar(2,0))}:{status:5};
    }
    throw Error(`unexpected public wallet fixture method ${method}`);
  }};
}
