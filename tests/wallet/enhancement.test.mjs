import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEnhancement } from '../../dist/src/wallet/enhancement.js';

test('address enhancement commits bounded batches but only completes after successful exhaustion', async () => {
  const request = { kind: 'address', address: 'fixture', start: 1, endExclusive: 10, requestAt: null, txStatus: 'mined', outputStatus: 'all' };
  for (const fail of [false, true]) {
    const commits = [];
    const session = { enhancement: { async apply(args) {
      assert.equal(args.revision, String(commits.length)); commits.push(args.result);
      return { revision: String(commits.length) };
    } } };
    const light = { async *streamAddressTransactions() {
      for (let i = 0; i < 17; i++) yield { raw: new Uint8Array([i]), observation: { state: 'mined', inclusion: { height: 2 } } };
      if (fail) throw Error('fixture transport failed');
    } };
    const result = applyEnhancement(session, light, '0', request);
    if (fail) await assert.rejects(result, /fixture transport failed/); else await result;
    assert.equal(commits[0].transactions.length, 16); assert.equal(commits[0].complete, false);
    assert.equal(commits.length, fail ? 1 : 2);
    if (!fail) { assert.equal(commits[1].transactions.length, 1); assert.equal(commits[1].complete, true); }
  }
});
