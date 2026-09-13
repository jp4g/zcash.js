// Reproduce with: node scripts/primitive-capsule.mjs --generate VERIFIED_NATIVE_BUILD
// Normal builds only verify/copy the committed capsule; no native build or fetch.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const generatorSha256=sha(await readFile(import.meta.filename));
const lockSha256=sha(await readFile(join(root,'package-lock.json')));
const profiles=[
  {name:'primitive',receipt:'57f268c0976cabc312b8337ab942c59272de0b146d18108d1dcbcab4acb6f346',directory:'primitive',receiptFile:'build.json',artifacts:'primitiveArtifacts',wasm:'bindings_bg.wasm',modules:['bindings.js','bytes.mjs','network.mjs','transaction.mjs']},
  {name:'lightwire',receipt:'bed0c283d44a449c162ce240f332d092b99175c695725f9736b79d19fb24924f',directory:'',receiptFile:'receipt.json',artifacts:'artifacts',wasm:'wasm/zakura_lightwire_bg.wasm',modules:['codec.mjs','wasm/zakura_lightwire.js'],factory:'createLightwire'},
  {name:'transparent-address',receipt:'a5b377630be1496949b17a463767c48af99821c343db8caa0c50aca513a5cc4a',directory:'',receiptFile:'receipt.json',artifacts:'artifacts',wasm:'wasm/zakura_transparent_address_bg.wasm',modules:['codec.mjs','wasm/zakura_transparent_address.js'],factory:'createTransparentAddressCodec'},
];
const generate=process.argv[2]?.startsWith('--generate');
if(generate)assert.equal(process.argv.length,4);else assert.equal(process.argv.length,2);
for(const profile of profiles) {
  if(generate && process.argv[2]!== (profile.name==='primitive'?'--generate':`--generate-${profile.name}`))continue;
  const capsule=join(root,`src/runtime/${profile.name}-capsule.mjs`);
  const receiptPath=join(root,`src/runtime/${profile.name}-capsule.json`);
  const nativeReceipt=profile.receipt;
if (generate) {
  assert.equal(process.argv.length,4);
  const native=resolve(process.argv[3]);
  const receiptBytes=await readFile(join(native,profile.receiptFile));
  assert.equal(sha(receiptBytes),nativeReceipt);
  const receipt=JSON.parse(receiptBytes);
  assert.ok(profile.name==='primitive'?receipt.complete:receipt.status==='built');
  const source=join(native,profile.directory);
  const inputs={};
  for (const [name,hash] of Object.entries(receipt[profile.artifacts])) {
    const bytes=await readFile(join(source,name));assert.equal(sha(bytes),hash,name);inputs[name]=hash;
  }
  const wasm=await readFile(join(source,profile.wasm));
  assert.ok(wasm.length>0 && wasm.length<=(profile.name==='primitive'?3*1048576:1048576));
  const entry=profile.factory?`import {${profile.factory}} from '${join(source,'codec.mjs')}';
let codec;
export function initialize(){return codec??=${profile.factory}(Uint8Array.from(atob('${wasm.toString('base64')}'),c=>c.charCodeAt(0)));}`:`import {initialize as initializeNative,consensusContext,openViewingAuthority,decodeViewingAddress,selectViewingReceiver} from '${join(source,'network.mjs')}';
import {decodeTransaction} from '${join(source,'transaction.mjs')}';
let initialized=false;
export function initialize(){if(!initialized){initializeNative(Uint8Array.from(atob('${wasm.toString('base64')}'),c=>c.charCodeAt(0)));initialized=true;}}
export {consensusContext,decodeTransaction,openViewingAuthority,decodeViewingAddress,selectViewingReceiver};`;
  const {rolldown}=await import('rolldown');
  const bundle=await rolldown({input:'capsule-entry',platform:'neutral',
    plugins:[{name:'capsule-entry',resolveId(id){if(id==='capsule-entry')return '\0capsule-entry';},load(id){if(id==='\0capsule-entry')return entry;}}],
    onLog(level,log){throw Error(`${level}: ${log.code}`);}});
  try {
    const {output}=await bundle.generate({format:'es',comments:false});assert.equal(output.length,1);
    const chunk=output[0];assert.equal(chunk.type,'chunk');assert.deepEqual(chunk.imports,[]);assert.deepEqual(chunk.dynamicImports,[]);
    const modules=Object.keys(chunk.modules).filter(name=>name!=='\0capsule-entry').map(name=>{
      assert.ok(name.startsWith(source+'/'));return name.slice(source.length+1);
    }).sort();
    assert.deepEqual(modules,profile.modules);
    // The unused generated default URL/fetch initializer must be tree-shaken out.
    assert.ok(!/\bfetch\s*\(|import\.meta|\bimport\s*\(/.test(chunk.code));
    const code=chunk.code.replace(/^\/\/#(?:end)?region[^\n]*\n/gm,'');
    await writeFile(capsule,code);
    await writeFile(receiptPath,JSON.stringify({format:'zcash-js-pure-codec-capsule/1',profile:profile.name,generatorSha256,lockSha256,nativeReceipt,nativeRevision:receipt.revision,
      inputs,modules,sha256:sha(code)},null,2)+'\n');
  } finally {await bundle.close();}
} else {
  assert.equal(process.argv.length,2);
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  assert.equal(receipt.nativeReceipt,nativeReceipt);
  assert.equal(receipt.generatorSha256,generatorSha256);
  assert.equal(receipt.lockSha256,lockSha256);
  assert.equal(sha(await readFile(capsule)),receipt.sha256);
  await mkdir(join(root,'dist/src/runtime'),{recursive:true});
  await copyFile(capsule,join(root,`dist/src/runtime/${profile.name}-capsule.mjs`));
  await copyFile(receiptPath,join(root,`dist/src/runtime/${profile.name}-capsule.json`));
  await copyFile(join(root,`src/runtime/${profile.name}-capsule.d.mts`),join(root,`dist/src/runtime/${profile.name}-capsule.d.mts`));
}
}
if(generate)assert.ok(profiles.some(p=>process.argv[2]===(p.name==='primitive'?'--generate':`--generate-${p.name}`)));
