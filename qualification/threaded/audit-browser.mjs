// Read-only audit of genuine foreground WebDriver/BiDi records.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateEvidence } from './evidence.mjs';
const bytes = await readFile(process.argv[2]); const report=JSON.parse(bytes);
assert.equal(report.exitCode,0); assert.equal(report.results.length,6);
assert.equal(report.capabilities.browserName,'firefox');
const ordering=[];
for(const result of report.results) {
  assert.equal(result.ok,true);
  const records=result.lifecycle.records;
  if(['owner-error','owner-stall','compute-error','compute-stall'].includes(result.scenario)) {
    const fallback=records.at(-1), previous=records.slice(0,-1);
    assert(previous.every(r=>r.destroyedIndex<fallback.createdIndex),'fallback realm started before full teardown');
    assert.equal(result.ready.baseline.schemaBefore,0);
    ordering.push({scenario:result.scenario,lastDestroyed:Math.max(...previous.map(r=>r.destroyedIndex)),fallbackCreated:fallback.createdIndex});
  }
  if(result.scenario==='shared') {
    assert.equal(result.context.secure,true); assert.equal(result.context.isolated,true);
    validateEvidence(result.rows.flatMap(r=>[r.index,r.role,r.tls,r.stack,r.heap,r.words]));
    assert.equal(records.length,3); assert.equal(result.sql,42); assert.equal(result.pairing,1);
    const ready=result.events.findIndex(e=>e.type==='ready');
    assert(ready>=0 && result.events.slice(0,ready).filter(e=>e.type==='loaded').length===2);
    assert(result.events.slice(0,ready).every(e=>e.type!=='result'));
  }
}
const begin=report.records.findIndex(r=>r.stage==='scenario-start'&&r.scenario==='no-sab');
const end=report.records.findIndex(r=>r.stage==='scenario-pass'&&r.scenario==='no-sab');
assert(begin>=0&&end>begin);
assert(!report.records.slice(begin,end).some(r=>r.stage==='http'&&r.path.startsWith('/threaded/')),'no-SAB path fetched threaded artifact');
const cleanup=report.records.at(-1);
for(const key of ['sessionDeleted','processGroupGone','browserProcessGone','loopbackServerClosed']) assert.equal(cleanup[key],true);
console.log(JSON.stringify({input:process.argv[2],sha256:createHash('sha256').update(bytes).digest('hex'),browser:report.capabilities.browserVersion,scenarios:6,ordering,noSabNeverFetchedThreaded:true,cleanup},null,2));
