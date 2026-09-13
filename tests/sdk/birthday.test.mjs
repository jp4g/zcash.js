import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import * as plumbing from '../../dist/src/clients/owned-plumbing.js';
import * as lifecycle from '../../dist/src/clients/light-chain-reads.js';
import * as errors from '../../dist/src/errors.js';
test('birthday composition owns source bytes and preserves cancellation without publishing unchecked state',async()=>{
  if(!vm.SourceTextModule){execFileSync(process.execPath,['--experimental-vm-modules',import.meta.filename],{stdio:'pipe'});return;}
  const network={genesisHash:Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join('')},calls=[];
  const bound={definition:{binding:'fixture',parameters:{bytes:new Uint8Array([1])}},codec:{validateBirthday(...args){calls.push(args);}}};
  const modules={'./network.js':{networkBinding:n=>{assert.equal(n,network);return bound;}},'./clients/owned-plumbing.js':plumbing,'./clients/light-chain-reads.js':lifecycle,'./errors.js':errors,'./runtime/lightwire-capsule.mjs':{initialize:()=>({decodeResponse:()=>({height:'0',hash:network.genesisHash,sapling_tree:'',ironwood_tree:''})})}};
  const context=vm.createContext({Object,Array,Uint8Array,Error,Reflect,Number});
  const module=new vm.SourceTextModule(await readFile(new URL('../../dist/src/birthday.js',import.meta.url),'utf8'),{context});
  await module.link(name=>{const exports=modules[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{context});});await module.evaluate();
  const {resolveBirthday}=module.namespace,encoded=new Uint8Array([1,2]);
  const tree=()=>({network,point:{height:0,hash:network.genesisHash},sapling:null,ironwood:null,encoded,sourceId:'fixture',observedAt:'2026-09-12T00:00:00Z'});
  let requests=0;
  const light={network,async getTreeState(args){requests++;assert.equal(args.height,0);return tree();}};
  const value=await resolveBirthday({light,firstScanHeight:1,recoverUntilExclusive:1});
  encoded.fill(9);assert.deepEqual([...value.priorTreeState],[1,2]);assert.equal(value.source,'light-client');assert.equal(calls.length,1);assert.deepEqual([...calls[0][1]],Array.from({length:32},(_,i)=>31-i));
  await assert.rejects(resolveBirthday({light,firstScanHeight:1,signal:{}}),e=>e.code==='INVALID_ARGUMENT');assert.equal(requests,1);
  await assert.rejects(resolveBirthday({light,firstScanHeight:0}),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(resolveBirthday({light,firstScanHeight:1,signal:AbortSignal.abort()}),e=>e.code==='ABORTED');assert.equal(requests,1);
  await assert.rejects(resolveBirthday({light:{network,async getTreeState(){return {...tree(),point:{height:1,hash:network.genesisHash}};}},firstScanHeight:1}),e=>e.code==='PROTOCOL_MISMATCH');
  const shadow=new AbortController();let getters=0,shadowRequests=0,releaseShadow;
  Object.defineProperty(shadow.signal,'aborted',{get(){getters++;return true;}});
  const shadowRead=resolveBirthday({light:{network,getTreeState(){shadowRequests++;return new Promise(resolve=>{releaseShadow=resolve;});}},firstScanHeight:1,signal:shadow.signal});
  shadow.abort();
  let timer;
  try { await assert.rejects(Promise.race([shadowRead,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('shadow signal stalled')),100);})]),e=>e.code==='INVALID_ARGUMENT'); }
  finally {clearTimeout(timer);releaseShadow?.(tree());}
  assert.equal(getters,0);assert.equal(shadowRequests,0);
  const controller=new AbortController();let release;
  const pending=resolveBirthday({light:{network,getTreeState(){return new Promise(resolve=>{release=resolve;});}},firstScanHeight:1,signal:controller.signal});
  controller.abort();await assert.rejects(pending,e=>e.code==='ABORTED');release(tree());assert.equal(calls.length,1);
});
