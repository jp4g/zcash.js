// Worker composition/ownership checks; native selection and persistence use the Rust fixture.
import assert from 'node:assert/strict';
import test from 'node:test';
import {MessageChannel,MessagePort} from 'node:worker_threads';
import {attachWalletWorker} from '../../dist/src/wallet/host.js';
import {installWalletWorker} from '../../dist/src/wallet/worker.js';
import {WalletProposals,proposalBinding,pcztArtifactBinding} from '../../dist/src/wallet/proposals.js';
import {defineNetwork} from '../../dist/src/network.js';
const parameters=new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
const network=await defineNetwork({identity:'proposal-fixture',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters});
const native=()=>({operationId:'01'.repeat(32),proposalId:'02'.repeat(32),reviewCommitment:'04'.repeat(32),accountId:'account',revision:'epoch:1',targetHeight:101,expiryHeight:141,lockExpiryHeight:121,totalFee:10000n,
  steps:[{index:0,dependsOn:[],transactionVersion:6,expiryHeight:141,fee:10000n,inputs:[{accountId:'account',pool:'sapling',source:{kind:'output',txid:'05'.repeat(32),outputIndex:0},value:30000n}],
    outputs:[{accountId:null,pool:'sapling',address:'recipient',amount:10000n,memo:new Uint8Array([0,255]),kind:'payment'},
      {accountId:'account',pool:'sapling',address:null,amount:10000n,memo:null,kind:'change'}]}]});
// Exact branch context comes from the accepted native codec, not a hand-coded table.
const {networkBinding}=await import('../../dist/src/network.js');
const bound=networkBinding(network),branch=bound.codec.consensusContext(bound.definition.parametersFormat,parameters,101).branchId;
const review=()=>({...native(),branchId:branch});
const args=()=>({revision:'epoch:0',accountId:'account',payments:[{to:'recipient',amount:10000n,memo:new Uint8Array([0,255])}],policy:{spendPools:['sapling'],transparent:'disallow',changePool:'sapling',feeRule:'zip317-standard',confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:false},expiry:{kind:'offset',blocks:40},lockExpiryBlocks:20}});
function setup(t,invoke,limits={}) {
  const channel=new MessageChannel();
  installWalletWorker({generation:1,instance:'fixture',close(){},call:(_g,_i,operation,input)=>invoke(operation,input)},channel.port2);
  const session=attachWalletWorker(channel.port1,async()=>channel.port2.close(),{maxQueuedJobs:4,maxQueuedBytes:8192,...limits});
  t.after(()=>session.close().catch(()=>{}));
  return {session,api:new WalletProposals(session,network)};
}
test('proposal projection owns review bytes and binds native IDs to exact wallet instance',async t=>{
  let received;
  const one=setup(t,(op,input)=>{received=input;return op==='proposal_list'?{highWater:'1',items:[{sequence:'1',operationId:'01'.repeat(32)}]}:review();});
  const input=args(),pending=one.api.create(input);input.payments[0].memo.fill(77);
  const proposal=await pending;
  assert.deepEqual([...received.payments[0].memo],[0,255]);
  assert.equal(proposal.context.network,network);assert.equal(proposal.steps[0].outputs[1].address,null);
  const exposed=proposal.steps[0].outputs[0].memo.bytes;exposed.fill(88);
  assert.deepEqual([...proposal.steps[0].outputs[0].memo.bytes],[0,255]);
  assert.ok(Object.isFrozen(proposal.steps[0].inputs[0].source));
  assert.deepEqual(proposalBinding(proposal,one.session),{operationId:proposal.operationId,proposalId:proposal.proposalId,reviewCommitment:proposal.reviewCommitment});
  assert.throws(()=>proposalBinding({...proposal},one.session),{code:'INVALID_ARGUMENT'});
  const other=setup(t,()=>review());assert.throws(()=>proposalBinding(proposal,other.session),{code:'WRONG_INSTANCE'});
  const restored=await one.api.restore({operationId:proposal.operationId});assert.notEqual(restored,proposal);
  assert.deepEqual(proposalBinding(restored,one.session),proposalBinding(proposal,one.session));
  assert.equal((await one.api.list({afterSequence:'0',limit:1})).items[0].operationId,proposal.operationId);
});
test('proposal native rejection and cancellation retain exact completion without replay',async t=>{
  let calls=0,reject='STALE_REVISION';
  const {session,api}=setup(t,()=>{calls++;if(reject)throw Object.assign(Error(reject),{commit:'none'});return review();});
  for(const [native,code]of [['STALE_REVISION','STALE_PROPOSAL'],['FEE_LIMIT_EXCEEDED','FEE_LIMIT_EXCEEDED'],['INSUFFICIENT_FUNDS','INSUFFICIENT_FUNDS']]) {
    reject=native;await assert.rejects(api.create(args()),error=>error.code===code&&error.stage==='proposal'&&session.completion(error).completion==='none');
  }
  reject='';const before=calls;
  await assert.rejects(api.create({...args(),signal:AbortSignal.abort()}),error=>error.code==='ABORTED'&&session.completion(error).completion==='none');assert.equal(calls,before);
  const controller=new AbortController(),send=MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage=function(value,...rest){const result=Reflect.apply(send,this,[value,...rest]);if(value?.command==='proposal_create')controller.abort();return result;};
  try {await assert.rejects(api.create({...args(),signal:controller.signal}),error=>error.code==='ABORTED'&&session.completion(error).completion==='committed'&&session.completion(error).value.proposalId==='02'.repeat(32));}
  finally {MessagePort.prototype.postMessage=send;}
  assert.equal(calls,before+1);assert.equal((await api.restore({operationId:'01'.repeat(32)})).proposalId,'02'.repeat(32));
});

