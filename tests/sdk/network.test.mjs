import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=resolve(import.meta.dirname,'../..');
const parameters=()=>new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
const definition=()=>({identity:'synthetic-regtest',genesisHash:'03'.repeat(32),parametersFormat:'zcash-js-network/1',parameters:parameters()});

test('packed defineNetwork uses one lazy native capsule, owns input, and admits only real instances',async()=>{
  const scratch=await mkdtemp(join(tmpdir(),'packed-network-'));
  const [packed]=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',scratch],{cwd:root,encoding:'utf8'}));
  const paths=packed.files.map(file=>file.path);
  for(const name of ['primitive-capsule.mjs','primitive-capsule.json','primitive-capsule.d.mts'])assert.ok(paths.includes('dist/src/runtime/'+name));
  await mkdir(join(scratch,'unpacked'));
  execFileSync('tar',['-xzf',join(scratch,packed.filename),'-C',join(scratch,'unpacked')]);
  const pkg=join(scratch,'unpacked/package');
  const manifest=JSON.parse(await readFile(join(pkg,'package.json'),'utf8'));
  let modules=0,instances=0,fetches=0;
  const originalModule=WebAssembly.Module,originalInstance=WebAssembly.Instance,originalFetch=globalThis.fetch;
  WebAssembly.Module=new Proxy(originalModule,{construct(target,args){modules++;return Reflect.construct(target,args);}});
  WebAssembly.Instance=new Proxy(originalInstance,{construct(target,args){instances++;return Reflect.construct(target,args);}});
  globalThis.fetch=()=>{fetches++;throw Error('unexpected network');};
  try {
    const sdk=await import(pathToFileURL(join(pkg,manifest.exports['.'].import)));
    const {networkBinding}=await import(pathToFileURL(join(pkg,'dist/src/network.js')));
    assert.equal(modules,0);assert.equal(instances,0,'SSR import does not initialize native code');
    const reject=(args,code='INVALID_ARGUMENT')=>assert.rejects(sdk.defineNetwork(args),e=>sdk.isZcashError(e)&&e.code===code);
    await reject({...definition(),signal:AbortSignal.abort()},'ABORTED');
    await reject({...definition(),extra:true});
    let getters=0;const accessor=definition();Object.defineProperty(accessor,'identity',{get(){getters++;throw Error('secret');}});
    await reject(accessor);assert.equal(getters,0);
    await reject({...definition(),parameters:new Uint8Array(257)},'RESOURCE_LIMIT');
    await reject({...definition(),parameters:new Uint8Array(new SharedArrayBuffer(256))});
    await reject({...definition(),parameters:parameters().subarray(1)});
    await reject({...definition(),genesisHash:'AB'.repeat(32)});
    await reject({...definition(),signal:new Proxy(new AbortController().signal,{})});
    const cancel=new AbortController();const pending=sdk.defineNetwork({...definition(),signal:cancel.signal});cancel.abort();
    await assert.rejects(pending,e=>e.code==='ABORTED');assert.equal(modules,0);
    const input=definition(),original=parameters();
    const created=sdk.defineNetwork(input);input.parameters.fill(0);input.identity='mutated';
    const network=await created;
    assert.deepEqual(Object.keys(network),['identity','genesisHash']);assert.ok(Object.isFrozen(network));
    assert.equal(network.identity,'synthetic-regtest');assert.equal(modules,1);assert.equal(instances,1);
    const binding=networkBinding(network);
    assert.deepEqual(binding.definition.parameters.bytes,original);
    const copy=binding.definition.parameters.bytes;copy.fill(0);
    assert.deepEqual(binding.definition.parameters.bytes,original);
    assert.deepEqual(binding.codec.consensusContext(binding.definition.parametersFormat,original,20),{height:20,branchId:0x76b809bb});
    assert.throws(()=>networkBinding({...network}),e=>e.code==='INVALID_ARGUMENT');
    const synthetic=new AbortController();synthetic.signal.dispatchEvent(new Event('abort'));
    assert.equal((await sdk.defineNetwork({...definition(),signal:synthetic.signal})).identity,network.identity);
    assert.equal(modules,1);assert.equal(instances,1);assert.equal(fetches,0);
    console.log(JSON.stringify({packed:scratch,modules,instances,fetches}));
  } finally {WebAssembly.Module=originalModule;WebAssembly.Instance=originalInstance;globalThis.fetch=originalFetch;}
});
