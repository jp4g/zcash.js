// Entry runs in the ordinary page module realm. Server serves verified memory copies.
import { initialize, consensusContext } from './network.mjs';
import { decodeTransaction } from './transaction.mjs';
import { admission, run as transactions } from './transaction-behavior.mjs';
import { run as behavior } from './behavior.mjs';
export async function run() {
  const response = await fetch('./bindings_bg.wasm', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw Error('WASM fixture unavailable');
  const wasm = new Uint8Array(await response.arrayBuffer());
  const beforeInit = admission(decodeTransaction, initialize, consensusContext, wasm);
  initialize(wasm);
  const vectors = await (await fetch('./transaction-vectors.json')).json();
  return { ...behavior(consensusContext), transactions: transactions(decodeTransaction, vectors), beforeInit, userAgent: navigator.userAgent };
}
