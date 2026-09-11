import init, { scanner_replay } from './scanner.js';
import { attach } from './runtime-host.mjs';
try {
  if (globalThis.crossOriginIsolated || typeof SharedArrayBuffer !== 'undefined') throw Error('this probe requires no-SAB baseline');
  const response = await fetch('./scanner_bg.wasm');
  if (!response.ok) throw Error(`fixture module HTTP ${response.status}`);
  const module = await WebAssembly.compile(await response.arrayBuffer());
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(i => i.module.startsWith('wasi'))) throw Error('unexpected WASI imports');
  postMessage({ stage: 'module-compiled', imports });
  const e = await init({ module_or_path: module });
  if (!(e.memory.buffer instanceof ArrayBuffer)) throw Error('expected unshared memory');
  attach(e.memory);
  if (e.rt_init(1) !== 0) throw Error('runtime adapter init failed');
  const result = scanner_replay(stage => postMessage({ stage }));
  postMessage({ done: true, result });
} catch (error) { postMessage({ failed: true, message: String(error), stack: error?.stack }); }
