// Shared synthetic wire responses and public API checks; no private SDK imports.
import {scalar,bytesField,concat,tipBytes,blockBytes} from '../clients/light-chain-reads-fixtures.mjs';
const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
export const address='t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs';
export const methods=['GetLatestBlock','GetLightdInfo','GetTreeState','GetTaddressBalance','GetAddressUtxos','GetTransaction','GetBlockRange','GetSubtreeRoots','GetTaddressTransactions','GetMempoolStream','SendTransaction'];
export const networkDefinition=()=>({identity:'synthetic',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode('{"encoding":"main","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}')});
export function fixtureResponses(vector) {
  const raw=Uint8Array.from(vector.hex.match(/../g),v=>parseInt(v,16));
  const transaction=height=>concat(bytesField(1,raw),scalar(2,height));
  return {raw,response(method,request){
    switch(method) {
      case 'GetLightdInfo':return concat(text(1,'fixture'),text(2,'synthetic'),text(4,'main'),scalar(5,20),text(6,'76b809bb'),scalar(7,20),text(18,'v0.5.0'));
      case 'GetTreeState':return concat(text(1,'main'),text(3,'03'.repeat(32)));
      case 'GetLatestBlock':return tipBytes(20);
      case 'GetTransaction':case 'GetTaddressTransactions':return transaction(20);
      case 'GetMempoolStream':return transaction(0);
      case 'GetTaddressBalance':return scalar(1,42);
      case 'GetAddressUtxos':return new Uint8Array();
      case 'SendTransaction':return text(2,JSON.stringify(vector.display));
      case 'GetBlockRange':return Array.from(request??[]).join(',')==='10,2,8,1,18,2,8,1'?blockBytes(1,undefined,new Uint8Array(32).fill(3)):blockBytes(20);
      case 'GetSubtreeRoots':return concat(bytesField(2,new Uint8Array(32).fill(1)),bytesField(3,new Uint8Array(32).fill(2)),scalar(4,20));
      default:throw Error('unexpected fixture method');
    }
  }};
}
export async function lightClientChecks(api,makeTransport,vector,waitForDispatch) {
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const network=await api.defineNetwork(networkDefinition());
  const client=api.createLightClient({network,transport:makeTransport()});
  const {raw}=fixtureResponses(vector);
  check((await client.getTip()).height===20,'tip');
  check((await client.getServerInfo()).networkIdentity==='synthetic','server info');
  check((await client.getTreeState({height:0})).point.hash===network.genesisHash,'tree state');
  check((await client.getAddressBalance({addresses:[address]})).value===42n,'address balance');
  check((await client.getAddressUtxos({addresses:[address]})).items.length===0,'utxos');
  check((await client.getTransaction({txid:vector.display})).observation.inclusion.height===20,'transaction');
  for(const stream of [client.streamCompactBlocks({fromHeight:20,toHeight:20}),client.getSubtreeRoots({pool:'sapling',startIndex:0n,limit:1}),client.streamAddressTransactions({address,fromHeight:20,toHeight:20}),client.streamMempool()]) {
    const items=[];for await(const item of stream)items.push(item);check(items.length===1,'stream item');
  }
  check((await client.broadcastTransaction({bytes:raw})).outcome==='acknowledged','send acknowledgement');
  const cancelled=async(promise)=>{try{await promise;throw Error('expected abort');}catch(error){check(api.isZcashError(error)&&error.code==='ABORTED','abort identity');}};
  const stopped=mode=>api.createLightClient({network,transport:makeTransport(mode)});
  const controller=new AbortController(),read=stopped('read-stall').getTip({signal:controller.signal});
  await waitForDispatch('GetLatestBlock','read-stall');controller.abort();await cancelled(read);
  const stream=stopped('stream-stall').streamCompactBlocks({fromHeight:20,toHeight:20});
  const next=stream.next();const rejection=cancelled(next);
  await waitForDispatch('GetBlockRange','stream-stall');await stream.return();await rejection;
  check((await stream.next()).done,'stream closed');
  const stop=new AbortController(),send=stopped('send-stall').broadcastTransaction({bytes:raw,signal:stop.signal});
  await waitForDispatch('SendTransaction','send-stall');stop.abort();
  check((await send).outcome==='unknown','send cancellation uncertainty');
  return {methods:methods.length,cancelled:2,broadcastUnknown:1};
}
