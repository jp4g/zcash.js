import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEnhancement } from '../../dist/src/wallet/enhancement.js';

test('address enhancement commits bounded batches but only completes after successful exhaustion', async () => {
  const request = { kind: 'address', address: 'fixture', start: 1, endExclusive: 10, requestAt: null, txStatus: 'mined', outputStatus: 'all' };
  for (const fail of [false, true]) {
    const commits = [];
    const session = { enhancement: { async requests() { return { revision: String(commits.length), requests: [request] }; }, async apply(args) {
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

test('a partial batch that resolves the native request closes the stream without a stale final write', async () => {
  let writes = 0, closed = false;
  const session = { enhancement: {
    async apply() { writes++; return { revision: '1' }; },
    async requests() { return { revision: '1', requests: [] }; },
  } };
  const light = { async *streamAddressTransactions() {
    try { for (let i = 0; i < 20; i++) yield { raw: new Uint8Array([i]), observation: { state: 'mined', inclusion: { height: 2 } } }; }
    finally { closed = true; }
  } };
  await applyEnhancement(session, light, '0', { kind: 'address', address: 'fixture', start: 1,
    endExclusive: 10, requestAt: null, txStatus: 'mined', outputStatus: 'all' });
  assert.equal(writes, 1); assert.equal(closed, true);
});
