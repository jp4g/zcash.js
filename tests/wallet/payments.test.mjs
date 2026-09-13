import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {attachWalletWorker} from '../../dist/src/wallet/host.js';
import {installWalletWorker} from '../../dist/src/wallet/worker.js';
import {WalletPayments} from '../../dist/src/wallet/payments.js';
import {defineNetwork} from '../../dist/src/network.js';
import {networkDefinition} from '../sdk/light-client-fixture.mjs';
import {scalar,bytesField,concat} from '../clients/light-chain-reads-fixtures.mjs';
const network=await defineNetwork(networkDefinition()),txid='12'.repeat(32),hash='34'.repeat(32);
const operationId=n=>n.toString(16).padStart(64,'0');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(t,{count=1,finalized=true,light=true,online=false,buffer=2,delayed=false}={}){
  const journal=Array.from({length:count},(_,index)=>({sequence:String(index+1),observationSequence:'0',state:{operationId:operationId(index+1),revision:'1',accountIds:['account'],phase:finalized?'ready':'proposed',missing:finalized?[]:['artifact','finalizedBytes'],steps:[{index:0,dependsOn:[],txid:finalized?txid:null,exactBytesSha256:finalized?'56'.repeat(32):null,attempts:[],inclusion:null,observation:null,expiry:{height:0,reached:false,confirmedUnminedAt:null},blockedBy:[]}]}}));
  const control={revision:1,calls:[],requests:0,dispatches:0,finish:0,position:'0',closed:0,reads:0,mined:false,stalled:false,started:null,reply:null};
  const channels=new MessageChannel(),budget={jobs:0,bytes:0,active:false,wake:new Set(),signers:new Map(),proving:{capacity:128*1024*1024,bytes:0,active:false}};
  const current=row=>{row.state.revision=String(control.revision);return structuredClone({state:row.state,observationSequence:row.observationSequence});};
  installWalletWorker({generation:1,instance:'wallet',close(){control.closed++;},call(_g,_i,command,args){
    control.calls.push(command);
    const row=journal.find(row=>row.state.operationId===args.operationId);
    if(command==='payment_list')return {revision:String(control.revision),highWater:args.highWater??String(count),observationPosition:control.position,
      items:journal.filter(row=>BigInt(row.sequence)>BigInt(args.afterSequence)&&BigInt(row.sequence)<=BigInt(args.highWater??count)).slice(0,args.limit).map(row=>({sequence:row.sequence,operationId:row.state.operationId}))};
    if(command==='payment_recovery_position'){control.position=args.afterSequence;control.revision++;return;}
    if(command==='payment_get'){if(control.getGate){control.started?.();return control.getGate.then(()=>row?current(row):null);}return row?current(row):null;}
    if(!row)throw Object.assign(Error('OPERATION_NOT_FOUND'),{commit:'none'});
    const step=row.state.steps[0];
    if(command==='payment_reconcile'){for(const attempt of step.attempts)if(attempt.outcome==='started')attempt.outcome='unknown';control.revision++;return current(row);}
    if(command==='payment_observe'){if(control.observeError)throw Object.assign(Error(control.observeError),{commit:'none'});step.observation=args.observation;step.inclusion=args.observation.inclusion;row.observationSequence=String(+row.observationSequence+1);control.revision++;return current(row);}
    if(command==='payment_attempt_begin'){
      assert.equal(args.maximum,65536);if(!step.txid)throw Object.assign(Error('NOT_FINALIZED'),{commit:'none'});
      if(args.mode==='automatic')return null;
      assert.equal(step.attempts.some(attempt=>attempt.outcome==='started'),false);
      step.attempts.push({attemptId:String(step.attempts.length+1),outcome:'started',sourceId:args.sourceId,startedAt:args.wallTimeMs,completedAt:null,diagnosticCode:null});control.revision++;
      return {attemptId:step.attempts.at(-1).attemptId,bytes:new Uint8Array([1,2,3]),txid};
    }
    if(command==='payment_attempt_finish'){
      assert.equal('txid'in args,args.outcome==='acknowledged');if(args.diagnosticCode)assert.match(args.diagnosticCode,/^[A-Z0-9_]{1,64}$/);
      const attempt=step.attempts.find(item=>item.attemptId===args.attemptId);Object.assign(attempt,{outcome:args.outcome,completedAt:args.wallTimeMs,diagnosticCode:args.diagnosticCode??null});control.finish++;control.revision++;return current(row);
    }
    throw Error(command);
  }},channels.port2);
  const session=attachWalletWorker(channels.port1,async()=>{channels.port2.close();},{maxQueuedJobs:8,maxQueuedBytes:65536,maxPcztBytes:65536},budget);
  const client={network,async getTreeState({height}){control.requests++;const block=height===0?network.genesisHash:hash;return {network,point:{height,hash:block},sapling:null,ironwood:null,encoded:concat(scalar(2,height),bytesField(3,new TextEncoder().encode(block))),sourceId:'source',observedAt:new Date().toISOString()};},
    async getTip(){control.requests++;return {height:20,hash,sourceId:'source',observedAt:new Date().toISOString()};},
    async getTransaction(){throw Error('not used');},
    async getTransactionStatus(){control.reads++;if(control.stalled){control.started?.();return new Promise(()=>{});}return {txid,state:control.mined?'mined':'notSeen',inclusion:control.mined?{height:19,blockHash:hash,confirmations:999}:null,tip:null,priorInclusion:control.prior??null,sourceId:'source',observedAt:new Date().toISOString()};},
    async broadcastTransaction({bytes}){assert.deepEqual([...bytes],[1,2,3]);control.dispatches++;control.started?.();if(delayed)return new Promise(resolve=>{control.reply=resolve;});return {txid,outcome:'acknowledged',diagnosticCode:null,sourceId:'source',observedAt:new Date().toISOString()};}};
  const wallet={session,close:()=>session.close()};
  const options={network,storage:{kind:'memory'},runtime:{maxQueuedJobs:8},observation:{pollIntervalMs:5,maxBufferedUpdates:buffer},recovery:online?{mode:'online',timeoutMs:30}:{mode:'offline'},...(light?{light:client}:{}),broadcaster:client};
  const payments=new WalletPayments(wallet,{},options);
  t.after(async()=>{await payments.close();await session.close();assert.equal(budget.proving.bytes,0);});
  return {payments,session,journal,control,budget,client};
}

