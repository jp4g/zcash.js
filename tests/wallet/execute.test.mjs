// Composition checks only; real fused execution is qualified with the native runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {walletExecute} from '../../dist/src/wallet/execute.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
import {defineNetwork,networkBinding} from '../../dist/src/network.js';
import {networkDefinition} from '../sdk/light-client-fixture.mjs';
import {fixture as pcztFixture} from '../sdk/pczt-fixture.mjs';
import {failure} from '../../dist/src/errors.js';
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
test('custom role negotiation admits unproven signing before proving, without retrying a signer',async()=>{
  const network=await defineNetwork({identity:'role-order',genesisHash:pcztFixture.genesis,parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(pcztFixture.parameters)});
  for(const proofState of ['either','required']){
    const operationId='01'.repeat(32),calls=[];
    const session={check(){},completion(){},accounts:{async get(){return {accountIndex:0};}},
      proposals:{async get(){return this.create();},async create(){return {operationId,proposalId:'02'.repeat(32),reviewCommitment:'03'.repeat(32),accountId:'account',revision:'epoch:1',
        targetHeight:pcztFixture.ironwoodHeight,branchId:pcztFixture.ironwoodBranch,lockExpiryHeight:121,totalFee:10000n,steps:[{index:0,dependsOn:[],inputs:[],outputs:[],fee:10000n,transactionVersion:6,expiryHeight:141}]};}},
      pczt:{maximum:65536,async build(){return this.get();},async get(){return {operationId,artifactId:'06'.repeat(32),accountId:'account',outputs:[],bytes:Uint8Array.from(Buffer.from(pcztFixture.ironwood,'hex')),proofsComplete:false,authorizationComplete:false};}}};
    const proposals=new WalletProposals(session,network),proposal=await proposals.create({});
    proposals.prove=async()=>{calls.push('prove');throw failure('ROLE_PRECONDITION','proving','correct-input','Missing signer-owned material.');};
    const signer={async getCapabilities(){return {revision:'one',networks:['role-order'],maxPcztBytes:65536,exportableViewing:['ufvk'],accountDiscovery:'explicit-index',
      authorizations:[{pool:'ironwood',txVersion:6,branchIds:[pcztFixture.ironwoodBranch],pcztVersions:[2],circuitVersions:['ironwood-post-nu6_3/1'],proofState,requiredFields:['zakura-signer-full/1'],review:'device'}]};},
      async getAccount(){calls.push('signer');throw failure('SIGNER_REJECTED','authorization','none','Fixture stops before disclosure.');},async authorize(){throw Error('unexpected disclosure');}};
    const payments={operations:{async get(){return {operationId,steps:[{txid:null}]};}},async dispatch(){throw Error('unexpected dispatch');}};
    const api=walletExecute({session},{attachedSigner(){return signer;}},proposals,payments,async()=>proposal);
    await assert.rejects(api.send({proposal}),{code:proofState==='either'?'SIGNER_REJECTED':'ROLE_PRECONDITION'});
    assert.deepEqual(calls,[proofState==='either'?'signer':'prove']);
  }
});
