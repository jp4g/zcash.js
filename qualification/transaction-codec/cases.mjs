// The same JS boundary checks run in Node and Firefox around genuine generated bindings.
function check(condition, message) {
  if (!condition) throw Error(message);
}
function rejects(action, expected) {
  try { action(); } catch (error) {
    check(String(error).includes(expected), `unexpected rejection: ${error}`);
    return;
  }
  throw Error(`accepted input expected to fail: ${expected}`);
}
function compare(actual, vector) {
  for (const key of ['hex', 'txid', 'display', 'version', 'branch']) {
    check(actual[key] === vector[key], `${vector.name}: ${key} mismatch`);
  }
}
export function runCases(bindings, vectors) {
  const suite = JSON.parse(bindings.qualify());
  check(suite.ok && suite.vectors.length === 13 && vectors.length === 13, 'suite count');
  check(suite.compact_size_negatives === 2 && suite.v6_known_incompatible_branch, 'negative coverage');
  const fieldControls = runFieldCases(bindings, vectors);
  check(suite.lossy_serialization_negatives === 1, 'lossy serialization coverage');
  let crossings = 0;
  for (const [index, vector] of vectors.entries()) {
    const raw = Uint8Array.from(vector.hex.match(/../g), b => Number.parseInt(b, 16));
    const actual = JSON.parse(bindings.decode(raw, vector.branch));
    compare(actual, vector);
    check(suite.vectors[index].name === vector.name && suite.vectors[index].txid === vector.txid,
      'Rust suite vector identity');
    // A swapped display-order expectation must fail at the actual JS/WASM boundary.
    rejects(() => compare(actual, { ...vector, txid: vector.display }), 'txid mismatch');
    rejects(() => bindings.decode(Uint8Array.of(...raw, 0), vector.branch), 'trailing bytes');
    rejects(() => bindings.decode(raw.subarray(0, raw.length - 1), vector.branch), 'parse:');
    rejects(() => bindings.decode(raw, 0xffffffff), 'unknown context branch');
    rejects(() => bindings.decode(raw, 0), vector.version >= 5 ? 'branch mismatch' : 'version/context mismatch');
    crossings += 5;
  }
  return { ...suite, js_boundary_calls: crossings + fieldControls.calls, js_field_controls: fieldControls, reversed_expectation_controls: vectors.length };
}

// Keep these controls callable against the old real glue for the RED regression.
export function runFieldCases(bindings, vectors) {
  let calls = 0;
  for (const vector of vectors) {
    const raw = Uint8Array.from(vector.hex.match(/../g), b => Number.parseInt(b, 16));
    for (const branch of [vector.branch + 2 ** 32, vector.branch - 2 ** 32,
      vector.branch + 0.5, String(vector.branch), new Number(vector.branch), NaN, Infinity]) {
      rejects(() => bindings.decode(raw, branch), 'branch must be a u32 integer');
      calls++;
    }
    for (const bytes of [Array.from(raw), Uint16Array.from(raw), Array.from(raw, b => b + 256)]) {
      rejects(() => bindings.decode(bytes, vector.branch), 'raw must be Uint8Array');
      calls++;
    }
    // A genuine byte view with a nonzero offset is still accepted exactly.
    const padded = Uint8Array.of(0, ...raw, 0);
    compare(JSON.parse(bindings.decode(padded.subarray(1, -1), vector.branch)), vector);
    calls++;
  }
  return { calls, branch_negatives: vectors.length * 7, byte_type_negatives: vectors.length * 3,
    byte_view_controls: vectors.length };
}
