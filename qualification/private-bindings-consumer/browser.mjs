// Entry runs in the ordinary page module realm. Server serves verified memory copies.
import { initialize, consensusContext } from './network.mjs';
import { run as behavior } from './behavior.mjs';
export async function run() {
  const response = await fetch('./bindings_bg.wasm', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw Error('WASM fixture unavailable');
  initialize(new Uint8Array(await response.arrayBuffer()));
  return { ...behavior(consensusContext), userAgent: navigator.userAgent };
}
