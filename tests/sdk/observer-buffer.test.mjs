import test from 'node:test';
import assert from 'node:assert/strict';
import { ObserverBuffer } from '../../dist/src/observer-buffer.js';

test('observer buffer drains completed work and releases discarded reservations once', async () => {
  const overflow = new Error('overflow');
  const buffer = new ObserverBuffer(1, () => overflow);
  let released = 0;
  const reserve = () => () => { released++; };
  buffer.push('first', reserve);
  assert.throws(() => buffer.push('overflow', () => assert.fail('must not reserve')), error => error === overflow);
  buffer.end();
  assert.deepEqual(await buffer.next(() => assert.fail('must not start')), { done: false, value: 'first' });
  assert.equal(released, 1);
  buffer.close();
  assert.equal(released, 1);
  assert.equal((await buffer.next(() => assert.fail('must not start'))).done, true);

  const failing = new ObserverBuffer(2, () => overflow);
  failing.push('discarded', reserve);
  failing.close(overflow);
  failing.close();
  assert.equal(released, 2);
  await assert.rejects(failing.next(() => assert.fail('must not start')), error => error === overflow);
});

test('observer buffer rejects overlapping reads and wakes a cancelled reader', async () => {
  const buffer = new ObserverBuffer(1, () => new Error('overflow'));
  const read = buffer.next(() => {});
  await assert.rejects(buffer.next(() => assert.fail('overlapping start')), { code: 'INVALID_ARGUMENT' });
  buffer.close();
  assert.equal((await read).done, true);
  buffer.push('late', () => assert.fail('must not reserve after close'));
  assert.equal((await buffer.next(() => assert.fail('must not restart'))).done, true);
});
