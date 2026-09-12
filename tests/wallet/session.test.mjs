import assert from 'node:assert/strict';
import test from 'node:test';
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
  await assert.rejects(session.accounts.list(), /SESSION_CLOSED/);
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
    await assert.rejects(session.accounts.list(), /SESSION_CLOSED/);
  }
});

test('public Birthday projection is not admitted', async () => {
  const session = new WalletSession({generation:1, instance:'worker',
    call() { assert.fail('must not invoke native import'); }, close() {},
  });
  await assert.rejects(session.accounts.import({viewingKey:'test', birthday:{}}), /INVALID_ARGUMENT/);
  const args = {viewingKey:'test', birthday:'fullScan'};
  const queued = session.accounts.import(args);
  args.birthday = {};
  await assert.rejects(queued, /INVALID_ARGUMENT/);
  await assert.rejects(session.accounts.import({get birthday() { assert.fail('getter invoked'); }}), /INVALID_ARGUMENT/);
  await session.close();
});
