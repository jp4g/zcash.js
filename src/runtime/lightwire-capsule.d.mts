import type { LightUnaryMethod, LightStreamMethod } from '../../docs/api/public-api.js';
export interface LightwireCodec {
  encodeTreeState(json: string): Uint8Array;
  encodeRequest(method: LightUnaryMethod | LightStreamMethod, json: string): Uint8Array;
  decodeResponse(method: LightUnaryMethod, payload: Uint8Array): unknown;
  decodeItem(method: LightStreamMethod, payload: Uint8Array): unknown;
}
/** Lazily initialize the package-owned Rust codec; repeated calls reuse it. */
export function initialize(): Readonly<LightwireCodec>;
