import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicClient } from '../../dist/src/public.js';
import { defineNetwork } from '../../dist/src/network.js';
import { http } from '../../dist/src/http.js';
import { initialize as wire } from '../../dist/src/runtime/lightwire-capsule.mjs';
import { initialize as addressCodec } from '../../dist/src/runtime/transparent-address-capsule.mjs';
import { fixture, result, genesis, blockOne, transportOptions } from '../clients/public-chain-reads-fixtures.mjs';
import { verifiedPacket } from '../clients/public-transaction-reads-packet.mjs';
import { networkDefinition, address } from './light-client-fixture.mjs';
const { vectors } = await verifiedPacket();
const vector = vectors.filter(v=>v.branch===0x76b809bb).sort((a,b)=>a.hex.length-b.hex.length)[0];
const network = await defineNetwork({...networkDefinition(),genesisHash:genesis.verbose.hash});
const observation = {pollIntervalMs:10,maxBufferedUpdates:4};
const rpcError = code => `"error":{"code":${code},"message":"SECRET"}`;

test('complete internal PublicClient composes all eleven methods with native codecs and actual HTTP', async () => {
  let state = 'mined', tipHeight=1, tipHash=blockOne.verbose.hash;
  const server = await fixture(call => {
    if(call.method==='getblockchaininfo') return result({blocks:tipHeight,bestblockhash:tipHash});
    if(call.method==='getblockheader') {
      const block=call.params[0]==='0'||call.params[0]===genesis.verbose.hash?genesis:blockOne;
      return result(call.params[1]?block.verbose:block.raw);
    }
    if(call.method==='getblock') return result({...blockOne.verbose,nTx:1,tx:[vector.display]});
    if(call.method==='getrawtransaction') return state==='absent'?rpcError(-5):result({txid:vector.display,hex:vector.hex,in_active_chain:state==='mined',
      ...(state==='mined'?{height:1,blockhash:blockOne.verbose.hash,confirmations:1}:{})});
    if(call.method==='getaddressutxos') {
      assert.deepEqual(call.params,[{addresses:[address],chainInfo:true}]);
      const decoded=addressCodec().decode(address,'main');
      return result({hash:blockOne.verbose.hash,height:1,utxos:[{address,txid:vector.display,outputIndex:0,satoshis:42,height:1,script:`76a914${Buffer.from(decoded.payload).toString('hex')}88ac`}]});
    }
    if(call.method==='z_gettreestate') return result({hash:blockOne.verbose.hash,height:1,time:blockOne.verbose.time,
      sapling:{commitments:{finalState:'000000'}},orchard:{commitments:{finalState:'000000'}},ironwood:{commitments:{finalState:'000000'}}});
    if(call.method==='z_getsubtreesbyindex') return result({pool:'sapling',start_index:0,subtrees:[{root:'01'.repeat(32),end_height:1}]});
    if(call.method==='sendrawtransaction') { assert.equal(call.params[0],vector.hex); return result(vector.display); }
    throw Error(call.method);
  });
  try {
    const client=createPublicClient({network,transport:http(`${server.origin}/rpc`,transportOptions),observation});
    assert.equal(server.calls.length,0);
    assert.equal((await client.getTip()).height,1);
    assert.equal((await client.getBlock({height:1})).txids[0],vector.display);
    assert.equal((await client.getBlockHeader({height:1})).point.hash,blockOne.verbose.hash);
    assert.equal((await client.getTransaction({txid:vector.display})).raw.length,vector.hex.length/2);
    assert.equal((await client.getTransactionStatus({txid:vector.display})).inclusion.confirmations,1);
    for(const [height,hash]of[[0,genesis.verbose.hash],[1,genesis.verbose.hash]]) {
      tipHeight=height;tipHash=hash;
      assert.equal((await client.getTransactionStatus({txid:vector.display})).state,'unknown');
      await assert.rejects(async()=>{for await(const _ of client.getSubtreeRoots({pool:'sapling',startIndex:0n,limit:1})){}},{code:'PROTOCOL_MISMATCH'});
    }
    tipHeight=1;tipHash=blockOne.verbose.hash;

    assert.equal((await client.getUtxos({addresses:[address]})).items[0].value,42n);
    const tree=await client.getTreeState({height:1});
    assert.equal(wire().decodeResponse('GetTreeState',tree.encoded).orchard_tree,'000000');
    const roots=[];for await(const root of client.getSubtreeRoots({pool:'sapling',startIndex:0n,limit:1}))roots.push(root);
    assert.equal(roots[0].completingBlock.hash,blockOne.verbose.hash);
    assert.equal((await client.broadcastTransaction({bytes:Uint8Array.from(Buffer.from(vector.hex,'hex'))})).outcome,'acknowledged');
    assert.equal((await client.waitForTransaction({txid:vector.display,timeoutMs:1000})).confirmations,1);
    const watch=client.watchTransaction({txid:vector.display})[Symbol.asyncIterator]();
    const initial=(await watch.next()).value;assert.equal(initial.state,'mined');
    initial.inclusion.blockHash='ab'.repeat(32);initial.inclusion.height=999;
    state='mempool';
    const changed=(await watch.next()).value;
    assert.equal(changed.state,'mempool');assert.equal(changed.priorInclusion.blockHash,blockOne.verbose.hash);await watch.return();
    state='absent';assert.equal(await client.getTransaction({txid:vector.display}),null);
    assert.equal((await client.getTransactionStatus({txid:vector.display})).state,'notSeen');
    await assert.rejects(client.waitForTransaction({txid:vector.display,timeoutMs:30}),{code:'TIMEOUT'});
    assert.deepEqual(server.unexpected,[]);
  } finally {await server.close();}
});

