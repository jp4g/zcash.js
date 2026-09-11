// Same-instance SQLite imports. Every callback is owner-only, even though C
// globals are shared. SQLite has its own fixed MEMSYS5 arena; Rust owns its heap.
let memory, owner = false;
export const counters = { entropy: 0, time: 0, sleep: 0 };
export function attach(value, isOwner) {
  if (memory) throw Error('host already attached');
  if (!(value instanceof WebAssembly.Memory)) throw Error('memory required');
  memory = value; owner = isOwner;
}
function guard() { if (!owner || !memory) throw Error('owner-only host callback'); }
export function entropy(ptr, len) {
  guard(); ptr >>>= 0;
  if (!Number.isInteger(len) || len < 0 || len > 65536 || ptr + len > memory.buffer.byteLength) throw Error('entropy bounds');
  const temporary = new Uint8Array(len); crypto.getRandomValues(temporary);
  new Uint8Array(memory.buffer, ptr, len).set(temporary); counters.entropy++; return len;
}
export function utc_ms() { guard(); counters.time++; return Date.now(); }
export function sleep(us) {
  guard(); if (!Number.isInteger(us) || us < 0 || us > 20000) throw Error('sleep bounds');
  const start = performance.now(); while ((performance.now() - start) * 1000 < us) {}
  counters.sleep++; return Math.ceil((performance.now() - start) * 1000);
}
