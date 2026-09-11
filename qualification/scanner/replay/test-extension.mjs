// Pure consumer-contract controls; real runtime qualification is a separate run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLifecycle } from './firefox-lifecycle.mjs';
import { validateCaseResult } from './case-contract.mjs';
const opts = { after:0, wanted:1, owner:'page', origin:'http://127.0.0.1:1234', workerURL:'http://127.0.0.1:1234/browser-worker.mjs' };
const created = { method:'script.realmCreated', params:{ type:'dedicated-worker', realm:'w', owners:['page'], origin:opts.workerURL } };
const destroyed = { method:'script.realmDestroyed', params:{ realm:'w' } };
test('requesting termination is not destruction evidence', () => {
  assert.throws(() => requireLifecycle([created], opts));
});
test('exact full worker script URL, ownership and ordered destruction', () => {
  assert.deepEqual(requireLifecycle([created,destroyed],opts).realms,['w']);
  assert.throws(() => requireLifecycle([destroyed,created],opts));
  assert.throws(() => requireLifecycle([{...created,params:{...created.params,origin:opts.origin+'/wrong.mjs'}},destroyed],opts));
  assert.throws(() => requireLifecycle([{...created,params:{...created.params,owners:['someone-else']}},destroyed],opts));
});
test('case results require exact name, reference and terminal stages', () => {
  const expected = {canonical_sha256:'a', unspent_after_spend:false};
  const result = {schema:2,case:'transparent',passed:true,result:expected};
  const stages = ['case-start','case-complete','reference-match'];
  assert.equal(validateCaseResult('transparent',result,expected,stages),result);
  assert.throws(() => validateCaseResult('rewind',result,expected,stages));
  assert.throws(() => validateCaseResult('transparent',result,{...expected,unspent_after_spend:true},stages));
  assert.throws(() => validateCaseResult('transparent',result,expected,['case-start']));
});
