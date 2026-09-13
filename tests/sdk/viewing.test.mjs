// Host admission/lifetime only; actual Rust derivation is qualified with the native capsule.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import * as plumbing from '../../dist/src/clients/owned-plumbing.js';
import * as lifecycle from '../../dist/src/clients/light-chain-reads.js';
import * as primitives from '../../dist/src/primitives.js';
import * as errors from '../../dist/src/errors.js';

test('viewing composition owns native handles, preserves caller cancellation and reparses plain decoded records',async()=>{
  if (!vm.SourceTextModule) { execFileSync(process.execPath,['--experimental-vm-modules',import.meta.filename],{stdio:'pipe'}); return; }
  const network={},calls=[];let freed=0,abortDuring;
  function native(kind='ufvk') {return {
    describe:()=>({kind,components:['p2pkh'],enabledPools:['transparent'],provenance:null}),
    export:(format,ack)=>{assert.equal(ack,'discloses-viewing-authority');if(kind==='uivk'&&format==='ufvk')throw 'FULL_VIEWING_KEY_REQUIRED';return format;},
    toIncoming:()=>native('uivk'),dispose:()=>{freed++;},
    derive:(index,request)=>{calls.push([index,JSON.parse(request)]);return{address:'native',index,receiverTypes:['p2pkh'],intendedPools:['transparent']};},
    find:(index,request,attempts)=>{assert.equal(attempts,3);return{address:'native-found',index,receiverTypes:['p2pkh'],intendedPools:['transparent']};},
  };}
  const codec={openViewingAuthority:(_p,format,encoded,pools)=>{calls.push([format,encoded,JSON.parse(pools)]);abortDuring?.abort();return native();},
    decodeViewingAddress:(_p,encoded)=>({encoded,knownReceivers:['p2pkh'],unknownTypecodes:[]}),
    selectViewingReceiver:(_p,encoded,pool,height,branch)=>{calls.push([encoded,pool,height,branch]);return{pool,type:'p2pkh',bytes:new Uint8Array([7])};}};
  const modules={'./network.js':{networkBinding:n=>{if(n!==network)throw errors.invalidArgument();return{definition:{binding:'same',parameters:{bytes:new Uint8Array([1])}},codec};}},
    './clients/owned-plumbing.js':plumbing,'./clients/light-chain-reads.js':lifecycle,'./primitives.js':primitives,'./errors.js':errors};
  const context=vm.createContext({Object,Array,WeakMap,Uint8Array,Error,JSON,BigInt});
  const module=new vm.SourceTextModule(await readFile(new URL('../../dist/src/viewing.js',import.meta.url),'utf8'),{context});
  await module.link(name=>{const exports=modules[name];assert.ok(exports,name);return new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value);},{context});});await module.evaluate();
  const {accountFromViewingKey,viewing,addresses}=module.namespace;
  const account={...await accountFromViewingKey({network,format:'ufvk',encoded:'fixture',enabledPools:['transparent']})};
  assert.equal(await viewing.export({account,format:'ufvk',acknowledge:'discloses-viewing-authority'}),'ufvk');
  const incoming={...await viewing.toIncoming({account})};await account.viewing.dispose();await account.viewing.dispose();assert.equal(freed,1);
  await assert.rejects(addresses.derive({account,index:0n}),e=>e.code==='CLOSED');
  assert.equal((await addresses.derive({account:incoming,index:3n,request:{format:'transparent'}})).index,3n);
  assert.equal((await addresses.find({account:incoming,start:4n,maxAttempts:3})).address,'native-found');
  await assert.rejects(viewing.export({account:incoming,format:'ufvk',acknowledge:'discloses-viewing-authority'}),e=>e.code==='FULL_VIEWING_KEY_REQUIRED');
  await assert.rejects(addresses.derive({account:incoming,index:0n,request:{format:'unified',transparent:'require',sapling:'omit',ironwood:'omit'}}),e=>e.code==='INVALID_ARGUMENT');
  const decoded=await addresses.decode({network,address:'native'});
  const selected=await addresses.selectReceiver({address:{...decoded,knownReceivers:[]},pool:'transparent',context:{network,targetHeight:1,branchId:2}});
  assert.deepEqual([...selected.bytes],[7]);assert.deepEqual(calls.at(-1),['native','transparent',1,2]);
  let accessed=0;await assert.rejects(addresses.derive({account:incoming,index:0n,request:Object.defineProperty({},'format',{get(){accessed++;return'transparent';}})}),e=>e.code==='INVALID_ARGUMENT');assert.equal(accessed,0);
  const pre=new AbortController();pre.abort();const count=calls.length;await assert.rejects(accountFromViewingKey({network,format:'ufvk',encoded:'fixture',enabledPools:['transparent'],signal:pre.signal}),e=>e.code==='ABORTED');assert.equal(calls.length,count);
  abortDuring=new AbortController();await assert.rejects(accountFromViewingKey({network,format:'ufvk',encoded:'fixture',enabledPools:['transparent'],signal:abortDuring.signal}),e=>e.code==='ABORTED');assert.equal(freed,2,'unpublished native handle freed on cancellation');
  await incoming.viewing.dispose();assert.equal(freed,3);
});
