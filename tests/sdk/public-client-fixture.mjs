import {scalar,bytesField,concat} from '../clients/light-chain-reads-fixtures.mjs';
import { genesis, blockOne } from '../clients/public-chain-reads-fixtures.mjs';
import { address, networkDefinition } from './light-client-fixture.mjs';
export function publicResponse(call, vector, mode='good') {
  if(call.method==='getblockheader') {const block=call.params[0]==='0'||call.params[0]===genesis.verbose.hash?genesis:blockOne;return {result:call.params[1]?block.verbose:block.raw};}
  if(call.method==='getblockchaininfo')return {result:{blocks:1,bestblockhash:blockOne.verbose.hash}};
  if(call.method==='getblock')return {result:{...blockOne.verbose,nTx:1,tx:[vector.display]}};
  if(call.method==='getrawtransaction')return mode==='absent'?{error:{code:-5,message:'private-fixture'}}:{result:{txid:vector.display,hex:vector.hex,in_active_chain:true,height:1,blockhash:blockOne.verbose.hash,confirmations:1}};
  if(call.method==='getaddressutxos')return {result:{hash:blockOne.verbose.hash,height:1,utxos:[{address,txid:vector.display,outputIndex:0,satoshis:42,height:1,script:'76a914'+'00'.repeat(20)+'88ac'}]}};
  if(call.method==='z_gettreestate')return {result:{hash:blockOne.verbose.hash,height:1,time:blockOne.verbose.time,sapling:{commitments:{finalState:'000000'}},orchard:{commitments:{finalState:'000000'}},ironwood:{commitments:{finalState:'000000'}}}};
  if(call.method==='z_getsubtreesbyindex')return {result:{pool:'sapling',start_index:0,subtrees:[{root:'01'.repeat(32),end_height:1}]}};
  if(call.method==='sendrawtransaction') {if(call.params[0]!==vector.hex)throw Error('exact submission bytes');return {result:vector.display};}
  throw Error('unexpected public method');
}
export async function publicClientChecks(api, makeTransport, vector, waitForDispatch) {
  const check=(value,label)=>{if(!value)throw Error(label);};
  const network=await api.defineNetwork({...networkDefinition(),genesisHash:genesis.verbose.hash});
  const make=(mode='good')=>api.createPublicClient({network,transport:makeTransport(mode),observation:{pollIntervalMs:10,maxBufferedUpdates:4}});
  const client=make();
  check((await client.getTip()).height===1,'tip');
  check((await client.getBlock({height:1})).txids[0]===vector.display,'block');
  check((await client.getBlockHeader({height:1})).point.hash===blockOne.verbose.hash,'header');
  check((await client.getTransaction({txid:vector.display})).raw.length===vector.hex.length/2,'transaction');
  check((await client.getTransactionStatus({txid:vector.display})).inclusion.confirmations===1,'status');
  check((await client.getUtxos({addresses:[address]})).items[0].value===42n,'UTXO');
  const tree=await client.getTreeState({height:1});
  // All three tree strings are encoded by native prost, including legacy Orchard tag 6.
  const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
  const encoded=concat(text(1,'main'),scalar(2,1),text(3,blockOne.verbose.hash),scalar(4,blockOne.verbose.time),text(5,'000000'),text(6,'000000'),text(7,'000000'));
  check(tree.sapling.length===3&&tree.ironwood.length===3&&tree.encoded.length===encoded.length&&tree.encoded.every((byte,index)=>byte===encoded[index]),'exact native TreeState encoder with Orchard');
  const roots=[];for await(const root of client.getSubtreeRoots({pool:'sapling',startIndex:0n,limit:1}))roots.push(root);
  check(roots.length===1&&roots[0].completingBlock.hash===blockOne.verbose.hash,'subtrees');
  const raw=Uint8Array.from(vector.hex.match(/../g),v=>parseInt(v,16));
  check((await client.broadcastTransaction({bytes:raw})).outcome==='acknowledged','broadcast');
  check((await client.waitForTransaction({txid:vector.display,timeoutMs:1000})).confirmations===1,'wait');
  const watch=client.watchTransaction({txid:vector.display})[Symbol.asyncIterator]();check((await watch.next()).value.state==='mined','watch');await watch.return();
  check(await make('absent').getTransaction({txid:vector.display})===null,'qualified absence');
  const cancel=new AbortController();cancel.signal.addEventListener('abort',e=>e.stopImmediatePropagation());
  const reading=make('read-stall').getTransaction({txid:vector.display,signal:cancel.signal});
  await waitForDispatch('getrawtransaction','read-stall');cancel.signal.dispatchEvent(new Event('abort'));cancel.abort();
  let aborted=false;try{await reading;}catch(e){aborted=e.code==='ABORTED';}check(aborted,'native read abort');
  const sendCancel=new AbortController(),sending=make('send-stall').broadcastTransaction({bytes:raw,signal:sendCancel.signal});
  await waitForDispatch('sendrawtransaction','send-stall');sendCancel.abort();check((await sending).outcome==='unknown','dispatched send uncertainty');
  return {methods:11,cancelled:1,broadcastUnknown:1};
}
