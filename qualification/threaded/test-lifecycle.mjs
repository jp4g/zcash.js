import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireLifecycle } from './firefox-lifecycle.mjs';
const create = (realm, owners = ['page']) => ({ method: 'script.realmCreated', params: { realm, type: 'dedicated-worker', owners, origin: 'http://127.0.0.1:123/isolated/browser-worker.mjs' } });
const destroy = realm => ({ method: 'script.realmDestroyed', params: { realm } });
const options = { after: 0, wanted: 3, owner: 'page', origin: 'http://127.0.0.1:123', workerURLs: ['http://127.0.0.1:123/isolated/browser-worker.mjs'] };
const events = [create('a'),create('b'),create('c'),destroy('a'),destroy('b'),destroy('c')];
test('three direct worker realms require exactly one ordered destruction each', () => {
  assert.equal(requireLifecycle(events, options).records.length, 3);
  for (const invalid of [events.slice(0,-1), [...events,destroy('c')], [destroy('a'),...events.slice(0,3),...events.slice(4)], [create('a',['foreign']),...events.slice(1)]]) assert.throws(() => requireLifecycle(invalid, options));
});
