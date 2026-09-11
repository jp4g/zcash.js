import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Domain } from './domain.mjs';
const fake = (events, mode = 'ready') => role => {
  const worker = { role, onmessage: null, onerror: null,
    postMessage(message) { events.push([role, message.type]); if (message.type === 'init') {
      queueMicrotask(() => { if (mode === 'error') worker.onerror?.(Error('injected'));
        else if (mode !== 'stall') worker.onmessage?.({ data: { type: role === 'owner' ? 'pool' : 'loaded', role } }); });
    } else if (message.type === 'build') queueMicrotask(() => worker.onmessage?.({ data: { type: 'ready' } }));
    else if (message.type === 'call') queueMicrotask(() => worker.onmessage?.({ data: { type: 'result', id: message.id, result: 42 } })); },
    async terminate() { events.push([role, 'terminated']); },
  }; return worker;
};
test('cached readiness, reject exports before ready; all workers terminated on close', async () => {
  const events = []; const d = new Domain({ spawn: fake(events), count: 2, timeout: 1000 });
  assert.throws(() => d.call('sql'), /not ready/);
  const ready = d.start(); assert.equal(ready, d.start()); await ready;
  assert.equal(await d.call('sql'), 42); await d.close(); await d.close();
  assert.equal(events.filter(e => e[1] === 'terminated').length, 3);
  assert.throws(() => d.call('sql'), /not ready/);
});
for (const mode of ['error', 'stall']) test(`${mode}: cleanup precedes fresh baseline; no operation replay`, async () => {
  const events = []; const d = new Domain({ spawn: fake(events, mode), count: 2, timeout: 20,
    fallback: async reason => { events.push(['fallback', reason]); return { fresh: true }; } });
  const result = await d.start(); assert.equal(result.fresh, true);
  assert.equal(events[1][1], 'terminated'); assert.equal(events[2][0], 'fallback');
  assert.throws(() => d.call('sql'), /not ready/); await d.close();
});
test('pool fault after readiness invalidates domain without fallback or replay', async () => {
  const events = []; let owner;
  const factory = fake(events); const d = new Domain({ spawn: role => { const worker = factory(role); if (role === 'owner') owner = worker; return worker; }, count: 2,
    fallback: async () => { throw Error('must not fallback after ready'); } });
  await d.start(); owner.onerror(Error('crash')); await d.close();
  assert.throws(() => d.call('sql'), /not ready/);
});
test('invalid worker counts fail before allocation', () => {
  for (const count of [0, -1, 1.5, 9, NaN]) assert.throws(() => new Domain({ spawn() {}, count }), /count/);
});
