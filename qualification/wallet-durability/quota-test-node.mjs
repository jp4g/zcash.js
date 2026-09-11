// Real accepted Wasm/SQLite fixture preflight. This does not test browser quota.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const base='/home/jack/zcash-wallet-integrated-scratch/stage-4/bundle';
process.env.STORAGE_BUNDLE=base;
const {start}=await import(pathToFileURL(`${base}/node-harness.mjs`));
const root=fs.mkdtempSync('/home/jack/zcash-browser-quota-scratch/node-control-');
let w;
const call=async command=>{const r=await w.call(command);assert.equal(r.error,undefined,JSON.stringify(r));return r;};
try {
  w=start(root,true);await call({op:'walletOpen',create:true});await call({op:'walletSetup',import:true});
  for(const [start,end] of [[0,1],[1,2],[2,4]])await call({op:'walletScan',start,end});
  const before=await call({op:'walletObserve'});
  assert.ok(before.exact.blocks.length && before.exact.sapling_received_notes.length);
  await call({op:'walletClose'});await w.destroy();w=start(root);
  await call({op:'walletOpen'});assert.deepEqual(await call({op:'walletObserve'}),before);
  await call({op:'walletScan',start:4,end:7});
  const success=await call({op:'walletObserve',complete:true});
  assert.deepEqual(success.canonical,JSON.parse(fs.readFileSync(`${base}/reference.json`)).imported);
  assert.deepEqual(success.exact.accounts,before.exact.accounts);
  await call({op:'walletClose'});await w.destroy();w=start(root);
  await call({op:'walletOpen'});assert.deepEqual(await call({op:'walletObserve',complete:true}),success);
  await call({op:'walletClose'});
  console.log(JSON.stringify({pass:true,test:'real-Wasm-populated-batch-preflight',actualQuotaExhaustion:false,tables:Object.keys(success.exact).length}));
} finally {await w?.destroy();fs.rmSync(root,{recursive:true,force:true});}
