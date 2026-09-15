import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../../dist/src/clients/owned-plumbing.js';
import { addressInput, broadcastInput } from '../../dist/src/clients/request-inputs.js';

test('record copying is field-neutral and request boundaries explicitly own nested inputs', () => {
  const metadata = { bytes: 'byte count', addresses: 'address description' };
  assert.deepEqual({ ...snapshot(metadata, ['bytes', 'addresses']) }, metadata);
  const bytes = new Uint8Array([1, 2]);
  const addresses = ['first', 'second'];
  const broadcast = broadcastInput({ bytes });
  const lookup = addressInput({ addresses });
  bytes.fill(0);
  addresses[0] = 'changed';
  assert.deepEqual([...broadcast.bytes], [1, 2]);
  assert.deepEqual(lookup.addresses, ['first', 'second']);
  const hostile = Object.defineProperty(['first'], '0', { get() { assert.fail('getter'); } });
  assert.throws(() => addressInput({ addresses: hostile }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => addressInput({ addresses: [] }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => addressInput({ addresses: Array(1001).fill('address') }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => broadcastInput({ bytes: new Uint8Array(4 * 1024 * 1024 + 1) }), { code: 'RESOURCE_LIMIT' });
});
