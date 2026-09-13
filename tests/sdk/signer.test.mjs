import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../dist/src/index.js';
import {signerChecks} from './signer-checks.mjs';
test('custom signer delegates to captured stateful adapter with owned values and real native viewing handles',async()=>{
  assert.deepEqual(await signerChecks(api),{methods:3,ownedBytes:true,actualViewing:true,cancelled:2,verifiedAuthorization:false});
});

test('wallet bound rejects raw and SDK-wrapped adapter output before copying, preserving captured methods',async()=>{
  const {boundedSigner}=await import('../../dist/src/signer.js');
  const {fixture}=await import('./viewing-fixture.mjs');
  const network=await api.defineNetwork({identity:'bounded-signer',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters)});
  const response=new Uint8Array(9),request={requestId:'r',pczt:new Uint8Array([1]),context:{network,targetHeight:100,branchId:1},accountIds:['account'],capabilityRevision:'one',reviewCommitment:'review'};
  let called=0;
  const adapter={getCapabilities:async()=>{},getAccount:async()=>{},authorize:async()=>{called++;return {requestId:'r',pczt:response};}};
  const raw=boundedSigner(adapter,8),wrapped=api.createCustomSigner(adapter);
  adapter.authorize=()=>{throw Error('must preserve captured method');};
  const rebound=boundedSigner(wrapped,8),Original=globalThis.Uint8Array;let copies=0;
  globalThis.Uint8Array=new Proxy(Original,{construct(target,args,newTarget){if(args[0]===response.buffer||args[0]===response)copies++;return Reflect.construct(target,args,newTarget);}});
  try {for(const signer of [raw,rebound])await assert.rejects(signer.authorize(request),{code:'RESOURCE_LIMIT'});}
  finally {globalThis.Uint8Array=Original;}
  assert.equal(called,2);assert.equal(copies,0);
});
