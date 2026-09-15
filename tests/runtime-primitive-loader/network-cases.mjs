// Async worker adaptation of accepted network corpus; golden data unchanged.
import { valid, invalid, encode, upgrades, format } from './vectors.mjs';
// Test-only golden from accepted protocol-0.10.6 source-constants.json at a280d31.
const branches = [0,1537743641,1991772603,733220448,4122551051,3925833126,3268858036,3370586197,1307332080,1412952880,933566043];
export async function run(consensusContext) {
  let accepted = 0, rejected = 0, admission = 0;
  const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`mismatch ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  const rejects = async fn => { let threw = false; try { await fn(); } catch { threw = true; } if (!threw) throw Error('expected rejection'); };
  for (const { text } of valid) {
    const values = upgrades.map(key => JSON.parse(text)[key]);
    const heights = new Set([0, 0xffffffff]);
    for (const h of values) if (h !== null) for (const n of [h - 1, h, h + 1]) if (n >= 0 && n <= 0xffffffff) heights.add(n);
    for (const height of heights) {
      const result = await consensusContext(format, encode(text), height);
      equal(result, { height, branchId: branches[values.findLastIndex(h => h !== null && h <= height) + 1] });
      equal(Object.isFrozen(result), true); accepted++;
    }
  }
  for (const { bytes } of invalid) { await rejects(async () => await consensusContext(format, bytes, 0)); rejected++; }
  const bytes = encode(valid[0].text);
  let coercions = 0;
  await rejects(async () => await consensusContext(format, bytes, { valueOf() { coercions++; return 20; } }));
  equal(coercions, 0); admission++;
  for (const height of [-1, 0x100000000, 1.1, NaN, Infinity, -Infinity, '20', 20n, null, undefined, true, {}, { valueOf() { throw Error('must not coerce'); } }]) {
    await rejects(async () => await consensusContext(format, bytes, height)); admission++;
  }
  for (const input of [[], {}, new Uint16Array(10), new DataView(bytes.buffer), null, new Uint8Array(257), new Uint8Array(0), Object.create(Uint8Array.prototype)]) {
    await rejects(async () => await consensusContext(format, input, 20)); admission++;
  }
  for (const f of ['unknown', null, { toString() { return format; } }]) { await rejects(async () => await consensusContext(f, bytes, 20)); admission++; }
  const detached = bytes.slice(); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  await rejects(async () => await consensusContext(format, detached, 20)); admission++;
  if (typeof SharedArrayBuffer !== 'undefined') { await rejects(async () => await consensusContext(format, new Uint8Array(new SharedArrayBuffer(256)), 20)); admission++; }
  const oversized = new Uint8Array(257);
  Object.defineProperty(oversized, 'byteLength', { value: 1 });
  await rejects(async () => await consensusContext(format, oversized, 20)); admission++;
  const forged = new Uint16Array(10); Object.setPrototypeOf(forged, Uint8Array.prototype);
  await rejects(async () => await consensusContext(format, forged, 20)); admission++;
  const storage = new Uint8Array(bytes.length + 8); storage.set(bytes, 4);
  equal(await consensusContext(format, storage.subarray(4, -4), 20), { height: 20, branchId: branches[2] });
  const retained = await consensusContext(format, bytes, 20); bytes.fill(0);
  equal(retained, { height: 20, branchId: branches[2] });
  await rejects(async () => await consensusContext(format, bytes, 20));
  return { cases: accepted + rejected, accepted, rejected, admission, subview: true, independentResult: true, detachedRejected: true };
}
