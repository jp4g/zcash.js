export const upgrades = ['Overwinter', 'Sapling', 'Blossom', 'Heartwood', 'Canopy', 'Nu5', 'Nu6', 'Nu6_1', 'Nu6_2', 'Nu6_3'];
export const format = 'zcash-js-network/1';
export const encode = text => new TextEncoder().encode(text);
export const document = (encoding, heights) => JSON.stringify({ encoding, ...Object.fromEntries(upgrades.map((key, i) => [key, heights[i]])) });
export const valid = [
  ...['main', 'test', 'regtest'].map(encoding => ({ name: `${encoding}-steps`, text: document(encoding, upgrades.map((_, i) => (i + 1) * 10)) })),
  { name: 'zero-equal', text: document('regtest', upgrades.map(() => 0)) },
  { name: 'max-equal', text: document('test', upgrades.map(() => 4294967295)) },
  ...upgrades.map((_, i) => ({ name: `scheduled-prefix-${i}`, text: document('main', upgrades.map((_, j) => j < i ? j : null)) })),
];
const base = valid[0].text;
export const invalid = [
  ['unknown', base.replace('}', ',"Nu7":100}')],
  ['duplicate', base.replace('}', ',"Overwinter":10}')],
  ['missing', base.replace(',"Nu6_3":100', '')],
  ['order', base.replace('"Overwinter":10,"Sapling":20', '"Sapling":20,"Overwinter":10')],
  ['space', base.replace(':', ': ')], ['newline', base + '\n'], ['trailing', base + '{}'],
  ['bom', '\ufeff' + base], ['escape', base.replace('main', '\\u006dain')],
  ['encoding', base.replace('main', 'custom')], ['case', base.replace('main', 'Main')],
  ['nested', '[' + base + ']'], ['null-document', 'null'],
  ...['-1', '-0', '1.0', '1e1', '01', '+1', '4294967296', '9007199254740993', 'true', '"10"', '{}', '[]'].map(value => [value, base.replace('"Overwinter":10', `"Overwinter":${value}`)]),
  ['descending', base.replace('"Sapling":20', '"Sapling":9')],
  ['gap', base.replace('"Overwinter":10', '"Overwinter":null')],
  ['non-ascii', base.replace('main', 'maín')],
].map(([name, text]) => ({ name, bytes: encode(text) }));
invalid.push({ name: 'invalid-utf8', bytes: Uint8Array.of(0xff) });
