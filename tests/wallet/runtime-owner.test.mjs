// Fault injection at the bootstrap cleanup boundary, not native qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {Worker,MessageChannel} from 'node:worker_threads';
import {walletProfile} from '../../dist/src/runtime/wallet-profile.js';

for (const failing of ['release','close']) test(`failed open invalidates shared owner when ${failing} fails`, async t => {
  const root=await mkdtemp(join(tmpdir(),'wallet-owner-cleanup-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const identity={...walletProfile,mode:'baseline',buildSha256:'0'.repeat(64),dependencyGraphSha256:'1'.repeat(64),memory:{initialPages:307,maximumPages:4096,shared:false}};
  const {memory,...expected}=identity;
  await writeFile(join(root,'native.mjs'),`
    export const runtimeIdentity=${JSON.stringify(identity)};
    export const consensusContext=()=>{};
    export const initializeWalletRuntime=()=>({invalid:false,open(){${failing==='release'?"throw 'NETWORK_MISMATCH'":"return {}"};}});
    export const viewsForStorage=()=>{let reads=0;return {get generation(){if(!reads++)throw Error('INVALID_ARGUMENT');return 1},instance:'fixture',close(){throw Error('cleanup')}};};
  `);
  await writeFile(join(root,'host.mjs'),`export const acquire=async()=>({owned:true,release(){${failing==='release'?"throw Error('cleanup')":''};}});`);
  const worker=new Worker(new URL('../../dist/src/runtime/wallet-worker.js',import.meta.url));
  const channel=new MessageChannel();
  t.after(async()=>{channel.port1.close();channel.port2.close();await worker.terminate();});
  const reply=async data=>{const answer=once(worker,'message',{signal:AbortSignal.timeout(5000)});worker.postMessage(data,data.port?[data.port]:[]);return (await answer)[0];};
  assert.equal((await reply({id:1,type:'initialize',moduleUrl:pathToFileURL(join(root,'native.mjs')).href,wasm:new Uint8Array([0]),expected,maxMemoryBytes:512*1024*1024})).type,'ready');
  const result=await reply({id:2,type:'open',storage:{kind:'node-filesystem',path:root},hostUrl:pathToFileURL(join(root,'host.mjs')).href,parametersFormat:'zcash-js-network/1',parameters:new Uint8Array([1]),genesis:new Uint8Array(32),port:channel.port2});
  assert.equal(result.type,'failure');assert.equal(result.fatal,true);
  assert.equal(result.code,failing==='release'?'STORAGE_ERROR':'INVALID_ARGUMENT');
});
