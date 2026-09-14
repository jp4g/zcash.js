// Internal generated glue is only called after admission. Initialization must
// receive already-verified WASM bytes; it is not host/runtime negotiation.
import { initSync, consensus_branch } from './bindings.js';
import { copyBytes } from './bytes.mjs';

export function initialize(wasmBytes) {
  // This bounded binding accepts verified bytes only, never a URL/default fetch.
  initSync({ module: copyBytes(wasmBytes, 1048576, 'invalid wasm bytes') });
}

export function consensusContext(parametersFormat, parameters, height) {
  if (parametersFormat !== 'zcash-js-network/1') throw new TypeError('unsupported network format');
  if (!Number.isInteger(height) || height < 0 || height > 0xffffffff) throw new TypeError('invalid height');
  const owned = copyBytes(parameters, 256, 'invalid parameters');
  const branchId = consensus_branch(parametersFormat, owned, height);
  return Object.freeze({ height, branchId });
}
