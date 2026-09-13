// Worker/lease failure injection. Actual mnemonic/USK qualification uses the native artifact matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel,Worker} from 'node:worker_threads';
import {attachWalletWorker} from '../../dist/src/wallet/host.js';
import {installWalletWorker} from '../../dist/src/wallet/worker.js';
import {createMnemonicAccount} from '../../dist/src/wallet/mnemonic.js';

function fixture(t, options={}) {
  const budget={jobs:0,bytes:0,active:false,wake:new Set(),signers:new Map()};
  let leases=0,issued=0,released=0,invalidations=0;const live=new Set(),secrets=[];
  const limits={maxQueuedJobs:options.jobs??4,maxQueuedBytes:4096};
  const authorityChannel=new MessageChannel();
  installWalletWorker(undefined,authorityChannel.port2,()=>false,{
    describe(token){if(!live.has(token))throw 'STALE_HANDLE';return {parameters:'00',genesis:'00'.repeat(32),accountIndex:0,viewingKey:'fixture'};},
    capabilities(token){if(!live.has(token))throw 'STALE_HANDLE';return {revision:'native-test',maxPcztBytes:4194304};},
    authorize(token,format,parameters,genesis,height,branch,bytes,maximum){if(!live.has(token))throw 'STALE_HANDLE';if(bytes[0]===0)throw 'INVALID_PCZT';return bytes;},
    release(token){if(options.releaseFailure)throw Error('failure');if(!live.delete(token))throw 'STALE_HANDLE';released++;},
  });
  const authorityHost=attachWalletWorker(authorityChannel.port1,async()=>authorityChannel.port2.close(),limits,budget);
  const owner={identity:{},signers:authorityHost.signers,invalidate:async()=>{invalidations++;live.clear();authorityHost.crashed();for(const w of wallets)w.session.crashed();},retain(){leases++;let done=false;return async()=>{if(!done){done=true;leases--;}};}};
  const wallets=[];
  function wallet(){
    const channel=new MessageChannel();
    installWalletWorker({generation:wallets.length+1,instance:'test',close(){},bindSigner(){return 'ready';},unbindSigner(){},
      call(_g,_i,op,args,_seed,mnemonic,passphrase){
        if(op.includes('mnemonic')){secrets.push(mnemonic,passphrase);const token=++issued;live.add(token);options.abort?.abort();return {account:{id:'account'},signerToken:token};}
        return options.read?.()??[];
      }},channel.port2);
    const session=attachWalletWorker(channel.port1,async()=>channel.port2.close(),limits,budget);
    const value={session,owner,close:()=>session.close()};wallets.push(value);return value;
  }
  t.after(async()=>{for(const w of wallets)await w.close().catch(()=>{});await authorityHost.close().catch(()=>{});});
  return {wallet,owner,secrets,budget,counts:()=>({leases,released}),invalidations:()=>invalidations};
}
const args=()=>({mnemonic:new Uint8Array([9,8,7]),passphrase:new Uint8Array([6,5]),accountIndex:0,birthday:'fullScan'});

