import init, { raw_exports } from './storage.js';
import * as host from './storage-host.mjs';
export async function load(bytes, backend) {
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  for (const i of imports) {
    const generated = i.module === './storage_bg.js' && [
      '__wbg___wbindgen_exports_3d3410a3b95d7b41',
      '__wbg___wbindgen_throw_5d9e815e6fdf150f', '__wbindgen_init_externref_table',
    ].includes(i.name);
    const callback = i.module === './storage-host.mjs' && [
      'entropy', 'utc_ms', 'sleep', 'host_error', 'file_open', 'file_close',
      'file_read', 'file_write', 'file_truncate', 'file_sync', 'file_size',
      'file_lock', 'file_unlock', 'file_reserved', 'file_delete', 'file_access',
    ].includes(i.name);
    if (i.kind !== 'function' || !(generated || callback)) throw Error(`unknown import ${i.module}.${i.name}`);
  }
  const e = await init({ module_or_path: module });
  if (raw_exports() !== e || !(e.memory.buffer instanceof ArrayBuffer)) throw Error('genuine generated bridge/baseline contract');
  const t = e.__wbindgen_externrefs;
  if (t.get(1024) !== undefined || t.get(1025) !== null || t.get(1026) !== true || t.get(1027) !== false) throw Error('generated start missing');
  host.attach(e.memory, backend);
  const rc = e.rt_init(1);
  if (rc) throw Error(`SQLite initialization ${rc}`);
  if (e.rt_pool_start() + e.rt_pool_size() > e.__heap_base.value) throw Error('pool overlaps Rust heap');
  return { e, state: host.state, imports };
}
