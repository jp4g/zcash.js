// Observed genuine generated import contract; rejects extra host/WASI imports.
export function checkThreaded(module) {
  const expected = [
    './qualification_bg.js.memory:memory',
    './qualification_bg.js.__wbg___wbindgen_throw_5d9e815e6fdf150f:function',
    './qualification_bg.js.__wbg___wbindgen_exports_3d3410a3b95d7b41:function',
    './qualification_bg.js.__wbindgen_init_externref_table:function',
    './runtime-host.mjs.entropy:function', './runtime-host.mjs.sleep:function', './runtime-host.mjs.utc_ms:function',
  ].sort();
  const actual = WebAssembly.Module.imports(module).map(i => `${i.module}.${i.name}:${i.kind}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('threaded import contract');
}
