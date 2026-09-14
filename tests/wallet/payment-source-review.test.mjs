// Independent boundary checks; these do not claim real wallet/submission qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightClient} from '../../dist/src/light.js';
import {defineNetwork} from '../../dist/src/network.js';
import {PaymentSource} from '../../dist/src/wallet/payment-source.js';
import {networkDefinition} from '../sdk/light-client-fixture.mjs';
import {scalar,bytesField,concat,revision,blockBytes,tipBytes} from '../clients/light-chain-reads-fixtures.mjs';

const network=await defineNetwork(networkDefinition());
const txid='12'.repeat(32),hash='34'.repeat(32),observedAt='2026-09-13T00:00:00.000Z';
function fixture() {
  const state={inclusionSource:'source',tipHash:hash,calls:0};
  const client={network,
    async getTreeState({height}) {
      state.calls++;
      const block=height===0?network.genesisHash:hash;
      return {network,point:{height,hash:block},sapling:null,ironwood:null,
        encoded:concat(scalar(2,height),bytesField(3,new TextEncoder().encode(block))),
        sourceId:height===0?'source':state.inclusionSource,observedAt};
    },
    async getTip(){state.calls++;return {height:20,hash:state.tipHash,sourceId:'source',observedAt};},
    async getTransaction(){throw Error('status path must not fetch raw transaction');},
    async getTransactionStatus(){return {txid,state:'mined',inclusion:{height:19,blockHash:hash,confirmations:999},tip:null,priorInclusion:null,sourceId:'source',observedAt};},
    async broadcastTransaction(){return {txid,outcome:'acknowledged',diagnosticCode:null,sourceId:'broadcaster',observedAt};},
  };
  return {state,client,source:new PaymentSource(client,network)};
}

test('payment inclusion is checked against its source and fresh tip, not claimed confirmations',async()=>{
  const {source,state}=fixture();
  const result=await source.observe(txid,new AbortController().signal);
  assert.equal(result.inclusion.confirmations,2);
  assert.equal(await source.route(),null,'custom display identity never qualifies automatic retries');
  state.inclusionSource='other-source';
  await assert.rejects(source.observe(txid,new AbortController().signal),{code:'PROTOCOL_MISMATCH'});
});

test('broadcast acknowledgement must match separately verified broadcaster identity',async()=>{
  const {source}=fixture(),signal=new AbortController().signal;
  assert.equal((await source.broadcast(new Uint8Array([1]),txid,'broadcaster',signal)).outcome,'acknowledged');
  await assert.rejects(source.broadcast(new Uint8Array([1]),txid,'source',signal),{code:'PROTOCOL_MISMATCH'});
});

test('payment observation captures methods and rejects a changing tip',async()=>{
  const {source,client,state}=fixture();
  client.getTip=()=>{throw Error('replacement method must not run');};
  await source.observe(txid,new AbortController().signal);
  const original=client.getTransactionStatus;
  client.getTransactionStatus=async()=>{state.tipHash='56'.repeat(32);return original();};
  const changed=new PaymentSource({...client,getTip:async()=>({height:20,hash:state.tipHash,sourceId:'source',observedAt})},network);
  await assert.rejects(changed.observe(txid,new AbortController().signal),{code:'PROTOCOL_MISMATCH'});
});

test('observation cancellation returns even when a custom client ignores its signal',async()=>{
  const {client,state,source}=fixture();
  await assert.rejects(source.observe(txid,AbortSignal.abort()),{code:'ABORTED'});
  assert.equal(state.calls,0);
  let started;
  const dispatched=new Promise(resolve=>{started=resolve;});
  client.getTreeState=()=>{started();return new Promise(()=>{});};
  const stalled=new PaymentSource(client,network),controller=new AbortController();
  const result=stalled.observe(txid,controller.signal);
  await dispatched;controller.abort();
  await assert.rejects(result,{code:'ABORTED'});
});


test('registered payment sources use their native handshake; structural copies still require genesis evidence',async()=>{
  const text=(n,value)=>bytesField(n,new TextEncoder().encode(value));
  let trees=0,streams=0;
  const client=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'source',protocolRevision:revision,
    async unary({method}){
      if(method==='GetLightdInfo')return concat(text(4,'main'),scalar(5,20),text(6,'76b809bb'),scalar(7,20),text(18,'v0.5.0'));
      if(method==='GetLatestBlock')return tipBytes(20);
      trees++;throw Error('genesis tree unavailable');
    },async *stream(){streams++;yield blockBytes(1,undefined,new Uint8Array(32).fill(3));}
  }});
  const source=new PaymentSource(client,network),signal=new AbortController().signal;
  assert.equal(await source.verify(signal),'source');assert.equal(trees,0);assert.equal(streams,1);
  await assert.rejects(new PaymentSource({...client},network).verify(signal),{code:'TRANSPORT_ERROR'});
  assert.equal(trees,1,'unregistered copy cannot bypass genesis validation');
});
