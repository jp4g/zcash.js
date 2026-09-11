// Read-only replay of foreground evidence. A receipt pin must be trusted separately.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateEvidence } from './evidence.mjs';
import { requireLifecycle } from './firefox-lifecycle.mjs';
const bytes = await readFile(process.argv[2]), report = JSON.parse(bytes);
const sha = b => createHash('sha256').update(b).digest('hex');
const find = stage => report.records.filter(r => r.stage === stage);
const single = stage => { const rows=find(stage); assert.equal(rows.length,1,stage); return rows[0]; };
const inputs=single('inputs');
const pinIndex=process.argv.indexOf('--receipt-sha256');
if(pinIndex >= 0) {
  const pin=process.argv[pinIndex+1]; assert.match(pin || '', /^[a-f0-9]{64}$/);
  assert.equal(sha(bytes),pin,'separately trusted receipt digest');
} else {
  for(const [field,file] of Object.entries({runnerSha256:'run-firefox.mjs',lifecycleAuditSha256:'firefox-lifecycle.mjs',optionsSha256:'firefox-options.mjs'}))
    assert.equal(inputs[field],sha(await readFile(new URL(file,import.meta.url))),`source identity ${file}`);
}
const expected=JSON.parse(await readFile(new URL('./evidence.json',import.meta.url)));
assert.equal(inputs.manifestSha256,expected.manifestSha256);
assert.deepEqual(inputs.manifest,report.manifest);
const manifestBytes=await readFile(`${expected.bundle}/manifest.json`);
assert.equal(sha(manifestBytes),expected.manifestSha256,'trusted artifact manifest');
assert.deepEqual(report.manifest,JSON.parse(manifestBytes));
assert.equal(report.exitCode,0); assert.equal(report.capabilities.browserName,'firefox');
const scenarios=['no-sab','shared','owner-error','owner-stall','compute-error','compute-stall'];
assert.deepEqual(report.results.map(r=>r.scenario),scenarios);
for(const stage of ['scenario-start','scenario-pass']) assert.deepEqual(find(stage).map(r=>r.scenario),scenarios);
assert.equal(find('failed').length,0);
assert.equal(single('complete').scenarios,6);
const events=find('bidi-event').map((r,i)=>{assert.equal(r.eventIndex,i,'unique contiguous event indices');return r.event;});
assert.deepEqual(report.events,events,'canonical event equality');
const created=events.filter(e=>e.method==='script.realmCreated').map(e=>e.params.realm);
assert.equal(new Set(created).size,created.length,'unique realm creations');
const destroyed=events.filter(e=>e.method==='script.realmDestroyed').map(e=>e.params.realm);
assert.equal(new Set(destroyed).size,destroyed.length,'unique realm destructions');
const origin=single('launch').origin;
const context=(c,isolated)=>assert.deepEqual(c,{secure:true,isolated,sab:isolated?'function':'undefined'});
const flat=rows=>rows.flatMap(r=>[r.index,r.role,r.tls,r.stack,r.heap,r.words]);
let previous=-1; const ordering=[];
for(const [i,result] of report.results.entries()) {
 const scenario=scenarios[i], start=find('scenario-start')[i], pass=find('scenario-pass')[i];
 const begin=report.records.indexOf(start), end=report.records.indexOf(pass);
 assert(begin>previous && end>begin,'scenario chronological boundaries'); previous=end;
 const {utc,stage,...payload}=pass; assert.deepEqual(payload,result,'pass payload equality'); assert.equal(result.ok,true);
 const before=index=>report.records.slice(0,index).filter(r=>r.stage==='bidi-event').length;
 assert.equal(start.after,before(begin)); assert.equal(result.lifecycle.through,before(end));
 assert.equal(start.page,`${origin}/${scenario==='no-sab'?'baseline':'isolated'}/`);
 assert(events.slice(0,start.after).some(e=>e.method==='script.realmCreated'&&e.params.type==='window'&&e.params.realm===start.owner&&e.params.origin===origin),'page owner');
 const wanted=scenario==='no-sab'?1:scenario==='shared'?3:scenario.startsWith('owner-')?2:4;
 const lifecycle=requireLifecycle(events.slice(0,before(end)),{after:start.after,wanted,owner:start.owner,origin,workerURLs:['browser-worker.mjs','browser-baseline.mjs'].map(n=>start.page+n)});
 assert.deepEqual(result.lifecycle,lifecycle,'recomputed lifecycle');
 const workers=lifecycle.records, fallback=scenario!=='shared';
 workers.forEach((r,j)=>assert.equal(events[r.createdIndex].params.origin,start.page+(fallback&&j===workers.length-1?'browser-baseline.mjs':'browser-worker.mjs'),'worker script identity'));
 context(result.context,scenario!=='no-sab');
 if(fallback) {
  const baseline=(scenario==='no-sab'?result.result:result.ready).baseline;
  assert.equal(baseline.mode,'baseline'); assert.equal(baseline.schemaBefore,0); assert.equal(baseline.sql,42); assert.equal(baseline.pairing,1); assert.equal(baseline.shared,false); context(baseline.context,scenario!=='no-sab');
  if(scenario==='no-sab') assert(!report.records.slice(begin,end).some(r=>r.stage==='http'&&r.path.startsWith('/threaded/')));
  else {
   const last=workers.at(-1), prior=workers.slice(0,-1);
   assert(prior.every(r=>r.destroyedIndex<last.createdIndex),'fallback before complete threaded teardown');
   assert(!result.events.some(e=>['ready','result'].includes(e.type)),'failed bootstrap reached readiness');
   assert.equal(result.events.filter(e=>e.type==='pool').length,scenario.startsWith('compute-')?1:0);
   if(scenario.endsWith('stall')) assert.equal(result.ready.reason,'bootstrap timeout');
   else assert.match(result.ready.reason,new RegExp(`injected ${scenario.split('-')[0]} bootstrap failure`));
   if(scenario==='compute-stall') assert.deepEqual(result.events.filter(e=>e.type==='loaded').map(e=>e.index),[0],'partial compute startup');
   ordering.push({scenario,lastDestroyed:Math.max(...prior.map(r=>r.destroyedIndex)),fallbackCreated:last.createdIndex});
  }
 } else {
  for(const [key,value] of Object.entries({sql:42,pairing:1,pool:1,growth:1,cycle:44})) assert.equal(result[key],value,key);
  validateEvidence(flat(result.rows)); validateEvidence(flat(result.afterGrowth));
  for(let j=0;j<2;j++) for(const key of ['tls','stack']) assert.equal(result.rows[j][key],result.afterGrowth[j][key]);
  assert.equal(result.ready.shared,true); assert.equal(result.ready.type,'ready'); context(result.ready.context,true);
  const ready=result.events.findIndex(e=>e.type==='ready'); assert(ready>=0);
  assert.equal(result.events.filter(e=>e.type==='ready').length,1);
  assert.deepEqual(result.events.slice(0,ready).filter(e=>e.type==='loaded').map(e=>e.index).sort(),[0,1]);
  assert(!result.events.slice(0,ready).some(e=>e.type==='result'));
  for(const e of result.events.filter(e=>e.context)) context(e.context,true);
  assert.deepEqual(result.events.filter(e=>e.type==='result').map(e=>({id:e.id,result:e.result})),[flat(result.rows),42,1,1,1,flat(result.afterGrowth),44].map((result,j)=>({id:j+1,result})));
 }
}
assert.equal(events.filter(e=>e.method==='script.realmCreated'&&e.params.type==='dedicated-worker').length,report.results.reduce((n,r)=>n+r.lifecycle.records.length,0),'no workers outside scenario boundaries');
assert(report.records.indexOf(single('complete'))>previous);
const cleanup=single('cleanup'); assert.equal(report.records.at(-1),cleanup); assert.equal(cleanup.exitCode,0);
for(const key of ['sessionDeleted','processGroupGone','browserProcessGone','loopbackServerClosed']) assert.equal(cleanup[key],true);
console.log(JSON.stringify({input:process.argv[2],sha256:sha(bytes),scenarios:6,ordering,cleanup},null,2));
