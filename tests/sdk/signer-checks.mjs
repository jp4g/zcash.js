import {fixture} from './viewing-fixture.mjs';
export async function signerChecks(api) {
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const reject=async(promise,code)=>{try{await promise;throw Error('unexpected success');}catch(e){check(api.isZcashError(e)&&e.code===code,`${code}: ${e.code}`);}};
  const network=await api.defineNetwork({identity:'signer-fixture',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters)});
  const account=await api.accountFromViewingKey({network,format:'ufvk',encoded:fixture.ufvk,enabledPools:['transparent','sapling','ironwood']});
  const advertised={revision:'one',networks:['signer-fixture'],authorizations:[{pool:'sapling',txVersion:5,branchIds:[1],circuitVersions:['fixture'],pcztVersions:[1],proofState:'either',requiredFields:['future-profile-not-negotiated'],review:'application'}],accountDiscovery:'explicit-index',exportableViewing:['ufvk'],maxPcztBytes:8*1024*1024};
  const callbacks=[],reply=new Uint8Array([7,8]);let finish, descriptorReads=0;
  class Adapter {
    count=0;
    async getCapabilities(){this.count++;return advertised;}
    async getAccount(){this.count++;return new Proxy({...account,components:[],enabledPools:[]},{get(target,key,receiver){if(key==='viewing'){descriptorReads++;return {}; }return Reflect.get(target,key,receiver);}});}
    async authorize(request){this.count++;callbacks.push(request);return {requestId:request.requestId,pczt:reply};}
  }
  const adapter=new Adapter(),signer=api.createCustomSigner(adapter);
  check(adapter.count===0,'construction does not call adapter');
  adapter.authorize=()=>{throw Error('captured method replaced');};
  try {
    const capabilities=await signer.getCapabilities();advertised.networks[0]='mutated';
    check(capabilities.networks[0]==='signer-fixture'&&capabilities.maxPcztBytes===8*1024*1024,'owned unmodified advertisement');
    const returned=await signer.getAccount({network,selector:{kind:'derived',accountIndex:api.accountIndex(0)}});
    check(returned.viewing===account.viewing&&returned.components.length===account.components.length&&returned.enabledPools.length===3,'genuine shared handle with native metadata');
    check(descriptorReads===0,'descriptor admission never rereads proxy handle');
    const request={requestId:'request',pczt:new Uint8Array([1,2]),context:{network,targetHeight:100,branchId:1},accountIds:['routing-only'],capabilityRevision:'one',reviewCommitment:'review'};
    const pending=signer.authorize(request);request.pczt.fill(0);request.context.targetHeight=0;request.accountIds[0]='changed';
    const result=await pending;reply.fill(0);
    check(callbacks[0].pczt[0]===1&&callbacks[0].context.targetHeight===100&&callbacks[0].accountIds[0]==='routing-only'&&result.pczt[0]===7,'owned request and contribution bytes');
    await signer.authorize({...request,pczt:new Uint8Array(4*1024*1024+1)});
    check(callbacks[1].pczt.length===4*1024*1024+1,'no invented global PCZT byte ceiling');
    const count=adapter.count;
    await reject(signer.authorize({...request,signal:AbortSignal.abort()}),'ABORTED');check(adapter.count===count,'preabort does not disclose');
    const slow=api.createCustomSigner({getCapabilities:async()=>advertised,getAccount:async({signal})=>{check(!signal.aborted,'real signal supplied');return new Promise(resolve=>{finish=resolve;});},authorize:async()=>{throw Error('secret device failure');}});
    const controller=new AbortController(),late=slow.getAccount({network,selector:{kind:'imported',keyId:'routing'},signal:controller.signal});
    controller.signal.dispatchEvent(new Event('abort'));check(!controller.signal.aborted,'synthetic event is not cancellation');controller.abort();
    await reject(late,'ABORTED');finish(account);await Promise.resolve();
    check(await api.viewing.export({account,format:'ufvk',acknowledge:'discloses-viewing-authority'})===fixture.ufvk,'cancelled adapter result does not destroy shared authority');
    await reject(slow.authorize(request),'SIGNER_REJECTED');
    const mismatch=api.createCustomSigner({getCapabilities:async()=>advertised,getAccount:async()=>({...account,viewing:{...account.viewing}}),authorize:async()=>({requestId:'wrong',pczt:new Uint8Array()})});
    await reject(mismatch.authorize(request),'PROTOCOL_MISMATCH');
    await reject(mismatch.getAccount({network,selector:{kind:'imported',keyId:'routing'}}),'PROTOCOL_MISMATCH');
    let reads=0;const bad={get getCapabilities(){reads++;return()=>advertised;},getAccount(){},authorize(){}};
    try{api.createCustomSigner(bad);throw Error('accessor accepted');}catch(error){check(error.code==='INVALID_ARGUMENT'&&reads===0,'method accessor rejected without invoking');}
    return {methods:3,ownedBytes:true,actualViewing:true,cancelled:2,verifiedAuthorization:false};
  } finally {await account.viewing.dispose();}
}