test('postcommit projection failure retains native operation receipt',async t=>{
  const value={...review(),branchId:0};
  const {session,api}=setup(t,()=>value);
  await assert.rejects(api.create(args()),error=>error.code==='PROTOCOL_MISMATCH'&&session.completion(error).completion==='committed'&&session.completion(error).value.operationId===value.operationId);
});

const built=()=>({operationId:'01'.repeat(32),artifactId:'06'.repeat(32),accountId:'account',bytes:new Uint8Array([1,2]),
  outputs:[{accountId:'account',pool:'sapling',address:'native-change',amount:10000n,memo:new Uint8Array([0,255]),kind:'change'}],proofsComplete:false,authorizationComplete:false});
test('native PCZT build routes retained IDs, owns review outputs, and binds artifact identity',async t=>{
  const calls=[];const one=setup(t,(op,input)=>{calls.push({op,input});return op==='proposal_create'?review():built();});
  const proposal=await one.api.create(args()),artifact=await one.api.build({proposal});
  assert.deepEqual(calls[1],{op:'pczt_build',input:proposalBinding(proposal,one.session)});
  assert.equal(artifact.outputs[0].address,'native-change');assert.equal('bytes' in artifact,false);
  artifact.outputs[0].memo.bytes.fill(99);assert.deepEqual([...artifact.outputs[0].memo.bytes],[0,255]);
  assert.deepEqual(pcztArtifactBinding(artifact,one.session),{operationId:artifact.operationId,artifactId:artifact.artifactId});
  assert.throws(()=>pcztArtifactBinding({...artifact},one.session),{code:'INVALID_ARGUMENT'});
  const other=setup(t,()=>review());assert.throws(()=>pcztArtifactBinding(artifact,other.session),{code:'WRONG_INSTANCE'});
  const before=calls.length;await assert.rejects(one.api.build({proposal:{...proposal}}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(other.api.build({proposal}),{code:'WRONG_INSTANCE'});assert.equal(calls.length,before);
  assert.deepEqual(await one.session.pczt.get({operationId:artifact.operationId}),built());
});
test('PCZT build preserves native rejection and postdispatch committed cancellation',async t=>{
  let rejects=false,calls=0;const {session,api}=setup(t,(op)=>{calls++;if(op==='proposal_create')return review();if(rejects)throw Object.assign(Error('PCZT_MULTI_STEP_UNSUPPORTED'),{commit:'none'});return built();});
  const proposal=await api.create(args());rejects=true;
  await assert.rejects(api.build({proposal}),e=>e.code==='PCZT_MULTI_STEP_UNSUPPORTED'&&e.stage==='proposal'&&session.completion(e).completion==='none');
  rejects=false;const before=calls;
  await assert.rejects(api.build({proposal,signal:AbortSignal.abort()}),e=>e.code==='ABORTED'&&session.completion(e).completion==='none');assert.equal(calls,before);
  const controller=new AbortController(),send=MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage=function(value,...rest){const result=Reflect.apply(send,this,[value,...rest]);if(value?.command==='pczt_build')controller.abort();return result;};
  try{await assert.rejects(api.build({proposal,signal:controller.signal}),e=>e.code==='ABORTED'&&session.completion(e).completion==='committed'&&session.completion(e).value.artifactId==='06'.repeat(32));}
  finally{MessagePort.prototype.postMessage=send;}
  assert.equal(calls,before+1);assert.equal((await session.pczt.get({operationId:proposal.operationId})).artifactId,'06'.repeat(32));
});
test('PCZT projection rejection preserves committed native artifact receipt',async t=>{
  const {session,api}=setup(t,op=>op==='proposal_create'?review():{...built(),outputs:[{...built().outputs[0],address:null}]});
  const proposal=await api.create(args());
  await assert.rejects(api.build({proposal}),e=>e.code==='PROTOCOL_MISMATCH'&&session.completion(e).completion==='committed'&&session.completion(e).value.artifactId==='06'.repeat(32));
});

test('PCZT import owns bytes, preserves prior handles and routes explicit artifact IDs',async t=>{
  const calls=[];const original=built(),imported={...built(),artifactId:'07'.repeat(32),authorizationComplete:true};
  const {session,api}=setup(t,(op,input)=>{calls.push({op,input});return op==='proposal_create'?review():op==='pczt_import'?imported:op==='pczt_get_artifact'&&input.artifactId===imported.artifactId?imported:original;},{maxPcztBytes:8});
  const proposal=await api.create(args()),old=await api.build({proposal});
  const bytes=new Uint8Array([3,4]),pending=api.import({operationId:old.operationId,bytes});bytes.fill(99);
  const next=await pending;
  assert.deepEqual([...calls.at(-1).input.bytes],[3,4]);assert.equal(calls.at(-1).input.maximum,8);
  assert.equal(next.authorizationComplete,true);assert.equal(old.authorizationComplete,false);
  assert.notEqual(next.artifactId,old.artifactId);assert.equal('bytes'in next,false);
  next.outputs[0].memo.bytes.fill(99);assert.deepEqual([...next.outputs[0].memo.bytes],[0,255]);
  assert.deepEqual(await session.pczt.get(pcztArtifactBinding(old,session)),original);
  assert.deepEqual(await session.pczt.get(pcztArtifactBinding(next,session)),imported);
  const count=calls.length;
  await assert.rejects(api.import({operationId:old.operationId,bytes:new Uint8Array(9)}),{code:'RESOURCE_LIMIT'});
  await assert.rejects(session.pczt.import({operationId:old.operationId,bytes:new Uint8Array(9)}),{code:'RESOURCE_LIMIT'});
  await assert.rejects(api.import({operationId:old.operationId,bytes:new Uint8Array([1]),signal:AbortSignal.abort()}),{code:'ABORTED'});
  assert.equal(calls.length,count,'configured input cap and abort precede dispatch');
});
test('PCZT import retains native rejection, committed cancellation and projection receipts',async t=>{
  let code='INVALID_PCZT',calls=0;
  const {session,api}=setup(t,()=>{calls++;if(code)throw Object.assign(Error(code),{commit:'none'});return built();});
  const input={operationId:'01'.repeat(32),bytes:new Uint8Array([1])};
  for(code of ['INVALID_PCZT','PCZT_ASSOCIATION_MISMATCH','OPERATION_NOT_FOUND'])await assert.rejects(api.import(input),error=>error.code===code&&session.completion(error).completion==='none');
  code='';const before=calls,controller=new AbortController(),send=MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage=function(value,...rest){const result=Reflect.apply(send,this,[value,...rest]);if(value?.command==='pczt_import')controller.abort();return result;};
  try {await assert.rejects(api.import({...input,signal:controller.signal}),e=>e.code==='ABORTED'&&session.completion(e).completion==='committed'&&session.completion(e).value.artifactId===built().artifactId);}
  finally{MessagePort.prototype.postMessage=send;}
  assert.equal(calls,before+1);
  // An inconsistent operation cannot become a new opaque handle after native commit.
  const broken=setup(t,()=>({...built(),operationId:'ff'.repeat(32)}));
  await assert.rejects(broken.api.import(input),e=>e.code==='PROTOCOL_MISMATCH'&&broken.session.completion(e).completion==='committed');
  assert.equal((await api.import(input)).artifactId,built().artifactId,'known input errors do not poison owner');
});

test('configured PCZT cap rejects before either snapshot constructs an owned byte view',async t=>{
  let dispatches=0;const {session,api}=setup(t,()=>{dispatches++;return built();},{maxPcztBytes:8});
  const NativeBytes=globalThis.Uint8Array,oversized=new NativeBytes(9);let constructions=0;
  globalThis.Uint8Array=new Proxy(NativeBytes,{construct(target,args,newTarget){
    if(args[0]===oversized.buffer||(ArrayBuffer.isView(args[0])&&args[0].byteLength===9))constructions++;
    return Reflect.construct(target,args,newTarget);
  }});
  try {
    assert.equal(session.pczt.maximum,8);
    for(const owner of [api,session.pczt])await assert.rejects(owner.import({operationId:'01'.repeat(32),bytes:oversized}),{code:'RESOURCE_LIMIT'});
    assert.equal(constructions,0,'reject before the first new Uint8Array, not only before worker dispatch');
    assert.equal(dispatches,0);
  }finally{globalThis.Uint8Array=NativeBytes;}
});

test('PCZT export rejects ambiguous and foreign handles before native reads',async t=>{
  let calls=0;const one=setup(t,op=>{calls++;return op==='proposal_create'?review():built();});
  const proposal=await one.api.create(args()),artifact=await one.api.build({proposal}),before=calls;
  for(const input of [{},{proposal,pczt:artifact},{pczt:{...artifact}}])await assert.rejects(one.api.export(input),{code:'INVALID_ARGUMENT'});
  const other=setup(t,()=>{throw Error('foreign export dispatched');});
  await assert.rejects(other.api.export({pczt:artifact}),{code:'WRONG_INSTANCE'});
  await assert.rejects(other.api.export({proposal}),{code:'WRONG_INSTANCE'});
  assert.equal(calls,before);
});

test('proposal export preserves a completed build if later export observes cancellation',async t=>{
  const {api,session}=setup(t,op=>op==='proposal_create'?review():built());
  const proposal=await api.create(args()),controller=new AbortController(),build=api.build.bind(api);
  api.build=async input=>{const artifact=await build(input);controller.abort();return artifact;};
  await assert.rejects(api.export({proposal,signal:controller.signal}),error=>error.code==='ABORTED'
    &&session.completion(error).completion==='committed'&&session.completion(error).value.artifactId==='06'.repeat(32));
});
