import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import * as abort from '../../dist/src/abort.js';
import * as owned from '../../dist/src/clients/owned-plumbing.js';
import { boundaryChecks } from '../support/boundary-checks.mjs';

test('shared boundary contract in Node (also exercised by Firefox)', async () => {
  await boundaryChecks({ ...abort, ...owned });
});

test('settled waits and closed bridges release their cancellation listeners', async () => {
  const controller = new AbortController();
  const stopped = Error('stopped');
  for (let index = 0; index < 1000; index++) {
    const value = abort.waitFor(Promise.resolve(index), controller.signal, () => stopped);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
    assert.equal(await value, index);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
  await assert.rejects(abort.waitFor(Promise.reject(stopped), controller.signal, () => stopped), error => error === stopped);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const bound = await abort.bridgeSignal(controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  bound.close();
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const pending = abort.waitFor(new Promise(() => {}), controller.signal, () => stopped);
  controller.abort();
  await assert.rejects(pending, error => error === stopped);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('record snapshots preserve their distinct ownership and error policies', () => {
  const bytes = new Uint8Array([7]);
  assert.equal(owned.copyRecord({ bytes }, ['bytes']).bytes, bytes);
  const snapshot = owned.snapshot({ bytes }, ['bytes']);
  bytes.fill(0);
  assert.equal(snapshot.bytes[0], 7);
  let foreign;
  try { abort.admitSignal(null); } catch (error) { foreign = error; }
  const hostile = new Proxy({}, { ownKeys() { throw foreign; } });
  assert.throws(() => owned.snapshot(hostile, []), error => error === foreign);
  assert.throws(() => owned.copyRecord(hostile, []), error => error !== foreign && error.code === 'INVALID_ARGUMENT');
});
