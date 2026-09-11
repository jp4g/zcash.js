// Predicate-only controls over retained real observations. Never rewrite a receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capacityEvidence} from './quota-suite.mjs';
const raw=JSON.parse(fs.readFileSync('/home/jack/zcash-browser-quota-logs/host-1789146986303881163/firefox-result-1789146986369.json'));
const row=name=>raw.results.find(r=>r.test===name);
const pressure=row('bounded-native-filler').pressure, scan=row('scan-attempt');
const before=row('populated-baseline').before, recovered=row('pressure-rollback').recovered;
assert.deepEqual(before,recovered);assert.equal(raw.pass,false); // Package 3 remains failed.
const input={pressure,failed:scan.failed,evidence:scan.evidence,
  config:{fixedLimitKiB:32768},barriers:raw.barriers,freed:row('pressure-retry-native-parity-reopen').freed,
  completed:{rollback:true,retry:true,nativeParity:true,identity:true,reopen:true,cleanup:true}};
const result=capacityEvidence(input);
assert.equal(result.platformSignal,'NS_ERROR_FILE_NO_DEVICE_SPACE');
assert.equal(result.sqliteExtendedCode,778);assert.equal(result.sqlitePrimaryCode,10);
assert.equal(result.sqliteFile,'wallet.db-journal');assert.equal(result.sqliteReturned,0);
assert.equal(result.standardDOMQuota,false);
function reject(change){const v=structuredClone(input);change(v);assert.throws(()=>capacityEvidence(v));}
reject(v=>delete v.pressure.probe);
reject(v=>v.pressure.probe.name='UnknownError');
reject(v=>v.pressure.probe.error='unrelated error');
reject(v=>v.pressure.before.quota=Infinity);
reject(v=>delete v.config);
reject(v=>v.pressure.bytes--);
reject(v=>v.pressure.bytes=64*1024*1024+1);
reject(v=>v.pressure.writes.at(-1).returned=1);
reject(v=>v.pressure.probe.requestedSize+=4096);
reject(v=>v.evidence.shortWrites[0].command='walletObserve');
reject(v=>v.evidence.shortWrites[0].file='quota-filler');
reject(v=>v.evidence.shortWrites=[]);
reject(v=>v.failed={});
reject(v=>v.failed.error=v.failed.error.replace('778','13'));
reject(v=>v.evidence.trace.find(t=>t.rc===778).rc=13);
reject(v=>v.evidence.traceDropped=1);
reject(v=>v.freed.freed='wallet.db');
reject(v=>v.freed.estimate.usage++);
reject(v=>v.barriers[1].destroyed=[]);
for(const key of Object.keys(input.completed))reject(v=>delete v.completed[key]);
// Separate synthetic category control only, not a new platform receipt/result.
const dom=structuredClone(input);
dom.failed.error='scan: Commit(SqliteFailure(Error { code: DiskFull, extended_code: 13 }))';
dom.evidence.errors=[{nativeQuota:true,name:'QuotaExceededError',command:'walletScan',file:'wallet.db-journal',op:'write'}];
dom.evidence.trace.find(t=>t.rc===778).rc=13;
dom.evidence.trace.find(t=>t.rc===13).error='write:QuotaExceededError';
const standard=capacityEvidence(dom);
assert.equal(standard.standardDOMQuota,true);assert.equal(standard.sqliteExtendedCode,13);
console.log('predicate controls pass: retained host-3 facts classified prospectively; original package remains failed; negative causal guards and separate DOM category control pass');
reject(v=>v.completed.cleanup=false);
reject(v=>v.pressure.retained++);
reject(v=>v.evidence.trace.push({op:'write',file:'wallet.db-journal',rc:13,error:'write:QuotaExceededError'}));
delete dom.pressure.probe;
assert.equal(capacityEvidence(dom).platformSignal,'QuotaExceededError');
console.log('mixed 13/778 evidence and absent cleanup rejected; standard DOM route does not depend on Firefox capacity name');
