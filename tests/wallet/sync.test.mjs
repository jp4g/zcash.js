import assert from 'node:assert/strict';
import test from 'node:test';
import { syncWallet } from '../../dist/src/wallet/sync.js';

test('finite sync follows native ranges in bounded batches and visits persistent status requests once', async () => {
  const hash = '03'.repeat(32), target = { height: 20, hash };
  let scanned = 0, revision = 0, applications = 0, pins = 0;
  const batches = [];
  const session = {
    scan: {
      async state() { return { revision: String(revision), maxScannedHeight: scanned || null, fullyScannedHeight: scanned || null }; },
      async plan() { return { revision: String(++revision), ranges: scanned === 20 ? [] : [{ start: scanned + 1, endExclusive: 21, priorState: { height: scanned, hash: null } }] }; },
      async ingest(args) { assert.equal(args.revision, String(revision)); batches.push(args.blocks.length); scanned += args.blocks.length; revision++; },
    },
    enhancement: {
      async requests() { return { revision: String(revision), requests: [{ kind: 'status', txid: hash }] }; },
      async apply(args) { assert.equal(args.result.status, 'notRecognized'); applications++; return { revision: String(++revision) }; },
    },
  };
  const light = {
    async getTreeState({ height }) { if (height === 20) pins++; return { point: { height, hash }, encoded: new Uint8Array([height]) }; },
    async *streamCompactBlocks({ fromHeight, toHeight }) {
      for (let height = fromHeight; height <= toHeight; height++) yield { point: { height, hash }, encoded: new Uint8Array([height]) };
    },
    async getTransaction() { return null; },
  };
  assert.equal((await syncWallet(session, light, target)).fullyScannedHeight, 20);
  assert.deepEqual(batches, [16, 4]); assert.equal(applications, 1); assert.equal(pins, 2);
});
