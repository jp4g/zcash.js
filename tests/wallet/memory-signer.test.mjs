// Composition admission/lifetime checks; actual authorization is qualified with native signer fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {memorySigner} from '../../dist/src/wallet/memory-signer.js';
import {defineNetwork,viewing} from '../../dist/src/index.js';
import {fixture} from '../sdk/viewing-fixture.mjs';
const parameters=new TextEncoder().encode(fixture.parameters);
const network=await defineNetwork({identity:'memory-signer-test',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters});
function owner(overrides={}) {
  let disposed=0;
  const identity={parameters:Buffer.from(parameters).toString('hex'),genesis:'03'.repeat(32)};
  const authority={check(){},
    describe:async()=>({...identity,accountIndex:0,viewingKey:fixture.ufvk}),
    capabilities:async()=>({...identity,revision:'zakura-memory-signer/1',authorizations:[],accountDiscovery:'explicit-index',exportableViewing:['ufvk','uivk'],maxPcztBytes:4*1024*1024}),
    dispose:async()=>{disposed++;},authorize:async()=>{throw Error('must not sign');},...overrides,
  };
  return {authority,disposed:()=>disposed};
}
test('memory signer closes transferred authority on invalid network/identity and preserves original error',async()=>{
  const invalid=owner();await assert.rejects(memorySigner({},invalid.authority),{code:'INVALID_ARGUMENT'});assert.equal(invalid.disposed(),1);
  const wrong=owner({describe:async()=>({parameters:'00',genesis:'03'.repeat(32),accountIndex:0})});
  await assert.rejects(memorySigner(network,wrong.authority),{code:'NETWORK_MISMATCH'});assert.equal(wrong.disposed(),1);
  const original=Error('describe failed'),broken=owner({describe:async()=>{throw original;},dispose:async()=>{throw Error('cleanup');}});
  await assert.rejects(memorySigner(network,broken.authority),error=>error===original);
});
test('memory signer publishes independent actual native viewing authority and owns capabilities',async()=>{
  const native=owner(),signer=await memorySigner(network,native.authority);
  const first=await signer.getCapabilities();first.networks[0]='changed';
  assert.equal((await signer.getCapabilities()).networks[0],network.identity);
  const account=await signer.getAccount({network,selector:{kind:'derived',accountIndex:0}});
  assert.equal(account.provenance.accountIndex,0);
  const second=await signer.getAccount({network,selector:{kind:'derived',accountIndex:0}});
  await account.viewing.dispose();
  await assert.rejects(signer.getAccount({network,selector:{kind:'derived',accountIndex:1}}),{code:'SIGNER_CAPABILITY_MISMATCH'});
  const dispose=signer.dispose();assert.equal(signer.dispose(),dispose);await dispose;assert.equal(native.disposed(),1);
  assert.equal(await viewing.export({account:second,format:'ufvk',acknowledge:'discloses-viewing-authority'}),fixture.ufvk);
  await second.viewing.dispose();await assert.rejects(signer.getCapabilities(),{code:'CLOSED'});
});
test('memory signer rejects canceled, stale-capability and oversized requests before native authorization',async()=>{
  const native=owner(),signer=await memorySigner(network,native.authority);
  try {
    await assert.rejects(signer.getAccount({network,selector:{kind:'derived',accountIndex:0},signal:AbortSignal.abort()}),{code:'ABORTED'});
    const request={requestId:'one',pczt:new Uint8Array([1]),context:{network,targetHeight:100,branchId:1},accountIds:['routing'],reviewCommitment:'review',capabilityRevision:'stale'};
    await assert.rejects(signer.authorize(request),{code:'SIGNER_CAPABILITY_MISMATCH'});
    await assert.rejects(signer.authorize({...request,pczt:new Uint8Array(4*1024*1024+1)}),{code:'RESOURCE_LIMIT'});
  } finally {await signer.dispose();}
});

test('cached memory signer methods observe retained owner invalidation',async()=>{
  let invalid=false;
  const crashed=Object.assign(Error('worker failed'),{code:'WORKER_CRASHED'});
  const native=owner({check(){if(invalid)throw crashed;}}),signer=await memorySigner(network,native.authority);
  invalid=true;
  await assert.rejects(signer.getCapabilities(),error=>error===crashed);
  await assert.rejects(signer.getAccount({network,selector:{kind:'derived',accountIndex:0}}),error=>error===crashed);
  await signer.dispose();
});