test('offline recovery traverses more than one page without IDs or network, then paginates locally',async t=>{
  const {payments,control}=setup(t,{count:405,finalized:false,light:false});
  const result=await payments.recover();assert.equal(result.operations,405);assert.equal(result.local,'complete');assert.equal(result.deferredOperations,0);assert.equal(control.requests,0);
  assert.equal(control.calls.filter(op=>op==='payment_reconcile').length,405);
  const first=await payments.operations.list({limit:200});assert.equal(first.items.length,200);assert.ok(first.nextCursor);
  const second=await payments.operations.list({limit:200,cursor:first.nextCursor});assert.equal(second.items.length,200);
  assert.equal(await payments.operations.get({operationId:operationId(999)}),null);
  const before=control.calls.length;const handle=await payments.operations.resume({operationId:operationId(1)});await handle.snapshot();assert.ok(control.calls.slice(before).every(op=>op==='payment_get'));
  await assert.rejects(handle.wait(),{code:'NOT_FINALIZED'});
});

test('broadcast serializes reconciliation through durable result and records cancellation as unknown',async t=>{
  const {payments,control,journal}=setup(t,{delayed:true});await payments.recover();
  const controller=new AbortController(),started=new Promise(resolve=>{control.started=resolve;});
  const first=payments.broadcast({operationId:operationId(1),signal:controller.signal});await started;
  await assert.rejects(payments.broadcast({operationId:operationId(1)}),{code:'STORAGE_BUSY'});
  assert.equal(journal[0].state.steps[0].attempts[0].outcome,'started');controller.abort();
  await assert.rejects(first,error=>error.code==='ABORTED'&&error.paymentState.steps[0].attempts[0].outcome==='unknown');
  assert.equal(control.finish,1);assert.equal(control.dispatches,1);assert.equal(journal[0].state.steps[0].attempts[0].outcome,'unknown');
});

