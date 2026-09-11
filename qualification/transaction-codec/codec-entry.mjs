import { decode as decodeGenerated } from './codec.js';
export { default, initSync, qualify } from './codec.js';

// Qualification entry: validate original JS fields before generated WASM narrowing.
export function decode(raw, branch) {
  if (typeof branch !== 'number' || !Number.isInteger(branch) || branch < 0 || branch > 0xffffffff) {
    throw new TypeError('branch must be a u32 integer');
  }
  if (!(raw instanceof Uint8Array)) throw new TypeError('raw must be Uint8Array');
  return decodeGenerated(raw, branch);
}
