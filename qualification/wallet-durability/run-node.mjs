import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from './node-harness.mjs';
import { suite } from './suite.mjs';
const base=process.env.STORAGE_BUNDLE;
if (!base) throw Error('explicit STORAGE_BUNDLE required');
const root=fs.mkdtempSync(join(tmpdir(),'node-'));
const reference=JSON.parse(fs.readFileSync(`${base}/reference.json`));
const phase=process.env.WALLET_DURABILITY_PHASE ?? 'all';
if(!['all','tracer','interruptions'].includes(phase))throw Error('invalid phase');
const results=[]; let index=0;
try {
  await suite({root:()=>{const p=`${root}/${index++}`;fs.mkdirSync(p);return p;},start,reference,phase},r=>{results.push(r);console.log(JSON.stringify(r));});
  console.log(JSON.stringify({pass:true,base,root,phase,results}));
} catch(error) {console.error(error);process.exitCode=1;}
