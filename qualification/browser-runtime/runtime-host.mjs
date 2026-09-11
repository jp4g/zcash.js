// Qualification host only: no filesystem or external provider access.
let memory;
export const state = {
  entropyAvailable: true, timeAvailable: true, sleepAvailable: true,
  entropyCalls: 0, timeCalls: 0, sleepCalls: 0, lastEntropyMemoryBytes: 0,
};
export function bindMemory(value) {
  if (!(value instanceof WebAssembly.Memory) || !(value.buffer instanceof ArrayBuffer)) {
    throw new Error('non-shared WASM memory required');
  }
  if (memory) throw new Error('host already attached; use a fresh worker');
  memory = value;
}
export function entropy(ptr, len) {
  if (!state.entropyAvailable) throw new Error('entropy unavailable; discard instance');
  // Refresh on every call. Never retain a view across a Rust allocation.
  const buffer = memory?.buffer;
  if (!buffer || !Number.isInteger(ptr) || !Number.isInteger(len) ||
      ptr < 0 || len < 0 || len > 65536 || ptr + len > buffer.byteLength) {
    throw new Error('entropy bounds');
  }
  crypto.getRandomValues(new Uint8Array(buffer, ptr, len));
  state.entropyCalls++;
  state.lastEntropyMemoryBytes = buffer.byteLength;
  return len;
}
export function utc_ms() {
  if (!state.timeAvailable) throw new Error('time unavailable; discard instance');
  state.timeCalls++;
  return Date.now();
}
export function sleep(us) {
  if (!state.sleepAvailable) throw new Error('sleep unavailable; discard instance');
  if (!Number.isInteger(us) || us < 0 || us > 20000) throw new Error('sleep bounds');
  const start = performance.now();
  // Bounded synchronous SQLite callback on dedicated worker; no SAB/Atomics.
  while ((performance.now() - start) * 1000 < us) { /* local wait */ }
  state.sleepCalls++;
  return Math.ceil((performance.now() - start) * 1000);
}