test('mnemonic bridge owns and clears secret copies; native authority survives database close',async t=>{
  const f=fixture(t),wallet=f.wallet(),input=args();
  const result=await createMnemonicAccount(wallet,'import',input);
  assert.equal(f.counts().leases,1);
  assert.deepEqual([...input.mnemonic],[9,8,7]);assert.deepEqual([...input.passphrase],[6,5]);
  for(const copy of f.secrets)assert.ok(copy.every(n=>n===0));
  const other=f.wallet();assert.equal(await result.authority.bind(other,'account'),'ready');
  await wallet.close();assert.equal((await result.authority.describe()).accountIndex,0);
  await result.authority.unbind(other,'account');
  const closing=result.authority.dispose();assert.equal(result.authority.dispose(),closing);await closing;
  assert.deepEqual(f.counts(),{leases:0,released:1});
  assert.throws(()=>result.authority.describe(),{code:'CLOSED'});
  await assert.rejects(f.owner.signers.describe({token:1}),{code:'STALE_HANDLE'});
  assert.deepEqual(await other.session.accounts.list(),[]);
});
test('canceled committed mnemonic creation releases unpublished token and retains account receipt',async t=>{
  const abort=new AbortController(),f=fixture(t,{abort}),wallet=f.wallet(),input=args();let rejected;
  await assert.rejects(createMnemonicAccount(wallet,'import',{...input,signal:abort.signal}),error=>{rejected=error;return error.code==='ABORTED';});
  assert.equal(wallet.session.completion(rejected).completion,'committed');
  assert.equal(wallet.session.completion(rejected).value.account.id,'account');
  assert.deepEqual(f.counts(),{leases:0,released:1});
  for(const copy of f.secrets)assert.ok(copy.every(n=>n===0));
  assert.deepEqual([...input.mnemonic],[9,8,7]);
  assert.deepEqual(await wallet.session.accounts.list(),[]);
});
test('issued signer cleanup gets one reserved control when ordinary queue is full',async t=>{
  let unblock;let gated=false;
  const f=fixture(t,{jobs:1,read:()=>gated?new Promise(resolve=>unblock=()=>resolve([])):[]}),wallet=f.wallet();
  const result=await createMnemonicAccount(wallet,'import',args());gated=true;
  const reading=wallet.session.accounts.list();
  while(!unblock)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(wallet.session.accounts.list(),{code:'RESOURCE_LIMIT'});
  const closing=result.authority.dispose();assert.equal(result.authority.dispose(),closing);
  await assert.rejects(f.owner.signers.release({token:999}),{code:'STALE_HANDLE'});
  assert.equal(f.budget.jobs,2);unblock();await reading;await closing;
  assert.equal(f.counts().released,1);assert.equal(f.budget.jobs,0);gated=false;
});
test('failed unpublished-token cleanup invalidates owner and preserves committed account receipt',async t=>{
  const abort=new AbortController(),f=fixture(t,{abort,releaseFailure:true}),wallet=f.wallet();let rejected;
  await assert.rejects(createMnemonicAccount(wallet,'import',{...args(),signal:abort.signal}),error=>{rejected=error;return error.code==='ABORTED';});
  assert.equal(wallet.session.completion(rejected).value.account.id,'account');
  assert.equal(f.invalidations(),1);assert.equal(f.counts().leases,0);
});
test('failed dispatch clears owned mnemonic without changing caller bytes',async()=>{
  let copied;
  const host=attachWalletWorker({start(){},close(){},postMessage(value){copied=value.args.mnemonic;throw Error('dispatch');}},async()=>{}, {maxQueuedJobs:1,maxQueuedBytes:4096});
  const input=args();await assert.rejects(host.mnemonic.import(input),{code:'WORKER_CRASHED'});
  assert.ok(copied.every(n=>n===0));assert.deepEqual([...input.mnemonic],[9,8,7]);
});
test('browser host admission rejects shadow signal state without invoking getters',async t=>{
  const module=new URL('../../dist/src/wallet/host.js',import.meta.url).href;
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.process=undefined;
    (async()=>{const {attachWalletWorker}=await import(${JSON.stringify(module)});let getters=0,requests=0;
      const host=attachWalletWorker({start(){},close(){},postMessage(){requests++;}},async()=>{},{maxQueuedJobs:1,maxQueuedBytes:4096});
      const controller=new AbortController();Object.defineProperty(controller.signal,'aborted',{get(){getters++;return true;}});
      let code;try{await host.accounts.list({signal:controller.signal});}catch(error){code=error.code;}
      parentPort.postMessage({code,getters,requests});
    })().catch(error=>{throw error;});`,{eval:true});
  t.after(()=>worker.terminate());
  const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  assert.deepEqual(result,{code:'INVALID_ARGUMENT',getters:0,requests:0});
});

test('signer owner routes bound authorization bytes and known errors without poisoning sibling wallet',async t=>{
  const f=fixture(t),wallet=f.wallet(),{authority}=await createMnemonicAccount(wallet,'import',args());
  assert.equal((await authority.capabilities()).revision,'native-test');
  const bytes=new Uint8Array([1,2]);
  const input={format:'test',parameters:new Uint8Array([1]),genesis:new Uint8Array(32),height:1,branch:1,bytes,maximum:4194304};
  const signed=authority.authorize(input);bytes.fill(8);assert.deepEqual([...await signed],[1,2]);
  await assert.rejects(authority.authorize({...input,bytes:new Uint8Array([0])}),{code:'INVALID_PCZT',stage:'authorization'});
  assert.equal((await authority.capabilities()).revision,'native-test');
  assert.deepEqual(await wallet.session.accounts.list(),[]);await authority.dispose();
});
