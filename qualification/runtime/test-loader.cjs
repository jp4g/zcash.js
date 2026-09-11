const { test } = require('node:test');
const assert = require('node:assert/strict');
test('loader rejects unknown imports before initialization', async () => {
  const { inventory } = await import('./loader.mjs');
  const unknown = new WebAssembly.Module(Uint8Array.from([
    0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,7,1,1,120,1,121,0,0,
  ]));
  assert.throws(() => inventory(unknown), /import contract/);
  const empty = new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0]));
  assert.throws(() => inventory(empty), /import contract/);
});
