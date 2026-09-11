import * as bindings from './scanner.js';
import { attach } from './runtime-host.mjs';
import { executeCase } from './case-entry.mjs';
let started = false;
onmessage = async ({ data }) => {
  if (started) return;
  started = true;
  try {
    const context = { secure:isSecureContext, isolated:crossOriginIsolated, sab:typeof SharedArrayBuffer };
    if (!context.secure || context.isolated || context.sab !== 'undefined') throw Error('no-SAB worker context required');
    postMessage({ stage:'worker-context', context });
    const response = await fetch('./scanner_bg.wasm');
    if (!response.ok) throw Error(`fixture module HTTP ${response.status}`);
    const module = await WebAssembly.compile(await response.arrayBuffer());
    const imports = WebAssembly.Module.imports(module);
    if (imports.some(i => i.module.startsWith('wasi'))) throw Error('unexpected WASI imports');
    postMessage({ stage:'module-compiled', imports });
    const e = await bindings.default({ module_or_path:module });
    if (!(e.memory.buffer instanceof ArrayBuffer)) throw Error('expected unshared memory');
    attach(e.memory);
    if (e.rt_init(1) !== 0) throw Error('runtime adapter init failed');
    const { result } = executeCase({ bindings, name:data.name, expected:data.expected, onStage:stage => postMessage({ stage }) });
    postMessage({ done:true, result });
  } catch (error) { postMessage({ failed:true, message:String(error), stack:error?.stack }); }
};
