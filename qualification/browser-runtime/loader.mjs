import { bindMemory } from './runtime-host.mjs';

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function loadRuntime(manifest) {
  async function verified(name) {
    const response = await fetch(new URL(name, import.meta.url));
    if (!response.ok) throw new Error(`asset HTTP ${response.status}: ${name}`);
    const bytes = await response.arrayBuffer();
    const expected = manifest.files[name];
    if (!expected || bytes.byteLength !== expected.bytes || await digest(bytes) !== expected.sha256) {
      throw new Error(`asset integrity: ${name}`);
    }
    return bytes;
  }
  const bytes = await verified('qualification_bg.wasm');
  await verified('qualification.js');
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (JSON.stringify(imports) !== JSON.stringify(manifest.imports)) throw new Error('module import inventory mismatch');
  // The loopback server serves the exact pre-hashed buffers for this entire run.
  // This is a qualification loader, not the planned production manifest loader.
  const generated = await import('./qualification.js');
  const exports = await generated.default({ module_or_path: module });
  // Inspect immediately after generated start; raw_exports() itself may grow
  // the externref table, so its later end is not the initialization offset.
  const table = exports.__wbindgen_externrefs;
  const end = table.length;
  if (table.get(0) !== undefined || table.get(end - 4) !== undefined ||
      table.get(end - 3) !== null || table.get(end - 2) !== true || table.get(end - 1) !== false) {
    throw new Error('generated externref initialization missing');
  }
  if (generated.raw_exports() !== exports) throw new Error('same generated instance bridge mismatch');
  bindMemory(exports.memory);
  return { exports, evidence: {
    label: manifest.label, rawSha256: manifest.raw.sha256,
    generatedWasmSha256: manifest.files['qualification_bg.wasm'].sha256,
    generatedGlueSha256: manifest.files['qualification.js'].sha256,
    probeSha256: manifest.files['probe-worker.mjs'].sha256, imports,
  } };
}