test('wait checks coherent confirmations; one subscriber cancellation does not stop another',async t=>{
  const {payments,control}=setup(t);await payments.recover();const handle=await payments.operations.resume({operationId:operationId(1)});
  const a=new AbortController(),first=handle.wait({signal:a.signal}),second=handle.wait({confirmations:2,timeoutMs:1000});
  const rejected=assert.rejects(first,{code:'ABORTED'});await wait(15);a.abort();await rejected;control.mined=true;
  const result=await second;assert.equal(result.transactions[0].confirmations,2);assert.equal(result.snapshot.operationId,operationId(1));
});

test('event overflow is explicit and return releases owned buffers',async t=>{
  const {payments,budget}=setup(t,{buffer:1});await payments.recover();const handle=await payments.operations.resume({operationId:operationId(1)}),events=handle.events();
  assert.equal((await events.next()).done,false);await wait(30);await assert.rejects(events.next(),{code:'RESOURCE_LIMIT'});await events.return();assert.equal(budget.proving.bytes,0);
});

test('online timeout leaves complete local recovery and a rotating deferred inventory',async t=>{
  const {payments,control}=setup(t,{count:3,online:true});control.stalled=true;
  const result=await payments.recover();assert.equal(result.operations,3);assert.equal(result.observedOperations,0);assert.equal(result.deferredOperations,3);assert.equal(result.lastError.code,'TIMEOUT');assert.equal(control.position,'1');assert.equal(control.dispatches,0);
  assert.ok(await payments.operations.get({operationId:operationId(2)}));
});

test('close cancels a hung observer and leaves runtime closure to its owner',async t=>{
  const {payments,control}=setup(t);await payments.recover();control.stalled=true;
  const started=new Promise(resolve=>{control.started=resolve;}),handle=await payments.operations.resume({operationId:operationId(1)}),events=handle.events();
  const next=events.next();const rejected=assert.rejects(next,{code:'ABORTED'});await started;await payments.close();await rejected;await events.return();assert.equal(control.closed,0);
});

 test('close drains a wait stalled in its initial local read',async t=>{
  const {payments,control}=setup(t);await payments.recover();
  const handle=await payments.operations.resume({operationId:operationId(1)});
  let release,started;control.getGate=new Promise(resolve=>{release=resolve;});
  const entered=new Promise(resolve=>{started=resolve;});control.started=started;
  const pending=handle.wait({timeoutMs:60000});const rejected=assert.rejects(pending,{code:'ABORTED'});
  await entered;let closed=false;const closing=payments.close().then(()=>{closed=true;});
  await wait(10);assert.equal(closed,false);release();await rejected;await closing;
  assert.equal(control.requests,0);
});

test('recovery retains native no-commit observation uncertainty but rejects storage failure',async t=>{
  const uncertain=setup(t,{online:true});uncertain.control.observeError='RECOVERY_REQUIRED';
  const report=await uncertain.payments.recover();assert.equal(report.local,'complete');
  assert.equal(report.lastError.code,'RECOVERY_REQUIRED');assert.equal(report.deferredOperations,1);
  const broken=setup(t,{online:true});broken.control.observeError='STORAGE_ERROR';
  await assert.rejects(broken.payments.recover(),{code:'STORAGE_ERROR'});
});

test('first observation retains owned source prior inclusion without old confirmations',async t=>{
  const {payments,control}=setup(t);await payments.recover();
  control.prior={height:18,blockHash:hash,confirmations:100};
  const handle=await payments.operations.resume({operationId:operationId(1)}),events=handle.events();
  const state=(await events.next()).value;control.prior.height=1;
  assert.deepEqual(state.steps[0].observation.priorInclusion,{height:18,blockHash:hash,confirmations:null});
  await events.return();
});
