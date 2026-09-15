// Async worker adaptation of accepted transaction corpus; golden data unchanged.
// Synthetic expectations from the accepted transaction-codec corpus; no codec algorithms here.
const check = (ok, message) => { if (!ok) throw Error(message); };
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g), n => parseInt(n, 16));
async function rejects(fn, expected) {
  try { await fn(); } catch (e) { check(e.code === 'INVALID_ARGUMENT', `unexpected error code: ${e.code}`); return; }
  throw Error(`expected rejection: ${expected}`);
}
function compare(result, v) {
  check(hex(result.bytes) === v.hex, `${v.name}: serialization mismatch`);
  check(hex(result.txid) === v.txid, `${v.name}: txid mismatch`);
  check(result.display === v.display, `${v.name}: display mismatch`);
}

export async function run(decode, vectors) {
  check(vectors.length === 13, 'qualified corpus size');
  let calls = 0, truncated = 0;
  for (const v of vectors) {
    const raw = unhex(v.hex), actual = await decode(raw, v.branch);
    compare(actual, v); calls++;
    check(hex(actual.txid) !== v.display, 'reversed identity control');
    await rejects(async () => await decode(Uint8Array.of(...raw, 0), v.branch), 'trailing bytes'); calls++;
    await rejects(async () => await decode(raw.subarray(0, -1), v.branch), 'parse:'); calls++;
    await rejects(async () => await decode(raw, 0xffffffff), 'unknown context branch'); calls++;
    await rejects(async () => await decode(raw, 0), v.version >= 5 ? 'branch mismatch' : 'version/context mismatch'); calls++;
    for (const b of [v.branch + 2 ** 32, v.branch - 2 ** 32, v.branch + .5, String(v.branch), new Number(v.branch), NaN, Infinity]) {
      await rejects(async () => await decode(raw, b), 'TypeError: invalid branch'); calls++;
    }
    for (const bytes of [Array.from(raw), Uint16Array.from(raw), Array.from(raw, n => n + 256)]) {
      await rejects(async () => await decode(bytes, v.branch), 'TypeError: invalid transaction bytes'); calls++;
    }
    const padded = Uint8Array.of(0, ...raw, 0);
    compare(await decode(padded.subarray(1, -1), v.branch), v); calls++;
    const cuts = new Set([...Array(Math.min(raw.length, 128)).keys(), Math.floor(raw.length / 2), raw.length - 1]);
    for (const n of cuts) { await rejects(async () => await decode(raw.subarray(0, n), v.branch), n === 0 ? 'invalid transaction bytes' : 'parse:'); truncated++; }
    const malformed = raw.slice(); malformed.fill(0, 4, 8);
    await rejects(async () => await decode(malformed, v.branch), 'parse:');
    if (v.version >= 5) {
      malformed.set(raw); malformed.fill(255, 8, 12);
      await rejects(async () => await decode(malformed, v.branch), 'parse:');
    }
    check(Object.isFrozen(actual), 'result record must be frozen');
    check(actual.bytes.buffer !== raw.buffer && actual.txid.buffer !== actual.bytes.buffer, 'owned arrays');
    raw.fill(0); compare(actual, v);
    actual.bytes.fill(0); actual.txid.fill(0);
    compare(await decode(unhex(v.hex), v.branch), v);
    check(actual.display === v.display, 'stable display');
  }
  const v3 = unhex(vectors[0].hex);
  for (const size of [[253,0,0], [254,255,255,255,255]]) {
    await rejects(async () => await decode(Uint8Array.of(...v3.subarray(0,8), ...size, ...v3.subarray(9)), vectors[0].branch), 'parse:');
  }
  const v6 = unhex(vectors.at(-1).hex);
  new DataView(v6.buffer).setUint32(8, 0xc2d6d0b4, true);
  await rejects(async () => await decode(v6, 0xc2d6d0b4), 'version/context mismatch');
  await rejects(async () => await decode(unhex('0400008085202f89000000000000000000000100000000000000000000'), 0x76b809bb), 'serialization differs');
  await rejects(async () => await decode(unhex('01000000000000000000'), 0), 'unsupported transaction version');
  // Accepted scanner V6: change empty scriptSig to one byte. Identity excludes authorizing data.
  const original = unhex(vectors.at(-1).hex);
  check(original[57] === 0, 'synthetic scriptSig offset');
  const authorized = Uint8Array.of(...original.subarray(0, 57), 1, 0x51, ...original.subarray(58));
  const changed = await decode(authorized, vectors.at(-1).branch);
  check(hex(changed.bytes) === hex(authorized), 'authorizing byte serialization');
  check(hex(changed.txid) === vectors.at(-1).txid, 'V6 effect identity');
  return { vectors: vectors.length, baselineAdapterCalls: calls, truncated, reversedControls: 13,
    ownedResults: true, lossyRejected: true, v6AuthorizingIdentity: true, sproutVersionRejected: true };
}
