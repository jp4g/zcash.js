// Real generator contract: no synthetic binding implementation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.RUNTIME_BINDINGS || '/home/jack/zcash-generated-runtime-scratch/initial';
test('Node generated glue exposes genuine raw export bridge', () => {
  const js = fs.readFileSync(path.join(root, 'nodejs/qualification.js'), 'utf8');
  assert.match(js, /exports\.raw_exports\s*=/);
});
test('both generated targets use relative host and retain heap bound', () => {
  for (const target of ['web', 'nodejs']) {
    const module = new WebAssembly.Module(fs.readFileSync(path.join(root, target, 'qualification_bg.wasm')));
    assert(WebAssembly.Module.imports(module).some(i => i.module === './runtime-host.mjs'));
    assert(WebAssembly.Module.exports(module).some(e => e.name === '__heap_base'));
  }
});