test('public observation cancellation, overlap, overflow and dispatched broadcast remain bounded', async () => {
  let mode='stall', notify;
  const server=await fixture((call,_req,res)=>{
    if(call.method==='getblockheader')return result(call.params[1]?genesis.verbose:genesis.raw);
    if(call.method==='getblockchaininfo')return result({blocks:1,bestblockhash:blockOne.verbose.hash});
    if(call.method==='getrawtransaction') {
      if(mode==='stall'){res.writeHead(200);res.write('{');notify?.();return;}
      return rpcError(-5);
    }
    if(call.method==='sendrawtransaction') {
      if(mode==='send-stall'){res.writeHead(200);res.write('{');notify?.();return;}
      return mode==='malformed'?result('00'.repeat(32)):rpcError(mode==='rejected'?-25:-32603);
    }
    throw Error(call.method);
  });
  try {
    const client=createPublicClient({network,transport:http(`${server.origin}/rpc`,{...transportOptions,readRetry:{attempts:3,delayMs:0}}),observation:{pollIntervalMs:5,maxBufferedUpdates:1}});
    const controller=new AbortController();controller.signal.addEventListener('abort',e=>e.stopImmediatePropagation());
    const watch=client.watchTransaction({txid:vector.display,signal:controller.signal})[Symbol.asyncIterator]();
    const reached=new Promise(resolve=>{notify=resolve;});const first=watch.next();
    await assert.rejects(watch.next(),{code:'INVALID_ARGUMENT'});await reached;
    controller.signal.dispatchEvent(new Event('abort'));controller.abort();await assert.rejects(first,{code:'ABORTED'});await watch.return();
    mode='absent';const slow=client.watchTransaction({txid:vector.display})[Symbol.asyncIterator]();
    await slow.next();await new Promise(resolve=>setTimeout(resolve,60));await assert.rejects(slow.next(),{code:'RESOURCE_LIMIT'});await slow.return();
    const raw=Uint8Array.from(Buffer.from(vector.hex,'hex'));
    for(const [next,outcome]of[['rejected','rejected'],['internal','unknown'],['malformed','unknown']]){
      mode=next;assert.equal((await client.broadcastTransaction({bytes:raw})).outcome,outcome);
    }
    mode='send-stall';const sendCancel=new AbortController();const sent=new Promise(resolve=>{notify=resolve;});
    const sending=client.broadcastTransaction({bytes:raw,signal:sendCancel.signal});await sent;sendCancel.abort();
    assert.equal((await sending).outcome,'unknown');
    assert.equal(server.calls.filter(v=>v.method==='sendrawtransaction').length,4);
    const empty=client.watchTransaction({txid:vector.display})[Symbol.asyncIterator]();await empty.return();assert.equal((await empty.next()).done,true);
    assert.deepEqual(server.unexpected,[]);
  }finally{await server.close();}
});

test('unconsumed subtree iterator owns no dependent signal or request', () => {
  const client=createPublicClient({network,transport:http('https://synthetic.invalid',transportOptions),observation});
  const controller=new AbortController();
  const original=AbortSignal.any;let calls=0;
  AbortSignal.any=function(...args){calls++;return Reflect.apply(original,this,args);};
  try {
    const iterator=client.getSubtreeRoots({pool:'sapling',startIndex:0n,limit:1,signal:controller.signal})[Symbol.asyncIterator]();
    assert.equal(calls,0);void iterator.return();assert.equal(calls,0);
  } finally {AbortSignal.any=original;}
});
