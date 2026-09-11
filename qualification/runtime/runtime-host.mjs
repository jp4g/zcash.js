// Worker-local host services shared by real generated Node and browser bindings.
// A host exception invalidates this disposable instance; callers destroy its worker.
let memory;
export const state = { entropyAvailable: true, entropyCalls: 0, timeCalls: 0, sleepCalls: 0 };
export function attach(value) {
  if (memory) throw new Error('host already attached');
  if (!(value instanceof WebAssembly.Memory) || !(value.buffer instanceof ArrayBuffer)) {
    throw new Error('expected non-shared WASM memory');
  }
  memory = value;
}
export function entropy(ptr, len) {
  if (!memory) throw new Error('host memory not attached');
  if (!state.entropyAvailable || typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('entropy unavailable; discard instance');
  }
  // C pointers arrive as signed i32; reinterpret only after validating scalar ABI.
  if (!Number.isInteger(ptr) || ptr < -2147483648 || ptr > 4294967295 ||
      !Number.isInteger(len) || len < 0 || len > 65536) throw new Error('entropy range');
  ptr >>>= 0;
  const buffer = memory.buffer; // Refresh on each call after Rust memory.grow.
  if (ptr + len > buffer.byteLength) throw new Error('entropy range');
  globalThis.crypto.getRandomValues(new Uint8Array(buffer, ptr, len));
  state.entropyCalls++;
  return len;
}
export function utc_ms() {
  state.timeCalls++;
  return Date.now();
}
export function sleep(us) {
  if (!Number.isInteger(us) || us < 0 || us > 20000) throw new Error('sleep range');
  const start = performance.now();
  while ((performance.now() - start) * 1000 < us) { /* bounded worker-local wait */ }
  state.sleepCalls++;
  return Math.ceil((performance.now() - start) * 1000);
}
