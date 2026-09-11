// Read-only verification of a foreground runner result; does not execute a browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { requireLifecycle } from './firefox-lifecycle.mjs';

const path = process.argv[2];
const bytes = await readFile(path);
const evidence = JSON.parse(bytes);
const expected = JSON.parse(await readFile(new URL('./evidence.json', import.meta.url)));
const scenarios = ['same-instance', 'pool', 'canary-corruption', 'heap-corruption', 'oom', 'growth', 'hosts', 'omitted-pool',
  'entropy-unavailable', 'entropy-loss', 'time-loss', 'sleep-loss', 'destruction-original', 'destruction-fresh',
  'bootstrap-timeout', 'bootstrap-error', 'cancel-active', 'cancel-before-start', 'malformed-result'];
const find = stage => evidence.records.filter(r => r.stage === stage);
assert.equal(evidence.exitCode, 0, 'foreground command must succeed including cleanup');
assert.deepEqual(evidence.results.map(r => r.scenario), scenarios, 'all required probes in order');
assert.deepEqual(find('scenario-pass').map(r => r.scenario), scenarios);
assert.deepEqual(find('scenario-start').map(r => r.scenario), scenarios);
assert.equal(find('failed').length, 0);
assert.equal(find('complete').length, 1);
assert.equal(find('complete')[0].runtimePasses, 14);
assert.equal(find('complete')[0].harnessControlPasses, 5);
assert.equal(evidence.results.filter(r => r.category === 'runtime').length, 14);
assert.equal(evidence.results.filter(r => r.category === 'harness-control').length, 5);
assert.equal(find('inputs')[0].manifestSha256, expected.manifestSha256);
assert.deepEqual(evidence.manifest, expected.manifest);
assert.equal(evidence.capabilities.browserName, 'firefox');
const cleanup = find('cleanup').at(-1);
for (const key of ['sessionDeleted', 'processGroupGone', 'browserProcessGone', 'loopbackServerClosed']) assert.equal(cleanup[key], true, key);
assert.equal(cleanup.exitCode, 0);
const { context, owner } = find('page-context')[0];
const origin = find('launch')[0].origin;
function baseline(context) {
  assert.equal(context.secure, true);
  assert.equal(context.isolated, false);
  assert.equal(context.sab, 'undefined');
}
baseline(context);
let previousPass = -1;
for (const result of evidence.results) {
  assert.equal(result.ok, true);
  const startIndex = evidence.records.findIndex(r => r.stage === 'scenario-start' && r.scenario === result.scenario);
  const passIndex = evidence.records.findIndex(r => r.stage === 'scenario-pass' && r.scenario === result.scenario);
  assert(startIndex > previousPass && passIndex > startIndex, 'replacement must start after previous lifecycle pass');
  const start = evidence.records[startIndex];
  const wanted = result.scenario === 'cancel-before-start' ? 0 : 1;
  const workerURL = origin + (result.category === 'harness-control' ? '/control-worker.mjs' : '/probe-worker.mjs');
  const lifecycle = requireLifecycle(evidence.events.slice(0, result.lifecycle.through), {
    after: start.after, wanted, owner, origin, workerURL,
  });
  assert.deepEqual(result.lifecycle, lifecycle);
  for (const item of lifecycle.records) {
    const destroyedIndex = evidence.records.findIndex(r => r.stage === 'bidi-event' && r.eventIndex === item.destroyedIndex);
    assert(destroyedIndex > startIndex && destroyedIndex < passIndex, 'external destruction must precede pass/replacement');
  }
  if (result.category === 'runtime') {
    baseline(result.context); assert.equal(result.context.dedicatedWorker, true);
    assert.equal(result.evidence.rawSha256, expected.manifest.raw.sha256);
    assert.equal(result.evidence.generatedWasmSha256, expected.manifest.files['qualification_bg.wasm'].sha256);
    assert.equal(result.evidence.generatedGlueSha256, expected.manifest.files['qualification.js'].sha256);
    assert.equal(result.evidence.probeSha256, expected.manifest.files['probe-worker.mjs'].sha256);
    assert.deepEqual(result.evidence.imports, expected.manifest.imports);
  }
  previousPass = passIndex;
}
const original = evidence.results.find(r => r.scenario === 'destruction-original');
const fresh = evidence.results.find(r => r.scenario === 'destruction-fresh');
assert.deepEqual(original.details, { sqlTotal: 42, rows: 2, pairing: 1 });
assert.equal(fresh.details.fixtureSchemaCount, 0);
assert.notEqual(original.lifecycle.realms[0], fresh.lifecycle.realms[0]);
console.log(JSON.stringify({ category: 'read-only-foreground-evidence-verification', ok: true, path,
  sha256: createHash('sha256').update(bytes).digest('hex'), browserVersion: evidence.capabilities.browserVersion,
  geckodriverVersion: evidence.capabilities['moz:geckodriverVersion'], runtimePasses: 14, harnessControlPasses: 5,
  workerRealms: evidence.results.flatMap(r => r.lifecycle.realms), context, cleanup }));
