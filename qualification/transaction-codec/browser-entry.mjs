import init, * as bindings from './codec.js';
import { runCases } from './cases.mjs';

export async function run() {
  const context = { userAgent: navigator.userAgent, secure: isSecureContext,
    isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer };
  if (!context.secure || context.isolated || context.sab !== 'undefined') throw Error('expected no-SAB browser baseline');
  const wasm = await init();
  if (!(wasm.memory.buffer instanceof ArrayBuffer)) throw Error('expected unshared memory');
  const response = await fetch('./vectors.json');
  if (!response.ok) throw Error('vector fetch failed');
  return { context, result: runCases(bindings, await response.json()) };
}
