import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindMemory, entropy, utc_ms, sleep, state } from './runtime-host.mjs';

test('host writes real entropy through refreshed memory and rejects invalid ranges', () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
  bindMemory(memory);
  assert.equal(entropy(0, 32), 32);
  const old = memory.buffer;
  memory.grow(1);
  assert.equal(old.byteLength, 0);
  assert.equal(entropy(65536, 32), 32);
  assert.equal(state.lastEntropyMemoryBytes, 131072);
  assert.throws(() => entropy(131071, 2), /entropy bounds/);
  assert.throws(() => entropy(0, 65537), /entropy bounds/);
  assert.throws(() => entropy(-1, 1), /entropy bounds/);
  assert.throws(() => entropy(0, -1), /entropy bounds/);
});

test('host time and bounded synchronous sleep are real; loss fails explicitly', () => {
  const before = Date.now();
  assert(utc_ms() >= before);
  const start = performance.now();
  assert(sleep(2000) >= 2000);
  assert(performance.now() - start >= 2);
  assert.throws(() => sleep(20001), /sleep bounds/);
  state.entropyAvailable = false;
  assert.throws(() => entropy(0, 32), /entropy unavailable/);
  state.timeAvailable = false;
  assert.throws(() => utc_ms(), /time unavailable/);
  state.sleepAvailable = false;
  assert.throws(() => sleep(2000), /sleep unavailable/);
});
