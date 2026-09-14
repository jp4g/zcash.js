// Private worker-local primitive. The future H1 owner supplies verified bytes and
// a validated genesis/parameter registration. This is not a public WalletClient.
import init, * as binding from './bindings.js';
import { copyBytes } from './bytes.mjs';
import * as host from './wallet-host/storage-host.mjs';
let attempted = false;
function uint(value) {
  if (!Number.isInteger(value) || value < 1 || value > 0xffffffff) throw TypeError('INVALID_ARGUMENT');
  return value;
}
export async function initializeStorage(wasm, backend, format, parameters, genesis) {
  const code = copyBytes(wasm, 32 * 1024 * 1024, 'invalid wasm bytes');
  const params = copyBytes(parameters, 256, 'invalid parameters');
  const identity = copyBytes(genesis, 32, 'invalid genesis');
  if (identity.length !== 32 || format !== 'zcash-js-network/1') throw TypeError('INVALID_ARGUMENT');
  if (attempted) throw Error('DOMAIN_USED');
  attempted = true;
  const instance = crypto.randomUUID();
  const exports = await init({ module_or_path: code });
  host.attach(exports.memory, backend);
  if (exports.wallet_pool_start() + exports.wallet_pool_size() > exports.__heap_base.value) throw Error('allocator overlap');
  if (exports.wallet_runtime_init() !== 0) throw Error('RUNTIME_UNAVAILABLE');
  const generation = binding.storage_initialize(format, params, identity);
  let closed = false, closeError;
  return {
    generation, instance,
    binding(token, owner) {
      uint(token);
      if (owner !== instance) throw Error('WRONG_INSTANCE');
      if (closed) throw Error('STALE_HANDLE');
      try { return new Uint8Array(binding.storage_binding(token)); }
      catch (error) { if (typeof error !== 'string') { closed = true; closeError = Error('DOMAIN_INVALID'); } throw error; }
    },
    close(token, owner) {
      uint(token);
      if (owner !== instance) throw Error('WRONG_INSTANCE');
      if (token !== generation) throw Error('STALE_HANDLE');
      if (closed) { if (closeError) throw closeError; return; }
      closed = true;
      try {
        binding.storage_close(token);
        // SQLite may ignore an xClose error. The host latch is authoritative too.
        if (host.state.closeError) throw Error('STORAGE_CLOSE_FAILED');
        backend.release();
      } catch { closeError = Error('STORAGE_CLOSE_FAILED'); throw closeError; }
    },
  };
}
