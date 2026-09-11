import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import * as bindings from './scanner.js';
import { attach } from './runtime-host.mjs';
import { executeCase } from './case-entry.mjs';
try {
  const bytes = await readFile(new URL('./scanner_bg.wasm', import.meta.url));
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(i => i.module.startsWith('wasi'))) throw Error('unexpected WASI imports');
  parentPort.postMessage({ stage: 'module-compiled', imports });
  const e = await bindings.default({ module_or_path: module });
  if (!(e.memory.buffer instanceof ArrayBuffer)) throw Error('expected unshared memory');
  attach(e.memory);
  if (e.rt_init(1) !== 0) throw Error('runtime adapter init failed');
  const { result } = executeCase({ bindings, name: workerData.name, expected: workerData.expected,
    onStage: stage => parentPort.postMessage({ stage }) });
  parentPort.postMessage({ done: true, result });
} catch (error) {
  parentPort.postMessage({ failed: true, message: String(error), stack: error?.stack });
}
