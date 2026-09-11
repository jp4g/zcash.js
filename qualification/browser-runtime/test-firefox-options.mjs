import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firefoxOptions } from './firefox-options.mjs';

test('packaged driver auto-detects its binary by default, without sandbox overrides', () => {
  assert.deepEqual(firefoxOptions(), { args: ['-headless'] });
});
test('explicit real binary is an opt-in; Snap launcher is rejected before session creation', () => {
  const binary = '/snap/firefox/current/usr/lib/firefox/firefox';
  assert.deepEqual(firefoxOptions(binary), { binary, args: ['-headless'] });
  assert.throws(() => firefoxOptions('/snap/bin/firefox'), /launcher/);
});
