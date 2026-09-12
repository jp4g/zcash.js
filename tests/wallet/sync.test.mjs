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
    async complete() { return { revision: String(++revision) }; },
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
      async complete(args) { assert.equal(args.revision,String(revision)); assert.deepEqual(args.target,target); return {revision:String(++revision)}; },
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

test('empty wallet reaches a target only after native completion without invented scan heights', async () => {
  for (const fail of [false,true]) {
    let completed=0,revision='0';
    const target={height:1,hash:'03'.repeat(32)};
    const session={scan:{
      async state(){return {revision,tipHeight:1,maxScannedHeight:null,fullyScannedHeight:null,scanComplete:null};},
      async plan(){return {revision,ranges:[]};},
      async complete(args){assert.equal(args.revision,revision);assert.deepEqual(args.treeState,new Uint8Array([7]));completed++;
        if(fail)throw failure('SYNC_REQUIRED','sync','sync','Snapshot incomplete.');revision='1';return{revision};},
    },enhancement:{async requests(){return{revision,requests:[]};}}};
    const light={async getTreeState(){return {point:target,encoded:new Uint8Array([7])};}};
    const owner=new WalletSync(session,light);
    if(fail)await assert.rejects(owner.sync({target}),error=>error.code==='SYNC_REQUIRED'&&!error.syncStatus.targetReached);
    else {const status=await owner.sync({target});assert.equal(status.targetReached,true);assert.equal(status.scan.fullyScannedHeight,null);assert.equal(status.scan.scanComplete,null);}
    assert.equal(completed,1);
  }
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
  const owner = new WalletSync(session, light, { pollIntervalMs: 10, maxBufferedUpdates: 8 });
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

function observing({ maxBufferedUpdates = 8, getTip } = {}) {
  const point = { height: 1, hash: '03'.repeat(32) };
  const scan = { revision: '0', fullyScannedHeight: 1, maxScannedHeight: 1, tipHeight: 1, scanComplete: true };
  let calls = 0, aborted = 0;
  const session = { scan: {
    async state({ signal } = {}) { if (signal?.aborted) throw failure('ABORTED', 'sync', 'none', 'Stopped.'); return { ...scan }; },
    async block() { return { revision: '0', point }; },
    async plan() { return { revision: '0', ranges: [] }; },
  }, enhancement: { async requests() { return { revision: '0', requests: [] }; } } };
  const light = {
    async getTip({ signal }) {
      calls++;
      if (getTip) return getTip(signal, point);
      return new Promise((resolve, reject) => {
        const fail = () => { aborted++; reject(failure('ABORTED', 'sync', 'none', 'Stopped.')); };
        signal.addEventListener('abort', fail, { once: true });
        if (signal.aborted) fail();
      });
    },
    async getTreeState() { return { point }; },
  };
  return { owner: new WalletSync(session, light, { pollIntervalMs: 5, maxBufferedUpdates }),
    calls: () => calls, aborted: () => aborted };
}
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('condition did not settle');
}

test('watch subscribers share one run; return and caller abort release only their subscription', async () => {
  const f = observing(), controller = new AbortController();
  // A suppressed caller event must still detach this subscription.
  controller.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const a = f.owner.watchSync({ signal: controller.signal }), b = f.owner.watchSync();
  assert.equal((await a.next()).value.activity, 'idle');
  await b.next(); await until(() => f.calls() === 1);
  controller.signal.dispatchEvent(new Event('abort'));
  assert.equal(f.aborted(), 0);
  controller.abort();
  await assert.rejects(a.next(), error => error.code === 'ABORTED');
  assert.equal(f.aborted(), 0);
  await b.return();
  assert.equal(f.aborted(), 1);
  assert.equal((await f.owner.getSyncStatus()).activity, 'stopped');
  const c = f.owner.watchSync(); await c.next(); await until(() => f.calls() === 2);
  await c.return(); assert.equal(f.aborted(), 2);
});

test('watch never cancels independently started finite sync and active watch retains busy admission', async () => {
  const f = observing();
  const finite = f.owner.sync(); await until(() => f.calls() === 1);
  const iterator = f.owner.watchSync(); await iterator.next(); await iterator.return();
  assert.equal(f.aborted(), 0);
  await f.owner.stop(); assert.equal((await finite).activity, 'stopped');
  const next = f.owner.watchSync(); await next.next(); await until(() => f.calls() === 2);
  await assert.rejects(f.owner.sync(), error => error.code === 'STORAGE_BUSY');
  await next.return();
});

test('slow subscriber overflow is explicit and releases the last watch', async () => {
  const polling = observing({ maxBufferedUpdates: 1, getTip: async (_signal, point) => point });
  const stalled = polling.owner.watchSync(); await stalled.next();
  await until(() => polling.calls() >= 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(stalled.next(), error => error.code === 'RESOURCE_LIMIT');
  const calls = polling.calls(); await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(polling.calls(), calls);
  await polling.owner.stop();
});

test('watch retries only transient network failures and closes all subscribers on terminal error', async () => {
  let attempts = 0;
  const f = observing({ getTip: async (_signal, point) => {
    attempts++;
    if (attempts === 1) throw failure('TRANSPORT_ERROR', 'transport', 'configure', 'Unavailable.', true);
    if (attempts === 2) return point;
    throw failure('PROTOCOL_MISMATCH', 'query', 'configure', 'Bad source.');
  } });
  const iterator = f.owner.watchSync(), statuses = [];
  await assert.rejects(async () => { for await (const status of iterator) statuses.push(status); }, error => error.code === 'PROTOCOL_MISMATCH');
  assert(statuses.some(status => status.activity === 'failed' && status.lastError.code === 'TRANSPORT_ERROR'));
  assert(statuses.some(status => status.targetReached));
  assert.equal(attempts, 3);
  await f.owner.stop();
});

test('overflow detaches only the slow subscriber', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = observing({ maxBufferedUpdates: 1, getTip: async (_signal, point) => { await gate; return point; } });
  const slow = f.owner.watchSync(), fast = f.owner.watchSync();
  await slow.next(); await fast.next(); await until(() => f.calls() === 1);
  const terminal = fast.next(); release();
  assert.equal((await terminal).value.targetReached, true);
  await assert.rejects(slow.next(), error => error.code === 'RESOURCE_LIMIT');
  await fast.return();
});
