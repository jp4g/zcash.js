// Factory lifecycle tests substitute only runtime acquisition; wallet components use the real queue.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {MessageChannel} from 'node:worker_threads';
import {defineNetwork} from '../../dist/src/network.js';
import {networkDefinition} from '../sdk/light-client-fixture.mjs';
import {attachWalletWorker} from '../../dist/src/wallet/host.js';
import {installWalletWorker} from '../../dist/src/wallet/worker.js';

test('public wallet factory admission, ownership, recovery and close',async()=>{
  if(!mock.module){execFileSync(process.execPath,['--experimental-test-module-mocks',import.meta.filename],{stdio:'pipe',env:{...process.env,NODE_TEST_CONTEXT:''}});return;}
  const network=await defineNetwork(networkDefinition()),foreign=await defineNetwork({...networkDefinition(),identity:'foreign',genesisHash:'99'.repeat(32)});
  const defaults=()=>({network,storage:{kind:'memory'},runtime:{baseline:{manifestUrl:'https://example.test/manifest.json',manifestSha256:'01'.repeat(32)},threading:{mode:'baseline'},maxMemoryBytes:1024**3,maxQueuedJobs:8,maxQueuedBytes:65536,maxPcztBytes:65536,scanBatchSize:8},confirmations:{trusted:1,untrusted:3,allowZeroConfirmationShielding:false},observation:{pollIntervalMs:5,maxBufferedUpdates:2},recovery:{mode:'offline'}});
  let opened=0,closed=0,releaseOpen,gate,received,callbacks=0,onAbort,reentrant;const calls=[];
  const sessions=[];
  mock.module('../../dist/src/runtime/wallet.js',{namedExports:{openWalletRuntime:async options=>{
    opened++;received=options;if(gate)await gate;
    const channel=new MessageChannel();installWalletWorker({generation:1,instance:'factory',close(){closed++;},call(_g,_i,command,args){
      calls.push({command,args});
      if(command==='payment_list')return {revision:'1',highWater:'0',observationPosition:'0',items:[]};
      if(command==='account_list')return [];
      if(command==='account_balance')return {fixture:true};
      if(command==='scan_state')return {revision:'1',tip:null,tipHeight:null,fullyScannedHeight:null,maxScannedHeight:null,ranges:[],accounts:[]};
      if(command==='enhancement_requests')return {revision:'1',requests:[]};
      if(command==='wallet_history')return {items:[],nextCursor:null,revision:'1'};
      throw Error(command);
    }},channel.port2);
    const session=attachWalletWorker(channel.port1,async()=>channel.port2.close(),{maxQueuedJobs:8,maxQueuedBytes:65536,maxPcztBytes:65536},{jobs:0,bytes:0,active:false,wake:new Set(),signers:new Map(),proving:{capacity:128*1024*1024,bytes:0,active:false,cleanup:new Set()}});sessions.push(session);
    return {session,owner:{check(){session.check();}},close:()=>session.close()};
  }}});
  const {createWalletClient,createZcashClient}=await import('../../dist/src/index.js');
  try{
    await assert.rejects(createWalletClient({...defaults(),signal:AbortSignal.abort()}),{code:'ABORTED'});assert.equal(opened,0);
    await assert.rejects(createWalletClient({...defaults(),recovery:{mode:'online',timeoutMs:1}}),{code:'INVALID_ARGUMENT'});assert.equal(opened,0);
    let getterReads=0;const hostile=defaults();Object.defineProperty(hostile.observation,'pollIntervalMs',{get(){getterReads++;return 1;}});await assert.rejects(createWalletClient(hostile),{code:'INVALID_ARGUMENT'});assert.equal(getterReads,0);assert.equal(opened,0);
    const mismatched={...defaults(),transactionPolicy:{spendPools:['sapling'],transparent:'disallow',changePool:'sapling',feeRule:'zip317-standard',confirmations:{trusted:2,untrusted:3,allowZeroConfirmationShielding:false},expiry:{kind:'offset',blocks:40},lockExpiryBlocks:10,shieldingThreshold:1n,freshness:{mode:'require-synced',maxLagBlocks:0}}};
    await assert.rejects(createWalletClient(mismatched),{code:'INVALID_ARGUMENT'});assert.equal(opened,0);
    await assert.rejects(createWalletClient({...defaults(),light:{network:foreign}}),{code:'NETWORK_MISMATCH'});assert.equal(opened,0);
    const light={network};for(const method of ['getTip','getServerInfo','getTransaction','getAddressUtxos','getAddressBalance','getTreeState','getSubtreeRoots','streamCompactBlocks','streamAddressTransactions','streamMempool','broadcastTransaction'])light[method]=function(args){assert.equal(this,light);callbacks++;args.signal?.addEventListener('abort',()=>onAbort?.(),{once:true});return new Promise(()=>{});};
    const args={...defaults(),light};gate=new Promise(resolve=>{releaseOpen=resolve;});const creating=createWalletClient(args);
    args.confirmations.trusted=99;args.runtime.baseline.manifestUrl='https://changed.test/';args.observation.pollIntervalMs=1000;light.getTip=()=>{throw Error('mutated method');};
    releaseOpen();const wallet=await creating;gate=undefined;
    assert.equal(received.runtime.baseline.manifestUrl,'https://example.test/manifest.json');assert.equal(callbacks,0);assert.equal(wallet.recovery.local,'complete');assert.equal(wallet.recovery.operations,0);assert.ok(Object.isFrozen(wallet));assert.ok(Object.isFrozen(wallet.recovery));
    await wallet.getBalance({accountId:'account'});assert.equal(calls.find(call=>call.command==='account_balance').args.confirmations.trusted,1);
    await wallet.accounts.list();await wallet.getHistory({accountId:'account'});
    for(const method of ['send','shield','propose','build','prove','sign','finalize','broadcast','getBalance','getHistory','getTransaction','listNotes','listUtxos','sync','watchSync','getSyncStatus','close'])assert.equal(typeof wallet[method],'function',method);
    await assert.rejects(wallet.propose({accountId:'account',to:'x',amount:1n}),{code:'INVALID_ARGUMENT'});
    const combined=createZcashClient({wallet,light,public:light});assert.equal(combined.wallet,wallet);assert.equal(combined.light,light);assert.equal(combined.public,light);
    assert.throws(()=>createZcashClient({wallet,light:{network:foreign},public:light}),{code:'NETWORK_MISMATCH'});
    onAbort=()=>{reentrant=wallet.close();};const running=wallet.sync();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(callbacks,1);
    const closing=wallet.close();assert.equal(wallet.close(),closing);assert.throws(()=>wallet.accounts.list(),{code:'CLOSED'});
    await running;await closing;assert.equal(reentrant,closing);assert.equal(closed,1);
    assert.throws(()=>wallet.watchSync(),{code:'CLOSED'});
    const aborted=new AbortController();gate=new Promise(resolve=>{releaseOpen=resolve;});const opening=createWalletClient({...defaults(),signal:aborted.signal});aborted.abort();releaseOpen();await assert.rejects(opening,{code:'ABORTED'});assert.equal(closed,2);
  }finally{await Promise.allSettled(sessions.map(session=>session.close()));mock.reset();}
});
