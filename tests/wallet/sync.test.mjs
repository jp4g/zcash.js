import assert from 'node:assert/strict';
import test from 'node:test';
import { syncWallet, WalletSync } from '../../dist/src/wallet/sync.js';
import { failure } from '../../dist/src/errors.js';

test('newly discovered enhancement requests cannot grow a finite pass without bound', async () => {
  const target = { height: 1, hash: '03'.repeat(32) };
  let applied = 0;
  const session = { scan: {
    async state() { return { revision: String(applied), maxScannedHeight: null }; },
    async plan() { return { ranges: [] }; },
  }, enhancement: {
    async requests() { return { revision: String(applied), requests: [{ kind: 'status', txid: applied.toString(16).padStart(64, '0') }] }; },
    async apply() { applied++; return { revision: String(applied) }; },
  } };
  const light = { async getTreeState() { return { point: target }; }, async getTransaction() { return null; } };
  await assert.rejects(syncWallet(session, light, target), error => error.code === 'RESOURCE_LIMIT');
  assert.equal(applied, 1024);
});

test('reorg replay starts at the native actual checkpoint, not the requested ancestor', async () => {
  const oldHash = '01'.repeat(32), newHash = '02'.repeat(32);
  let scanned = 100, revision = 0;
  const requested = [], replayed = [];
  const session = { scan: {
    async state() { return { revision: String(revision), maxScannedHeight: scanned, fullyScannedHeight: scanned }; },
    async block({ height }) { return { revision: String(revision), point: { height, hash: oldHash } }; },
    async rewind({ requestedPoint }) {
      requested.push(requestedPoint.height); scanned = 96; revision++;
      return { revision: String(revision), point: { height: 96, hash: oldHash } };
    },
    async plan() {
      return { revision: String(revision), ranges: scanned === 100 ? []
        : [{ start: scanned + 1, endExclusive: 101, priorState: { height: scanned, hash: oldHash } }] };
    },
    async ingest({ blocks }) { scanned += blocks.length; revision++; },
  }, enhancement: { async requests() { return { revision: String(revision), requests: [] }; } } };
  const light = {
    async getTreeState({ height }) { return { point: { height, hash: height === 100 ? newHash : oldHash }, encoded: new Uint8Array() }; },
    async *streamCompactBlocks({ fromHeight, toHeight }) {
      for (let height = fromHeight; height <= toHeight; height++) {
        replayed.push(height);
        yield { point: { height, hash: height === 100 ? newHash : oldHash }, encoded: new Uint8Array([height]) };
      }
    },
  };
  assert.equal((await syncWallet(session, light, { height: 100, hash: newHash })).fullyScannedHeight, 100);
  assert.deepEqual(requested, [99]);
  assert.deepEqual(replayed, [97, 98, 99, 100]);
});

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

test('sync lifecycle returns committed stopped progress and attaches failed status', async () => {
  const hash = '03'.repeat(32), target = { height: 1, hash };
  let scanned = null, revision = '0';
  const session = { scan: {
    async state() { return { revision, maxScannedHeight: scanned, fullyScannedHeight: scanned, scanComplete: false, tipHeight: 1 }; },
    async plan() { return { revision, ranges: [{ start: 1, endExclusive: 2, priorState: { height: 0, hash: null } }] }; },
    async ingest() { scanned = 1; revision = '1'; throw failure('ABORTED', 'sync', 'none', 'Cancelled after commit.'); },
  }, enhancement: { async requests() { return { revision, requests: [] }; } } };
  const light = {
    async getTreeState({ height }) { return { point: { height, hash }, encoded: new Uint8Array() }; },
    async *streamCompactBlocks() { yield { point: target, encoded: new Uint8Array([1]) }; },
  };
  const owner = new WalletSync(session, light);
  const stopped = await owner.sync({ target });
  assert.equal(stopped.activity, 'stopped'); assert.equal(stopped.scan.fullyScannedHeight, 1);
  assert.equal(stopped.targetReached, false);
  light.getTreeState = async () => { throw failure('TRANSPORT_ERROR', 'transport', 'configure', 'Source failed.'); };
  await assert.rejects(owner.sync({ target }), error => error.code === 'TRANSPORT_ERROR'
    && error.syncStatus.activity === 'failed' && error.syncStatus.scan.revision === '1');
  const status = await owner.getSyncStatus();
  assert.equal(status.lastError.code, 'TRANSPORT_ERROR');
  assert.throws(() => { status.lastError.message = 'mutated'; }, TypeError);
  assert.equal((await owner.getSyncStatus()).lastError.message, 'Source failed.');
});
