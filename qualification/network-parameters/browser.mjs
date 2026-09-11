import init, { observe } from './adapter.js';
import { parseNetworkParameters, bindNetworkDefinition } from './src/network-parameters.js';
import { cases, compare } from './parity.mjs';
export async function run() {
  await init();
  const bytes = cases()[0].bytes;
  const bound = bindNetworkDefinition({ identity: 'synthetic', genesisHash: '01'.repeat(32), parametersFormat: 'zcash-js-network/1', parameters: bytes });
  const original = bound.binding;
  bytes.fill(0); bound.parameters.bytes.fill(0);
  if (bound.binding !== original || bound.parameters.bytes[0] !== 123) throw Error('bytes not owned');
  const detached = cases()[0].bytes;
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  let rejected = false;
  try { parseNetworkParameters(detached, 'zcash-js-network/1'); } catch (e) { rejected = e.code === 'INVALID_ARGUMENT'; }
  if (!rejected) throw Error('detached input not rejected');
  const facts = await (await fetch('./source-constants.json')).json();
  const native = await (await fetch('./native-observations.json')).json();
  const observations = cases().map(c => { try { return JSON.parse(observe(c.bytes, c.height)); } catch { return null; } });
  if (JSON.stringify(observations) !== JSON.stringify(native)) throw Error('Firefox/native mismatch');
  return { ...compare(parseNetworkParameters, observations, facts), ownedBytes: true, detachedRejected: true, userAgent: navigator.userAgent };
}
