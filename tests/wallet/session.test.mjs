import assert from 'node:assert/strict';
import test from 'node:test';
import { isZcashError } from '../../dist/src/errors.js';
import { WalletSession } from '../../dist/src/wallet/session.js';

// Scheduling checks only. Native behavior is exercised by session-node.mjs.
test('FIFO completion, failed call drains, close prevents admission and runs once', async () => {
  const calls = [];
  const failure = Object.assign(Error('ABORTED'), {commit:'committed'});
  const session = new WalletSession({
    generation: 7, instance: 'worker',
    call(generation, instance, op) {
      assert.equal(generation, 7); assert.equal(instance, 'worker');
      calls.push(op);
      if (op === 'address_next') throw failure;
      return [];
    },
    close() { calls.push('close'); },
  });
  const write = session.addresses.next({accountId:'test'});
  const read = session.accounts.list();
  const closed = session.close();
  assert.equal(session.close(), closed);
  await assert.rejects(session.accounts.list(), error => {
    assert.equal(isZcashError(error), true);
    assert.equal(error.code, 'CLOSED');
    assert.equal(error.stage, 'runtime');
    assert.equal(error.recovery, 'none');
    assert.equal(error.message, 'Wallet session is closed.');
    assert.equal(error.retryable, false);
    assert.equal(Object.isFrozen(error), true);
    assert.equal(session.completion(error), 'none');
    return true;
  });
  await assert.rejects(write, error => error === failure);
  assert.equal(session.completion(failure), 'committed');
  assert.deepEqual(await read, []);
  await closed;
  assert.deepEqual(calls, ['address_next', 'account_list', 'close']);
});

test('completion distinguishes precommit and unknown failures; close failure is retained', async () => {
  for (const commit of ['none', undefined]) {
    const error = Object.assign(Error('failure'), commit ? {commit} : {});
    let closes = 0;
    const session = new WalletSession({
      generation:1, instance:'worker', call() { throw error; },
      close() { closes++; throw error; },
    });
    await assert.rejects(session.accounts.list(), e => e === error);
    assert.equal(session.completion(error), commit ?? 'unknown');
    const closed = session.close();
    await assert.rejects(closed, e => e === error);
    assert.equal(session.close(), closed);
    assert.equal(closes, 1);
    await assert.rejects(session.accounts.list(), error => {
      assert.equal(isZcashError(error), true);
      assert.equal(error.code, 'CLOSED');
      assert.equal(session.completion(error), 'none');
      return true;
    });
  }
});

test('public Birthday projection is not admitted', async () => {
  const session = new WalletSession({generation:1, instance:'worker',
    call() { assert.fail('must not invoke native import'); }, close() {},
  });
  const invalid = error => {
    assert.equal(isZcashError(error), true);
    assert.equal(error.code, 'INVALID_ARGUMENT');
    assert.equal(error.stage, 'validation');
    assert.equal(error.recovery, 'correct-input');
    assert.equal(error.message, 'Invalid argument.');
    assert.equal(error.retryable, false);
    assert.equal(Object.isFrozen(error), true);
    assert.equal(session.completion(error), 'none');
    return true;
  };
  await assert.rejects(session.accounts.import({viewingKey:'test', birthday:{}}), invalid);
  const args = {viewingKey:'test', birthday:'fullScan'};
  const queued = session.accounts.import(args);
  args.birthday = {};
  await assert.rejects(queued, invalid);
  let reads = 0;
  await assert.rejects(session.accounts.import({get birthday() { reads++; return 'fullScan'; }}), invalid);
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const args of [null, undefined, revoked.proxy, new Proxy({}, {
    getOwnPropertyDescriptor() { throw {get message() { reads++; return 'secret'; }}; },
    get() { reads++; return 'secret'; },
  })]) await assert.rejects(session.accounts.import(args), invalid);
  assert.equal(reads, 0);
  await session.close();
});

test('hostile native metadata preserves the thrown identity and drains the queue', async () => {
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  let reads = 0;
  const hostile = new Proxy({}, {
    getOwnPropertyDescriptor() { throw Error('metadata failure'); },
    get() { reads++; return 'secret'; },
    getPrototypeOf() { reads++; return null; },
  });
  const accessor = Object.defineProperty({}, 'commit', {get() { reads++; return 'committed'; }});
  for (const error of [revoked.proxy, hostile, accessor, {commit:'unexpected'}, {commit:1}, 'native string', null, undefined, 7, Symbol('native')]) {
    let calls = 0;
    const session = new WalletSession({generation:1, instance:'worker',
      call() { if (++calls === 1) throw error; return []; }, close() {},
    });
    const rejected = session.accounts.list();
    const queued = session.accounts.list();
    // Avoid assert.rejects inspecting a hostile exception to format a mismatch.
    await rejected.then(() => assert.fail('expected rejection'), actual => {
      assert.ok(Object.is(actual, error), 'original rejection identity');
    });
    assert.equal(session.completion(error), typeof error === 'object' && error !== null ? 'unknown' : undefined);
    assert.deepEqual(await queued, []);
    await session.close();
  }
  assert.equal(reads, 0);
});

test('first receipt survives changed or throwing metadata on repeated identity', async () => {
  for (const first of ['none', 'committed', 'unknown']) {
    let inspections = 0;
    const error = new Proxy({}, {
      getOwnPropertyDescriptor() {
        if (++inspections > 1) throw Error('metadata changed');
        return {value:first, configurable:true};
      },
    });
    const session = new WalletSession({generation:1, instance:'worker', call() { throw error; }, close() {}, });
    for (let i = 0; i < 2; i++) {
      await session.accounts.list().then(() => assert.fail('expected rejection'), actual => assert.ok(actual === error));
      assert.equal(session.completion(error), first);
    }
    assert.equal(inspections, 1);
    await session.close();
  }
});

test('fresh close failure remains original in the cached promise without a write receipt', async () => {
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const session = new WalletSession({generation:1, instance:'worker', call() {}, close() { throw revoked.proxy; }});
  const closed = session.close();
  await closed.then(() => assert.fail('expected rejection'), error => assert.ok(error === revoked.proxy));
  assert.equal(session.close(), closed);
  assert.equal(session.completion(revoked.proxy), undefined);
});
