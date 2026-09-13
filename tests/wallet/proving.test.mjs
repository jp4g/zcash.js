import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ProvingAssets,saplingAssets} from '../../dist/src/wallet/proving-assets.js';
const requirements=saplingAssets.map((asset,i)=>({pool:asset.pool,circuitVersion:asset.circuitVersion,assetId:asset.assetId,format:asset.format,byteLength:asset.byteLength,digest:{algorithm:i?'blake2b512':'sha256',hex:i?asset.blake2b512:asset.sha256}}));
const maximum=saplingAssets.reduce((sum,value)=>sum+value.byteLength,0);
const options=(loadAsset,cache={kind:'memory',maxBytes:maximum})=>({kind:'local',assets:requirements,loadAsset,cache,maxConcurrentProofs:1});
test('proving asset admission and cancellation preserve exact callback authority',async()=>{
  assert.throws(()=>new ProvingAssets({...options(()=>{}),assets:[{...requirements[0],digest:{algorithm:'sha256',hex:'00'.repeat(32)}}]}),{code:'ASSET_INTEGRITY'});
  let calls=0;const small=new ProvingAssets(options(()=>{calls++;},{kind:'memory',maxBytes:1}));
  await assert.rejects(small.sapling(),{code:'RESOURCE_LIMIT'});assert.equal(calls,0);await small.close();
  let started,delivered;const entered=new Promise(resolve=>{started=resolve;});
  const configured=options(function({requirement,signal}){assert.equal(this,configured);assert.ok(Object.isFrozen(requirement));assert.ok(Object.isFrozen(requirement.digest));calls++;started();return new Promise(resolve=>{delivered=resolve;signal.addEventListener('abort',()=>{}, {once:true});});});
  const assets=new ProvingAssets(configured),pending=assets.sapling();await entered;
  const rejection=assert.rejects(pending,{code:'ABORTED'});await assets.close();await rejection;
  delivered(new Uint8Array());await assert.rejects(assets.sapling(),{code:'CLOSED'});
});
test('canonical proving assets are verified on memory and persistent cache retrieval',{skip:!process.env.PCZT_PROVING_PARAMETERS},async()=>{
  const namespace='test-'+crypto.randomUUID();
  const directory=join(homedir(),'.cache','zakura','zakura-proving-'+createHash('sha256').update(namespace).digest('hex'));
  let loads=0;
  const load=async({requirement})=>{loads++;return readFile(join(process.env.PCZT_PROVING_PARAMETERS,requirement.assetId));};
  const memory=new ProvingAssets(options(load));
  try {
    const first=await memory.sapling();assert.equal(first.spend.byteLength,saplingAssets[0].byteLength);
    await memory.sapling();assert.equal(loads,2,'verified memory hits do not reload');
    first.spend[0]^=1;await assert.rejects(memory.sapling(),{code:'ASSET_INTEGRITY'});
  }finally{await memory.close();}
  const cache={kind:'persistent',namespace,maxBytes:maximum};
  const initial=new ProvingAssets(options(load,cache));
  try{await initial.sapling();}finally{await initial.close();}
  const before=loads,reopened=new ProvingAssets(options(()=>{throw Error('unexpected reload');},cache));
  try{await reopened.sapling();assert.equal(loads,before);}finally{await reopened.close();}
  await writeFile(join(directory,saplingAssets[0].sha256),new Uint8Array([1]));
  const corrupt=new ProvingAssets(options(load,cache));
  try{await assert.rejects(corrupt.sapling(),{code:'ASSET_INTEGRITY'});assert.equal(loads,before,'corrupt cache is never parsed or silently accepted');}
  finally{await corrupt.close();await rm(directory,{recursive:true,force:true});}
});
