import assert from 'node:assert/strict';
import test from 'node:test';

// Internal protocol parser, deliberately not a public JSON/bigint codec.
const json = await import('../../dist/src/json.js').catch(() => ({}));

test('JSON response numbers retain exact decimal tokens before DTO conversion', () => {
  const result = json.parseJson('{"n":9007199254740993,"amount":0.123456789012345678,"exp":1e400,"text":"9007199254740993"}');
  assert.equal(result.n.text, '9007199254740993');
  assert.equal(result.amount.text, '0.123456789012345678');
  assert.equal(result.exp.text, '1e400');
  assert.equal(result.text, '9007199254740993');
  assert.equal(json.parseJson('42').text, '42');
});

test('JSON grammar handles whitespace, escaping, objects, arrays and literals', () => {
  const result = json.parseJson(' \r\n\t {"a":[true,false,null,"a\\\"b\\\\c\\n\\u263a"],"__proto__":{"safe":true}} ');
  assert.deepEqual(result.a, [true, false, null, 'a"b\\c\n☺']);
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(result.__proto__.safe, true);
  for (const input of ['0', '-0', '1.2', '1e+2', '-10.25E-2']) assert.equal(json.parseJson(input).text, input);
});

test('malformed/ambiguous JSON and excessive nesting reject with sanitized protocol errors', () => {
  for (const input of ['', '01', '+1', '.1', '1.', 'NaN', 'Infinity', 'true false',
    '[1,]', '{"x":1,}', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}',
    '"unterminated', '"\\x00"', '"\n"', '{x:1}', '\ufeff{}', '[',
    '['.repeat(66) + '0' + ']'.repeat(66)]) {
    assert.throws(() => json.parseJson(input), { code: 'PROTOCOL_MISMATCH' }, input);
  }
});
