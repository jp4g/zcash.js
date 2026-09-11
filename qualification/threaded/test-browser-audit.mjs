import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const original = await readFile('/home/jack/zcash-threaded-logs/firefox-1789137395952.json');
const temp = await mkdtemp('/home/jack/zcash-threaded-scratch/audit-controls-');
const run = (path, pin) => spawnSync(process.execPath, [new URL('./audit-browser.mjs', import.meta.url).pathname, path, '--receipt-sha256', pin], {encoding:'utf8', timeout:5000});
const hash = b => createHash('sha256').update(b).digest('hex');
test('independently pinned historical receipt passes', () => assert.equal(run('/home/jack/zcash-threaded-logs/firefox-1789137395952.json', hash(original)).status, 0));
const mutations = {
  destruction: r => { for (const e of r.events) if(e.method==='script.realmDestroyed') e.method='synthetic.absent'; for(const x of r.records) if(x.event?.method==='script.realmDestroyed') x.event.method='synthetic.absent'; },
  duplicateIndex: r => {r.records.filter(x=>x.stage==='bidi-event')[1].eventIndex=0;},
  duplicateStream: r => {r.events.pop();},
  contradictoryPass: r => {r.records.find(x=>x.stage==='scenario-pass').ok=false;},
  duplicateScenario: r => {r.results[1]=r.results[0];},
  boundary: r => {r.records.find(x=>x.stage==='scenario-start').after++;},
  ownership: r => {const e=r.events.find(e=>e.params?.type==='dedicated-worker'); e.params.owners=['wrong']; r.records.find(x=>x.event?.params?.realm===e.params.realm).event=e;},
  substantive: r => {r.results[1].growth=0; r.records.find(x=>x.stage==='scenario-pass'&&x.scenario==='shared').growth=0;},
  source: r => {r.records.find(x=>x.stage==='inputs').runnerSha256='0'.repeat(64);},
};
for(const [name, mutate] of Object.entries(mutations)) test(`reject ${name}`, async()=>{
 const r=JSON.parse(original); mutate(r); const bytes=JSON.stringify(r), path=`${temp}/${name}.json`; await writeFile(path,bytes);
 // Matching synthetic pins deliberately exercise structural checks, never qualify execution.
 const child=name==='source' ? spawnSync(process.execPath,[new URL('./audit-browser.mjs',import.meta.url).pathname,path],{encoding:'utf8',timeout:5000}) : run(path,hash(bytes));
 assert.notEqual(child.status,0,child.stdout);
});
for(const name of ['missing-destructions','false-order','contradictory-pass']) test(`review fixture ${name}`,async()=>{
 const path=`/home/jack/zcash-threaded-logs/review/synthetic-${name}.json`;
 assert.notEqual(run(path,hash(await readFile(path))).status,0);
});
