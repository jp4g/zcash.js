import init, { observe } from './adapter.js';
import { parseNetworkParameters } from './src/network-parameters.js';
import { cases, compare } from './parity.mjs';
export async function run() {
  await init();
  const facts = await (await fetch('./source-constants.json')).json();
  const native = await (await fetch('./native-observations.json')).json();
  const observations = cases().map(c => { try { return JSON.parse(observe(c.bytes, c.height)); } catch { return null; } });
  if (JSON.stringify(observations) !== JSON.stringify(native)) throw Error('Firefox/native mismatch');
  return { ...compare(parseNetworkParameters, observations, facts), userAgent: navigator.userAgent };
}
