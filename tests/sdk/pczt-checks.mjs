import {fixture} from './pczt-fixture.mjs';
export async function pcztChecks(api){
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const reject=async(promise,code)=>{try{await promise;throw Error('unexpected success');}catch(e){check(api.isZcashError(e)&&e.code===code,`${code}: ${e.code}`);}};
  const bytes=value=>Uint8Array.from(value.match(/../g),byte=>parseInt(byte,16));
  const hex=value=>Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');
  const network=await api.defineNetwork({identity:'pczt-synthetic',genesisHash:fixture.genesis.match(/../g).reverse().join(''),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters)});
  const context={network,targetHeight:fixture.height,branchId:fixture.branch};
  const parse=(value,ctx=context)=>api.pczt.parse({bytes:bytes(value),context:ctx,maxBytes:65536});
  const first=await parse(fixture.pczt),second=await parse(fixture.v2),ironwood=await parse(fixture.ironwood,{network,targetHeight:fixture.ironwoodHeight,branchId:fixture.ironwoodBranch});
  let combined,redacted,wrong;
  try{
    const inspection=await api.pczt.inspect({pczt:first});
    check(inspection.context.network===network&&inspection.context.targetHeight===70&&inspection.transactionVersion===5&&inspection.pcztVersion===1&&inspection.pools.length===0&&inspection.proofsComplete&&inspection.authorizationComplete,'V5 material inspection');
    inspection.context.targetHeight=1;check((await api.pczt.inspect({pczt:first})).context.targetHeight===70,'owned context');
    const v6=await api.pczt.inspect({pczt:ironwood});check(v6.transactionVersion===6&&v6.pools.join(',')==='ironwood'&&!v6.proofsComplete&&!v6.authorizationComplete,'incomplete V6 material');
    const serialized=await api.pczt.serialize({pczt:first});serialized.fill(0);check(hex(await api.pczt.serialize({pczt:first}))===fixture.pczt,'owned serialization');
    combined=await api.pczt.combine({pczts:[first,second]});redacted=await api.pczt.redact({pczt:first,profile:'zakura-signer-full/1'});
    check(hex(await api.pczt.serialize({pczt:redacted}))===fixture.redacted,'exact native Full redaction');
    await reject(parse(fixture.v4),'UNSUPPORTED_VERSION');await reject(parse(fixture.pczt+'00'),'INVALID_PCZT');
    await reject(parse(fixture.ironwoodEarly,{network,targetHeight:60,branchId:fixture.ironwoodEarlyBranch}),'NETWORK_MISMATCH');
    await reject(api.pczt.redact({pczt:first,profile:'unknown'}),'UNSUPPORTED_VERSION');
    wrong=await parse(fixture.pczt,{...context,targetHeight:71});await reject(api.pczt.combine({pczts:[first,wrong]}),'NETWORK_MISMATCH');
    await reject(api.pczt.combine({pczts:[]}),'INVALID_ARGUMENT');
    await reject(api.pczt.parse({bytes:bytes(fixture.pczt),context,maxBytes:1}),'RESOURCE_LIMIT');
    await reject(api.pczt.parse({bytes:bytes(fixture.pczt),context,maxBytes:65536,signal:AbortSignal.abort()}),'ABORTED');
    await reject(api.pczt.serialize({pczt:first,signal:AbortSignal.abort()}),'ABORTED');
    await first.dispose();await first.dispose();await reject(api.pczt.inspect({pczt:first}),'CLOSED');
    check((await api.pczt.serialize({pczt:combined})).length>0&&(await api.pczt.serialize({pczt:redacted})).length>0,'transformed handles independent');
    return {methods:5,v5:true,v6:true,structuralOnly:true,cancelled:2};
  }finally{await first.dispose();await second.dispose();await ironwood.dispose();await combined?.dispose();await redacted?.dispose();await wrong?.dispose();}
}
