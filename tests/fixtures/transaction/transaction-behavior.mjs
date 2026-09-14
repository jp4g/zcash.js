// Synthetic expectations from the accepted transaction-codec corpus; no codec algorithms here.
const check = (ok, message) => { if (!ok) throw Error(message); };
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g), n => parseInt(n, 16));
function rejects(fn, expected) {
  try { fn(); } catch (e) { check(String(e).includes(expected), `unexpected error: ${e}`); return; }
  throw Error(`expected rejection: ${expected}`);
}
function compare(result, v) {
  check(hex(result.bytes) === v.hex, `${v.name}: serialization mismatch`);
  check(hex(result.txid) === v.txid, `${v.name}: txid mismatch`);
  check(result.display === v.display, `${v.name}: display mismatch`);
}

export function admission(decode, initialize, consensusContext, wasm) {
  let count = 0;
  const bytes = Uint8Array.of(1);
  for (const branch of [-1, 2 ** 32, .5, '1', new Number(1), NaN, Infinity, -Infinity, null, undefined, 1n,
    { valueOf() { throw Error('coercion'); } }]) {
    rejects(() => decode(bytes, branch), 'TypeError: invalid branch'); count++;
  }
  const detached = bytes.slice(); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const oversized = new Uint8Array(2097153); Object.defineProperty(oversized, 'byteLength', { value: 1 });
  const forged = new Uint16Array(10); Object.setPrototypeOf(forged, Uint8Array.prototype);
  for (const raw of [[], {}, null, new Uint16Array(2), new DataView(bytes.buffer), new Uint8Array(0),
    Object.create(Uint8Array.prototype), new Proxy(bytes, {}), detached, oversized, forged]) {
    rejects(() => decode(raw, 1), 'TypeError: invalid transaction bytes'); count++;
  }
  let sharedControls = 0;
  if (typeof SharedArrayBuffer !== 'undefined') {
    const doc = new TextEncoder().encode('{"encoding":"regtest","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}');
    for (const [raw, call, expected] of [
      [wasm, initialize, 'invalid wasm bytes'],
      [doc, v => consensusContext('zcash-js-network/1', v, 20), 'invalid parameters'],
      [bytes, v => decode(v, 1), 'invalid transaction bytes'],
    ]) {
      const backing = new SharedArrayBuffer(raw.length), view = new Uint8Array(backing); view.set(raw);
      rejects(() => call(view), `TypeError: ${expected}`); sharedControls++;
      Object.setPrototypeOf(backing, ArrayBuffer.prototype);
      rejects(() => call(view), `TypeError: ${expected}`); sharedControls++;
    }
  }
  // Valid types reach the real glue before initialization, whereas controls above never do.
  rejects(() => decode(bytes, 1), 'TypeError');
  return { beforeInit: count, sharedControls };
}

export function run(decode, vectors) {
  check(vectors.length === 13, 'qualified corpus size');
  let calls = 0, truncated = 0;
  for (const v of vectors) {
    const raw = unhex(v.hex), actual = decode(raw, v.branch);
    compare(actual, v); calls++;
    rejects(() => compare(actual, { ...v, txid: v.display }), 'txid mismatch');
    rejects(() => decode(Uint8Array.of(...raw, 0), v.branch), 'trailing bytes'); calls++;
    rejects(() => decode(raw.subarray(0, -1), v.branch), 'parse:'); calls++;
    rejects(() => decode(raw, 0xffffffff), 'unknown context branch'); calls++;
    rejects(() => decode(raw, 0), v.version >= 5 ? 'branch mismatch' : 'version/context mismatch'); calls++;
    for (const b of [v.branch + 2 ** 32, v.branch - 2 ** 32, v.branch + .5, String(v.branch), new Number(v.branch), NaN, Infinity]) {
      rejects(() => decode(raw, b), 'TypeError: invalid branch'); calls++;
    }
    for (const bytes of [Array.from(raw), Uint16Array.from(raw), Array.from(raw, n => n + 256)]) {
      rejects(() => decode(bytes, v.branch), 'TypeError: invalid transaction bytes'); calls++;
    }
    const padded = Uint8Array.of(0, ...raw, 0);
    compare(decode(padded.subarray(1, -1), v.branch), v); calls++;
    const cuts = new Set([...Array(Math.min(raw.length, 128)).keys(), Math.floor(raw.length / 2), raw.length - 1]);
    for (const n of cuts) { rejects(() => decode(raw.subarray(0, n), v.branch), n === 0 ? 'invalid transaction bytes' : 'parse:'); truncated++; }
    const malformed = raw.slice(); malformed.fill(0, 4, 8);
    rejects(() => decode(malformed, v.branch), 'parse:');
    if (v.version >= 5) {
      malformed.set(raw); malformed.fill(255, 8, 12);
      rejects(() => decode(malformed, v.branch), 'parse:');
    }
    check(Object.isFrozen(actual), 'result record must be frozen');
    check(actual.bytes.buffer !== raw.buffer && actual.txid.buffer !== actual.bytes.buffer, 'owned arrays');
    raw.fill(0); compare(actual, v);
    actual.bytes.fill(0); actual.txid.fill(0);
    compare(decode(unhex(v.hex), v.branch), v);
    check(actual.display === v.display, 'stable display');
  }
  const v3 = unhex(vectors[0].hex);
  for (const size of [[253,0,0], [254,255,255,255,255]]) {
    rejects(() => decode(Uint8Array.of(...v3.subarray(0,8), ...size, ...v3.subarray(9)), vectors[0].branch), 'parse:');
  }
  const v6 = unhex(vectors.at(-1).hex);
  new DataView(v6.buffer).setUint32(8, 0xc2d6d0b4, true);
  rejects(() => decode(v6, 0xc2d6d0b4), 'version/context mismatch');
  rejects(() => decode(unhex('0400008085202f89000000000000000000000100000000000000000000'), 0x76b809bb), 'serialization differs');
  rejects(() => decode(unhex('01000000000000000000'), 0), 'unsupported transaction version');
  // Accepted scanner V6: change empty scriptSig to one byte. Identity excludes authorizing data.
  const original = unhex(vectors.at(-1).hex);
  check(original[57] === 0, 'synthetic scriptSig offset');
  const authorized = Uint8Array.of(...original.subarray(0, 57), 1, 0x51, ...original.subarray(58));
  const changed = decode(authorized, vectors.at(-1).branch);
  check(hex(changed.bytes) === hex(authorized), 'authorizing byte serialization');
  check(hex(changed.txid) === vectors.at(-1).txid, 'V6 effect identity');
  return { vectors: vectors.length, baselineAdapterCalls: calls, truncated, reversedControls: 13,
    ownedResults: true, lossyRejected: true, v6AuthorizingIdentity: true, sproutVersionRejected: true };
}
