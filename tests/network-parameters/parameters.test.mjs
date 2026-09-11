import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNetworkParameters, bindNetworkDefinition } from '../../dist/src/network-parameters.js';
import { format, valid, invalid, encode, upgrades } from './vectors.mjs';
import { isZcashError } from '../../dist/src/errors.js';
const rejects = fn => assert.throws(fn, e => isZcashError(e) && e.code === 'INVALID_ARGUMENT');
for (const { name, text } of valid) test(`canonical ${name}`, () => {
  const parsed = parseNetworkParameters(encode(text), format);
  assert.equal(parsed.encoding, JSON.parse(text).encoding);
  assert.deepEqual(parsed.heights, upgrades.map(key => JSON.parse(text)[key]));
  assert.deepEqual(parsed.bytes, encode(text));
  assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.heights));
});
for (const { name, bytes } of invalid) test(`reject ${name}`, () => rejects(() => parseNetworkParameters(bytes, format)));
test('reject unsupported formats and non-byte input', () => {
  for (const bad of ['', 'zcash-js-network/2', undefined]) rejects(() => parseNetworkParameters(encode(valid[0].text), bad));
  for (const bad of [null, [], valid[0].text]) rejects(() => parseNetworkParameters(bad, format));
});
test('owned bytes include Buffer input and cannot mutate the binding', () => {
  for (const parameters of [encode(valid[0].text), Buffer.from(valid[0].text)]) {
    const definition = { identity: 'synthetic', genesisHash: '01'.repeat(32), parametersFormat: format, parameters };
    const bound = bindNetworkDefinition(definition);
    const key = bound.binding;
    parameters.fill(0); bound.parameters.bytes.fill(0); definition.identity = 'changed';
    assert.equal(bound.binding, key); assert.equal(bound.identity, 'synthetic');
    assert.equal(new TextDecoder().decode(bound.parameters.bytes), valid[0].text);
    assert.ok(Object.isFrozen(bound));
  }
});
test('binding covers every definition field without delimiter collisions', () => {
  const base = { identity: 'a', genesisHash: '01'.repeat(32), parametersFormat: format, parameters: encode(valid[0].text) };
  const key = bindNetworkDefinition(base).binding;
  assert.equal(bindNetworkDefinition({ ...base }).binding, key);
  for (const change of [{ identity: 'a\u0000b' }, { genesisHash: '02'.repeat(32) }, { parameters: encode(valid[1].text) }]) {
    assert.notEqual(bindNetworkDefinition({ ...base, ...change }).binding, key);
  }
  rejects(() => bindNetworkDefinition({ ...base, parametersFormat: format + 'x' }));
  for (const change of [{ identity: '' }, { identity: 1 }, { genesisHash: 'AA'.repeat(32) }, { extra: true }]) rejects(() => bindNetworkDefinition({ ...base, ...change }));
});
