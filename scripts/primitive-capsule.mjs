// Reproduce with: node scripts/primitive-capsule.mjs --generate VERIFIED_NATIVE_BUILD
// Normal builds only verify/copy the committed capsule; no native build or fetch.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const capsule=join(root,'src/runtime/primitive-capsule.mjs');
const receiptPath=join(root,'src/runtime/primitive-capsule.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const generatorSha256=sha(await readFile(import.meta.filename));
const lockSha256=sha(await readFile(join(root,'package-lock.json')));
const nativeReceipt='57f268c0976cabc312b8337ab942c59272de0b146d18108d1dcbcab4acb6f346';
if (process.argv[2]==='--generate') {
  assert.equal(process.argv.length,4);
  const native=resolve(process.argv[3]);
  const receiptBytes=await readFile(join(native,'build.json'));
  assert.equal(sha(receiptBytes),nativeReceipt);
  const receipt=JSON.parse(receiptBytes);
  assert.equal(receipt.complete,true);
  const inputs={};
  for (const [name,hash] of Object.entries(receipt.primitiveArtifacts)) {
    const bytes=await readFile(join(native,'primitive',name));assert.equal(sha(bytes),hash,name);inputs[name]=hash;
  }
  const wasm=await readFile(join(native,'primitive/bindings_bg.wasm'));
  assert.ok(wasm.length>0 && wasm.length<=1048576);
  const entry=`import {initialize as initializeNative,consensusContext} from '${join(native,'primitive/network.mjs')}';
import {decodeTransaction} from '${join(native,'primitive/transaction.mjs')}';
let initialized=false;
export function initialize(){if(!initialized){initializeNative(Uint8Array.from(atob('${wasm.toString('base64')}'),c=>c.charCodeAt(0)));initialized=true;}}
export {consensusContext,decodeTransaction};`;
  const {rolldown}=await import('rolldown');
  const bundle=await rolldown({input:'capsule-entry',platform:'neutral',
    plugins:[{name:'capsule-entry',resolveId(id){if(id==='capsule-entry')return '\0capsule-entry';},load(id){if(id==='\0capsule-entry')return entry;}}],
    onLog(level,log){throw Error(`${level}: ${log.code}`);}});
  try {
    const {output}=await bundle.generate({format:'es',comments:false});assert.equal(output.length,1);
    const chunk=output[0];assert.equal(chunk.type,'chunk');assert.deepEqual(chunk.imports,[]);assert.deepEqual(chunk.dynamicImports,[]);
    const modules=Object.keys(chunk.modules).filter(name=>name!=='\0capsule-entry').map(name=>{
      assert.ok(name.startsWith(join(native,'primitive')+'/'));return name.slice(join(native,'primitive').length+1);
    }).sort();
    assert.deepEqual(modules,['bindings.js','bytes.mjs','network.mjs','transaction.mjs']);
    // The unused generated default URL/fetch initializer must be tree-shaken out.
    assert.ok(!/\bfetch\s*\(|import\.meta|\bimport\s*\(/.test(chunk.code));
    const code=chunk.code.replace(/^\/\/#(?:end)?region[^\n]*\n/gm,'');
    await writeFile(capsule,code);
    await writeFile(receiptPath,JSON.stringify({format:'zcash-js-pure-codec-capsule/1',generatorSha256,lockSha256,nativeReceipt,nativeRevision:receipt.revision,
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
  await copyFile(capsule,join(root,'dist/src/runtime/primitive-capsule.mjs'));
  await copyFile(receiptPath,join(root,'dist/src/runtime/primitive-capsule.json'));
  await copyFile(join(root,'src/runtime/primitive-capsule.d.mts'),join(root,'dist/src/runtime/primitive-capsule.d.mts'));
}
