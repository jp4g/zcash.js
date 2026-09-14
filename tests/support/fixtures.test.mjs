import test from 'node:test';
import { manifest, readFixture, nativeFixture } from './fixtures.mjs';

test('committed fixtures match their hashes and original native build receipts', () => {
  for (const path of Object.keys(manifest.sha256)) readFixture(path);
  nativeFixture('lightwire');
  nativeFixture('address');
});
