// Composition checks only; real fused execution is qualified with the native runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {walletExecute} from '../../dist/src/wallet/execute.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
import {defineNetwork,networkBinding} from '../../dist/src/network.js';
import {networkDefinition} from '../sdk/light-client-fixture.mjs';
const network=await defineNetwork(networkDefinition()),bound=networkBinding(network);
async function fixture({finalized=true,steps=1}={}){
  const operationId='01'.repeat(32),calls=[];
  const session={check(){},completion(){},proposals:{async create(){return {operationId,proposalId:'02'.repeat(32),reviewCommitment:'03'.repeat(32),accountId:'account',revision:'epoch:1',
    targetHeight:101,branchId:bound.codec.consensusContext(bound.definition.parametersFormat,bound.definition.parameters.bytes,101).branchId,
    lockExpiryHeight:121,totalFee:10000n,steps:Array.from({length:steps},(_,index)=>({index,dependsOn:index?[0]:[],inputs:[],outputs:[],fee:10000n,transactionVersion:6,expiryHeight:141}))};}}};
  const proposals=new WalletProposals(session,network),proposal=await proposals.create({});
  const state={operationId,steps:Array.from({length:steps},()=>({txid:finalized?'04'.repeat(32):null}))};
  const payments={operations:{async get(){return state;}},async dispatch(input){calls.push(input);return {operationId};}};
  const api=walletExecute({session},{attachedSigner(){throw Error('finalized retry must not acquire signer');}},proposals,payments,async input=>{calls.push(input);return proposal;});
  return {api,proposal,calls,state};
}
test('finalized supplied plan and idempotent intent dispatch without signer, build or assets',async()=>{
  const {api,proposal,calls}=await fixture({steps:2});
  assert.equal((await api.send({proposal})).operationId,proposal.operationId);
  assert.equal(calls.length,1);assert.equal(calls[0].origin,'send');
  await api.shield({accountId:'account',idempotencyKey:'existing'});
  assert.equal(calls[1].kind,'shield');assert.equal(calls[2].origin,'shield');
});
test('custom multi-step authority is rejected before any signer method, retaining operation ID',async()=>{
  const {api,proposal,calls}=await fixture({finalized:false,steps:2});
  const signer=new Proxy({},{get(){throw Error('must not disclose to custom signer');}});
  await assert.rejects(api.send({proposal,signer}),error=>error.code==='PCZT_MULTI_STEP_UNSUPPORTED'&&error.operationId===proposal.operationId);
  assert.equal(calls.length,0);
});
test('mixed supplied-plan intent and cancellation cannot dispatch; partial bytes cannot rebuild',async()=>{
  const {api,proposal,calls,state}=await fixture({steps:2});
  await assert.rejects(api.send({proposal,amount:1n}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(api.send({proposal,signal:AbortSignal.abort()}),{code:'ABORTED'});
  state.steps[1].txid=null;
  await assert.rejects(api.send({proposal}),error=>error.code==='RECOVERY_REQUIRED'&&error.operationId===proposal.operationId);
  assert.equal(calls.length,0);
});
