// Account method composition/ownership only; native deletion and key matching have native fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {walletAccounts} from '../../dist/src/wallet/accounts.js';
import {defineNetwork,accountFromViewingKey} from '../../dist/src/index.js';
import {fixture} from '../sdk/viewing-fixture.mjs';
const network=await defineNetwork({identity:'accounts-test',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters)});
function wallet(){
  let record={id:'account',name:null,birthdayHeight:1,accountIndex:0,viewOnly:false,signerAttached:false},checks=0,deleted=0;
  const value={close:async()=>{},owner:{check(){}},session:{check(){},accounts:{
    async get(){return record;},async list(){return record?[record]:[];},
    async checkKey({viewingKey}){assert.equal(viewingKey,fixture.ufvk);checks++;return 'ready';},
    async remove({acknowledge}){assert.equal(acknowledge,'deletes-local-history');record=null;deleted++;},
    async import(args){assert.equal(args.viewingKey,fixture.ufvk);return record;},
  }}};
  return {value,counts:()=>({checks,deleted}),imported(){record.accountIndex=null;}};
}
test('account binding uses independently owned descriptor and never disposes caller signer',async()=>{
  const f=wallet(),accounts=walletAccounts(f.value,network).api;let calls=0,disposed=0;
  const signer={getCapabilities:async()=>{throw Error('unused');},authorize:async()=>{throw Error('unused');},dispose:async()=>{disposed++;},
    async getAccount({selector}){calls++;assert.deepEqual(selector,{kind:'derived',accountIndex:0});return accountFromViewingKey({network,format:'ufvk',encoded:fixture.ufvk,enabledPools:['sapling']});}};
  const binding=await accounts.attachSigner({accountId:'account',signer});
  assert.equal(binding.state,'ready');assert.equal((await accounts.get({accountId:'account'})).signerAttached,true);
  await accounts.detachSigner({accountId:'account'});await binding.dispose();assert.equal(disposed,0);
  assert.equal((await accounts.list())[0].signerAttached,false);
  await accounts.attachSigner({accountId:'account',signer});
  await accounts.remove({accountId:'account',acknowledge:'deletes-local-history'});
  assert.equal(await accounts.get({accountId:'account'}),null);assert.equal(disposed,0);assert.equal(calls,2);
  assert.deepEqual(f.counts(),{checks:2,deleted:1});
});
test('unknown imported generic selector and pre-abort reject without calling signer',async()=>{
  const f=wallet(),accounts=walletAccounts(f.value,network).api;f.imported();let calls=0;
  const signer={getAccount:async()=>{calls++;throw Error('must not guess');}};
  await assert.rejects(accounts.attachSigner({accountId:'account',signer}),{code:'SIGNER_CAPABILITY_MISMATCH'});
  await assert.rejects(accounts.attachSigner({accountId:'account',signer,signal:AbortSignal.abort()}),{code:'ABORTED'});
  assert.equal(calls,0);
});
test('close clears attachments and rejects late custom descriptor publication',async()=>{
  const f=wallet(),composition=walletAccounts(f.value,network);let finish;
  const descriptor=await accountFromViewingKey({network,format:'ufvk',encoded:fixture.ufvk,enabledPools:['sapling']});
  const signer={getCapabilities:async()=>{},authorize:async()=>{},getAccount:async()=>new Promise(resolve=>finish=resolve)};
  const attaching=composition.api.attachSigner({accountId:'account',signer});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  await composition.close();finish(descriptor);
  await assert.rejects(attaching,{code:'CLOSED'});
  assert.throws(()=>composition.attachedSigner('account'),{code:'CLOSED'});
});
test('committed mnemonic account presentation failure retains original error and receipt',async()=>{
  const original=Object.assign(Error('capability failure'),{code:'RUNTIME_UNAVAILABLE'});let released=0,leases=0,receipt;
  const f=wallet();
  f.value.owner={check(){},identity:{},maxPcztBytes:4194304,retain(){leases++;return async()=>{leases--;};},invalidate:async()=>{},
    signers:{describe:async()=>{throw original;},release:async()=>{released++;}}};
  f.value.session.mnemonic={import:async()=>({account:{id:'committed-account'},signerToken:1})};
  f.value.session.committed=(error,value)=>{assert.equal(error,original);receipt=value;};
  const {api}=walletAccounts(f.value,network);
  await assert.rejects(api.import({mnemonic:new Uint8Array([1]),accountIndex:0,birthday:'fullScan'}),error=>error===original);
  assert.deepEqual(receipt,{account:{id:'committed-account'}});assert.equal(released,1);assert.equal(leases,0);
});
