// Synthetic event-audit unit controls; these never claim browser execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireLifecycle } from './firefox-lifecycle.mjs';
const options = { after: 0, wanted: 1, owner: 'page', origin: 'http://127.0.0.1:1234' };
const created = realm => ({ method: 'script.realmCreated', params: {
  realm, type: 'dedicated-worker', owners: ['page'], origin: options.origin,
} });
const destroyed = realm => ({ method: 'script.realmDestroyed', params: { realm } });

test('requires independently observed creation and matching destruction', () => {
  for (const events of [[], [created('a')], [destroyed('a')],
    [created('a'), destroyed('other')], [destroyed('a'), created('a')]]) {
    assert.throws(() => requireLifecycle(events, options), /lifecycle/);
  }
  assert.deepEqual(requireLifecycle([created('a'), destroyed('a')], options).realms, ['a']);
});
test('rejects ambiguous counts, wrong owners and stale previous scenario events', () => {
  assert.throws(() => requireLifecycle([created('a'), created('b'), destroyed('a'), destroyed('b')], options), /lifecycle/);
  const wrong = created('a'); wrong.params.owners = ['other-page'];
  assert.throws(() => requireLifecycle([wrong, destroyed('a')], options), /lifecycle/);
  const wrongOrigin = created('a'); wrongOrigin.params.origin = 'https://example.invalid';
  assert.throws(() => requireLifecycle([wrongOrigin, destroyed('a')], options), /lifecycle/);
  assert.throws(() => requireLifecycle([created('a'), destroyed('a')], { ...options, after: 2 }), /lifecycle/);
});
test('pre-start cancellation requires no worker creation', () => {
  assert.deepEqual(requireLifecycle([], { ...options, wanted: 0 }).realms, []);
  assert.throws(() => requireLifecycle([created('a'), destroyed('a')], { ...options, wanted: 0 }), /lifecycle/);
});
