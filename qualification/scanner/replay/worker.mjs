import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import init, { scanner_replay } from './scanner.js';
import { attach } from './runtime-host.mjs';
try {
  const bytes = await readFile(new URL('./scanner_bg.wasm', import.meta.url));
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(i => i.module.startsWith('wasi'))) throw Error('unexpected WASI imports');
  parentPort.postMessage({ stage: 'module-compiled', imports });
  const e = await init({ module_or_path: module });
  if (!(e.memory.buffer instanceof ArrayBuffer)) throw Error('expected unshared memory');
  attach(e.memory);
  if (e.rt_init(1) !== 0) throw Error('runtime adapter init failed');
  const result = scanner_replay(stage => parentPort.postMessage({ stage }));
  parentPort.postMessage({ done: true, result });
} catch (error) {
  parentPort.postMessage({ failed: true, message: String(error), stack: error?.stack });
}
