// Same synthetic assertions in native comparison, Node WASM, and actual Firefox.
import { valid, invalid, encode, upgrades, format } from './vectors.mjs';
export function cases() {
  return valid.flatMap(({ name, text }) => {
    const heights = upgrades.map(key => JSON.parse(text)[key]);
    const boundaries = new Set([0, 4294967295]);
    for (const h of heights) if (h !== null) for (const n of [h - 1, h, h + 1]) if (n >= 0 && n <= 4294967295) boundaries.add(n);
    return [...boundaries].map(height => ({ name, bytes: encode(text), height }));
  }).concat(invalid.map(({ name, bytes }) => ({ name, bytes, height: 0, invalid: true })));
}
export function compare(parse, observations, facts) {
  const all = cases();
  const equal = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`mismatch ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };
  equal(observations.length, all.length, 'case count');
  all.forEach((c, i) => {
    if (c.invalid) {
      let rejected = false;
      try { parse(c.bytes, format); } catch { rejected = true; }
      equal(rejected, true, `JS reject ${c.name}`);
      equal(observations[i], null, `host reject ${c.name}`);
      return;
    }
    const p = parse(c.bytes, format);
    const active = p.heights.map(h => h !== null && h <= c.height);
    const latest = active.lastIndexOf(true);
    equal(observations[i], { encoding: p.encoding, heights: p.heights,
      branch: facts.branches[latest + 1], active, constants: facts[p.encoding] }, `${c.name}@${c.height}`);
  });
  return { cases: all.length, accepted: all.filter(c => !c.invalid).length, rejected: invalid.length };
}
