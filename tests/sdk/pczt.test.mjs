// Boundary/lifetime doubles only; native PCZT qualification is a separate actual artifact run.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import * as plumbing from '../../dist/src/clients/owned-plumbing.js';
import * as lifecycle from '../../dist/src/clients/light-chain-reads.js';
import * as errors from '../../dist/src/errors.js';
test('PCZT boundary owns context and independently disposes transformed values',async()=>{
  if(!vm.SourceTextModule){execFileSync(process.execPath,['--experimental-vm-modules',import.meta.filename],{stdio:'pipe'});return;}
  const network={genesisHash:'03'.repeat(32)};let frees=0,parses=0,abortDuring;
  const native=()=>({serialize:()=>new Uint8Array([1,2]),inspect:()=>({pcztVersion:1,transactionVersion:5,pools:['transparent'],proofsComplete:true,authorizationComplete:false}),combine:()=>native(),redact:()=>native(),dispose(){frees++;}});
  const codec={parseStandalonePczt(_p,_g,_h,_b,bytes,maximum){parses++;assert.ok(bytes.length<=maximum);abortDuring?.abort();return native();}};
  const modules={'./network.js':{networkBinding:n=>{assert.equal(n,network);return{definition:{binding:'x',parameters:{bytes:new Uint8Array([1])}},codec};}},'./clients/owned-plumbing.js':plumbing,'./clients/light-chain-reads.js':lifecycle,'./errors.js':errors};
  const context=vm.createContext({Object,Array,Uint8Array,Error,Number,WeakMap,Math});
  const module=new vm.SourceTextModule(await readFile(new URL('../../dist/src/pczt.js',import.meta.url),'utf8'),{context});
  await module.link(name=>{const exports=modules[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();
  const api=module.namespace.pczt,chain={network,targetHeight:70,branchId:1};
  const first=await api.parse({bytes:new Uint8Array([1]),context:chain,maxBytes:10});chain.targetHeight=99;
  assert.equal((await api.inspect({pczt:first})).context.targetHeight,70);
  const combined=await api.combine({pczts:[first]}),redacted=await api.redact({pczt:first,profile:'zakura-signer-full/1'});
  await first.dispose();await first.dispose();assert.equal(frees,1);
  await assert.rejects(api.serialize({pczt:first}),e=>e.code==='CLOSED');
  assert.deepEqual([...await api.serialize({pczt:combined})],[1,2]);
  const inspection=await api.inspect({pczt:redacted});inspection.context.targetHeight=1;inspection.pools.length=0;
  assert.equal((await api.inspect({pczt:redacted})).context.targetHeight,70);
  await assert.rejects(api.combine({pczts:[]}),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(api.parse({bytes:new Uint8Array(2),context:chain,maxBytes:1}),e=>e.code==='RESOURCE_LIMIT');
  let getters=0;await assert.rejects(api.parse({bytes:new Uint8Array(1),context:chain,get maxBytes(){getters++;return 2;}}),e=>e.code==='INVALID_ARGUMENT');assert.equal(getters,0);
  const revoked=Proxy.revocable({},{});revoked.revoke();await assert.rejects(api.parse(revoked.proxy),e=>e.code==='INVALID_ARGUMENT');
  let lengthReads=0;
  const aliases=new Proxy([combined],{get(target,key,receiver){if(key==='length'){lengthReads++;return 1000000;}return Reflect.get(target,key,receiver);}});
  const copied=await api.combine({pczts:aliases});await copied.dispose();assert.equal(lengthReads,0);
  const large=await api.parse({bytes:new Uint8Array(4*1024*1024+1),context:chain,maxBytes:5*1024*1024});await large.dispose();
  abortDuring=new AbortController();await assert.rejects(api.parse({bytes:new Uint8Array([1]),context:chain,maxBytes:2,signal:abortDuring.signal}),e=>e.code==='ABORTED');assert.equal(frees,4);
  await combined.dispose();await redacted.dispose();assert.equal(frees,6);assert.equal(parses,3);
});
