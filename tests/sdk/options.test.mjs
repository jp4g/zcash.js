import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmationsPolicy, observationOptions, recoveryPolicy } from '../../dist/src/options.js';
import { provingOptions } from '../../dist/src/wallet/proving-assets.js';

test('configuration normalization captures nested values and preserves callback ownership', async () => {
  const input = { mode: 'online', timeoutMs: 100, rebroadcast: { mode: 'previously-dispatched', maxAttempts: 2, minIntervalMs: 5 } };
  const owned = recoveryPolicy(input, true, true);
  input.rebroadcast.maxAttempts = 99;
  assert.equal(owned.rebroadcast.maxAttempts, 2);
  assert.ok(Object.isFrozen(owned.rebroadcast));
  assert.deepEqual(recoveryPolicy(undefined, false, false), { mode: 'offline' });
  assert.deepEqual(recoveryPolicy(undefined, true, false), { mode: 'online', timeoutMs: 15000 });
  assert.throws(() => recoveryPolicy(input, false, true), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => recoveryPolicy(input, true, false), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => confirmationsPolicy({ trusted: -1, untrusted: 1, allowZeroConfirmationShielding: false }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => observationOptions({ get pollIntervalMs() { assert.fail('getter'); }, maxBufferedUpdates: 1 }), { code: 'INVALID_ARGUMENT' });
  const options = {
    kind: 'local', assets: [], cache: { kind: 'memory', maxBytes: 1 }, maxConcurrentProofs: 1,
    loadAsset(args) { assert.equal(this, options); return args; },
  };
  const proving = provingOptions(provingOptions(options));
  options.loadAsset = () => assert.fail('mutated callback');
  assert.equal(await proving.loadAsset('request'), 'request');
});
