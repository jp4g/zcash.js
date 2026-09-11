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
  return { ...suite, js_boundary_calls: crossings, reversed_expectation_controls: vectors.length };
}
