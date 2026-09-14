// Synchronous scalar ABI shared by Node fs and dedicated-worker OPFS consumers.
// These are consumer imports, never edits to generated wasm-bindgen output.
export const RC = { OK: 0, BUSY: 5, READONLY: 8, IOERR: 10, FULL: 13, CANTOPEN: 14,
  READ: 266, SHORT: 522, WRITE: 778, FSYNC: 1034, TRUNCATE: 1546,
  FSTAT: 1802, UNLOCK: 2058, DELETE: 2570, ACCESS: 3338, LOCK: 3850, CLOSE: 4106 };
let memory, backend;
const files = new Map();
let next = 1;
export const state = { last: '', lastCode: 0, closeError: false };
export function attach(mem, host) {
  if (memory || !(mem.buffer instanceof ArrayBuffer)) throw Error('host attach/nonshared contract');
  memory = mem; backend = host;
}
function bytes(ptr, n) {
  ptr >>>= 0;
  if (!Number.isSafeInteger(n) || n < 0 || ptr + n > memory.buffer.byteLength) throw Error('memory bounds');
  return new Uint8Array(memory.buffer, ptr, n);
}
function string(ptr) {
  const b = bytes(ptr, Math.min(512, memory.buffer.byteLength - (ptr >>> 0)));
  const end = b.indexOf(0);
  if (end < 0) throw Error('unterminated path');
  return new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, end));
}
function name(ptr) {
  const value = string(ptr);
  if (!['/wallet.db', '/wallet.db-journal'].includes(value)) throw Object.assign(Error('unsupported path'), { code: 'EINVAL' });
  return value.slice(1);
}
function offset(at) {
  if (typeof at !== 'bigint' || at < 0n || at > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('offset bounds');
  return Number(at);
}
function int(ptr, n) { new DataView(bytes(ptr, 4).buffer).setInt32(ptr >>> 0, n, true); }
function lease() { if (!backend?.owned) throw Object.assign(Error('owner lease absent'), { code: 'EBUSY' }); }
function get(id) { lease(); const f = files.get(id); if (!f) throw Error('closed file'); return f; }
export function mapError(error, fallback) {
  // DOMException.code is a legacy numeric value; its name carries the category.
  const tag = typeof error.code === 'string' ? error.code : error.name;
  if (['ENOSPC', 'EDQUOT', 'QuotaExceededError'].includes(tag)) return RC.FULL;
  if (['EACCES', 'EPERM', 'NotAllowedError'].includes(tag)) return RC.READONLY;
  if (['EBUSY', 'EAGAIN', 'NoModificationAllowedError'].includes(tag)) return RC.BUSY;
  return fallback;
}
function attempt(op, file, fallback, fn) {
  try {
    lease();
    const rc = fn();
    return rc;
  } catch (e) {
    const rc = mapError(e, fallback);
    state.last = `${op}:${typeof e.code === 'string' ? e.code : e.name}`; state.lastCode = rc;
    if (op === 'close') state.closeError = true;
    return rc;
  }
}
export function file_open(ptr, flags, out) {
  const path = name(ptr);
  return attempt('open', path, RC.CANTOPEN, () => {
    const type = flags & (0x100 | 0x800 | 0x80000 | 0x4000 | 0x200 | 0x400 | 0x1000 | 0x2000);
    const readOnly = (flags & 3) === 1;
    if (type !== (path === 'wallet.db' ? 0x100 : 0x800) || ![1, 2].includes(flags & 3) || flags & (8 | 16) || (readOnly && (flags & 4))) return RC.CANTOPEN;
    if ([...files.values()].some(f => f.path === path)) return RC.BUSY;
    const handle = backend.open(path, Boolean(flags & 4), readOnly);
    const id = next++; files.set(id, { path, handle, level: 0, readOnly }); int(out, id); return RC.OK;
  });
}
export function file_close(id) {
  const f = get(id);
  return attempt('close', f.path, RC.CLOSE, () => { backend.close(f.handle); files.delete(id); return RC.OK; });
}
export function file_read(id, ptr, n, at) {
  const f = get(id);
  return attempt('read', f.path, RC.READ, () => {
    const target = bytes(ptr, n); target.fill(0);
    const count = backend.read(f.handle, target, offset(at));
    if (!Number.isInteger(count) || count < 0 || count > n) return RC.READ;
    return count === n ? RC.OK : RC.SHORT;
  });
}
export function file_write(id, ptr, n, at) {
  const f = get(id);
  return attempt('write', f.path, RC.WRITE, () => {
    if (f.readOnly) return RC.READONLY;
    const source = bytes(ptr, n); let wrote = 0;
    while (wrote < n) {
      const count = backend.write(f.handle, source.subarray(wrote), offset(at) + wrote);
      if (!Number.isInteger(count) || count <= 0 || count > n - wrote) return RC.WRITE;
      wrote += count;
    }
    return RC.OK;
  });
}
export function file_truncate(id, size) {
  const f = get(id);
  return attempt('truncate', f.path, RC.TRUNCATE, () => { if (f.readOnly) return RC.READONLY; backend.truncate(f.handle, offset(size)); return RC.OK; });
}
export function file_sync(id, flags) {
  const f = get(id);
  return attempt('sync', f.path, RC.FSYNC, () => { backend.sync(f.handle, flags); return RC.OK; });
}
export function file_size(id, out) {
  const f = get(id);
  return attempt('size', f.path, RC.FSTAT, () => {
    const n = backend.size(f.handle);
    if (!Number.isSafeInteger(n) || n < 0) return RC.FSTAT;
    new DataView(bytes(out, 8).buffer).setBigInt64(out >>> 0, BigInt(n), true); return RC.OK;
  });
}
export function file_lock(id, level) {
  const f = get(id);
  return attempt('lock', f.path, RC.LOCK, () => {
    if (f.path !== 'wallet.db' || level < 1 || level > 4) return RC.LOCK;
    f.level = Math.max(f.level, level); return RC.OK;
  });
}
export function file_unlock(id, level) {
  const f = get(id);
  return attempt('unlock', f.path, RC.UNLOCK, () => {
    if (![0, 1].includes(level) || level > f.level) return RC.UNLOCK;
    f.level = level; return RC.OK;
  });
}
export function file_reserved(id, out) {
  const f = get(id);
  return attempt('reserved', f.path, RC.LOCK, () => { int(out, f.level >= 2 ? 1 : 0); return RC.OK; });
}
export function file_delete(ptr, sync) {
  const path = name(ptr);
  return attempt('delete', path, RC.DELETE, () => {
    if (path !== 'wallet.db-journal') return RC.DELETE;
    backend.delete(path, sync); return RC.OK;
  });
}
export function file_access(ptr, flags, out) {
  const path = name(ptr);
  return attempt('access', path, RC.ACCESS, () => { int(out, backend.access(path, flags) ? 1 : 0); return RC.OK; });
}
export function host_error(size, ptr) {
  if (size > 0) { const b = bytes(ptr, size); b.fill(0); b.set(new TextEncoder().encode(state.last).subarray(0, size - 1)); }
  return state.lastCode;
}
export function entropy(ptr, n) {
  if (n < 0 || n > 65536) throw Error('entropy bounds');
  try { crypto.getRandomValues(bytes(ptr, n)); return n; } catch { return 0; }
}
export function utc_ms() { return Date.now(); }
export function sleep(us) {
  if (!Number.isInteger(us) || us < 0 || us > 20000) throw Error('sleep bounds');
  const start = performance.now();
  while ((performance.now() - start) * 1000 < us) { /* bounded owner-local delay */ }
  return Math.ceil((performance.now() - start) * 1000);
}
