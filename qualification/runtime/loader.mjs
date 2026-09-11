// Qualification-only consumer of unedited wasm-bindgen 0.2.128 outputs.
const expectedImports = [
  './runtime-host.mjs.entropy:function',
  './runtime-host.mjs.sleep:function',
  './runtime-host.mjs.utc_ms:function',
  './qualification_bg.js.__wbg___wbindgen_exports_3d3410a3b95d7b41:function',
  './qualification_bg.js.__wbg___wbindgen_throw_5d9e815e6fdf150f:function',
  './qualification_bg.js.__wbindgen_init_externref_table:function',
].sort();
export function inventory(module) {
  const actual = WebAssembly.Module.imports(module).map(i => `${i.module}.${i.name}:${i.kind}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedImports)) {
    throw new Error(`import contract mismatch: ${JSON.stringify(actual)}`);
  }
  return actual;
}
export async function load({ module, bindingsURL = new URL('./qualification.js', import.meta.url),
                             target = 'web', entropyAvailable = true }) {
  inventory(module); // Reject all unknown imports, including WASI, before generated initialization.
  if (!['web', 'nodejs'].includes(target)) throw new Error('unknown generated target');
  const host = await import(new URL('./runtime-host.mjs', bindingsURL));
  host.state.entropyAvailable = entropyAvailable;
  const bindings = await import(bindingsURL);
  const e = target === 'web' ? await bindings.default({ module_or_path: module }) : bindings.raw_exports();
  if (bindings.raw_exports() !== e) throw new Error('generated instance bridge mismatch');
  if (!(e.memory.buffer instanceof ArrayBuffer)) throw new Error('baseline memory must be non-shared');
  // The actual generated start must initialize these entries; do not emulate it.
  const table = e.__wbindgen_externrefs;
  // Initial transformed externref table is 1024 entries; raw_exports may grow it.
  const offset = 1024;
  if (table.get(0) !== undefined || table.get(offset) !== undefined ||
      table.get(offset + 1) !== null || table.get(offset + 2) !== true || table.get(offset + 3) !== false) {
    throw new Error('generated externref initialization missing');
  }
  host.attach(e.memory);
  return { e, state: host.state };
}
