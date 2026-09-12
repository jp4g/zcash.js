import {fixture,unknownAddress} from './viewing-fixture.mjs';
export async function viewingChecks(api) {
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const reject=async(promise,code)=>{try{await promise;throw Error('unexpected success');}catch(error){check(api.isZcashError(error)&&error.code===code,`${code}: ${error.code}`);}};
  const definition=encoding=>({identity:`viewing-${encoding}`,genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters.replace('regtest',encoding))});
  const network=await api.defineNetwork(definition('regtest'));
  const args={network,format:'ufvk',encoded:fixture.ufvk,enabledPools:['transparent','sapling','ironwood']};
  await reject(api.accountFromViewingKey({...args,signal:AbortSignal.abort()}),'ABORTED');
  const full=await api.accountFromViewingKey(args);let incoming,imported;
  try {
    check(await api.viewing.export({account:full,format:'ufvk',acknowledge:'discloses-viewing-authority'})===fixture.ufvk,'UFVK roundtrip');
    incoming=await api.viewing.toIncoming({account:full});
    const encoded=await api.viewing.export({account:incoming,format:'uivk',acknowledge:'discloses-viewing-authority'});
    check(encoded===fixture.uivk,'native incoming reduction');
    imported=await api.accountFromViewingKey({...args,format:'uivk',encoded});
    await reject(api.viewing.export({account:incoming,format:'ufvk',acknowledge:'discloses-viewing-authority'}),'FULL_VIEWING_KEY_REQUIRED');
    const found=await api.addresses.find({account:full,start:api.diversifierIndex(0n),maxAttempts:100});
    const exact=await api.addresses.derive({account:full,index:found.index});
    check(exact.address===found.address&&exact.address===fixture.address,'exact derivation and bounded find');
    let invalid;
    for(let i=0n;i<100n;i++){try{await api.addresses.derive({account:full,index:api.diversifierIndex(i)});}catch(e){if(e.code!=='INVALID_DIVERSIFIER')throw e;invalid=i;break;}}
    check(invalid!==undefined,'fixture invalid diversifier');
    await reject(api.addresses.find({account:full,start:api.diversifierIndex(invalid),maxAttempts:1}),'ADDRESS_SEARCH_LIMIT');
    check((await api.addresses.find({account:full,start:api.diversifierIndex(invalid),maxAttempts:100})).index>invalid,'bounded search advances');
    const decoded=await api.addresses.decode({network,address:exact.address});
    const context={network,targetHeight:20,branchId:0x76b809bb};
    const selected=await api.addresses.selectReceiver({address:{...decoded},pool:'sapling',context});
    check(selected.type==='sapling'&&selected.bytes.length===43,'native receiver routing');
    // Pinned zcash_protocol BranchId::Nu6_3; synthetic activation height 100.
    for(const [pool,type,length] of [['transparent','p2pkh',20],['ironwood','orchard',43]]) {
      const receiver=await api.addresses.selectReceiver({address:decoded,pool,context:{network,targetHeight:100,branchId:0x37a5165b}});
      check(receiver.type===type&&receiver.bytes.length===length,`${pool} native receiver routing`);
    }
    selected.bytes.fill(0);
    check((await api.addresses.selectReceiver({address:decoded,pool:'sapling',context})).bytes.some(b=>b!==0),'owned receiver bytes');
    await reject(api.addresses.selectReceiver({address:decoded,pool:'ironwood',context}),'UNSUPPORTED_POOL');
    const main=await api.defineNetwork(definition('main'));
    await reject(api.addresses.selectReceiver({address:decoded,pool:'sapling',context:{...context,network:main}}),'NETWORK_MISMATCH');
    const unknown=await api.addresses.decode({network:main,address:unknownAddress});
    check(unknown.unknownTypecodes.includes(65532),'unknown receiver preserved');
    await reject(api.addresses.selectReceiver({address:unknown,pool:'legacyOrchard',context:{...context,network:main}}),'INVALID_ARGUMENT');
    await reject(api.addresses.derive({account:full,index:found.index,signal:AbortSignal.abort()}),'ABORTED');
    await full.viewing.dispose();await full.viewing.dispose();
    await reject(api.addresses.derive({account:full,index:found.index}),'CLOSED');
    check((await api.addresses.derive({account:incoming,index:found.index})).address===exact.address,'incoming survives full disposal');
    await incoming.viewing.dispose();
    check((await api.addresses.derive({account:imported,index:found.index})).address===exact.address,'imported UIVK independent');
    return {operations:7,independentAuthorities:3,cancelled:2,unknownReceivers:true};
  }finally{await full.viewing.dispose();await incoming?.viewing.dispose();await imported?.viewing.dispose();}
}
