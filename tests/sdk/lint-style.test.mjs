import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const check = async source => (await eslint.lintText(source, { filePath: 'src/style-fixture.ts' }))[0].messages;

test('source formatting keeps short guards and rejects cramped statements', async () => {
  assert.deepEqual(await check(`export function read(next: string, result: unknown) {
  if (next === ']') return result;
  return { next, result };
}
`), []);
  const errors = await check(`export function read(next:string,result:unknown){
  const value={next:next,result:result};console.log(value);return value;
}
`);
  const rules = new Set(errors.map(error => error.ruleId));
  for (const rule of ['object-curly-spacing', 'key-spacing', 'comma-spacing', 'max-statements-per-line'])
    assert.ok(rules.has('@stylistic/' + rule), rule);
  const long = await check(`export const ${'longName'.repeat(20)} = 1;\n`);
  assert.ok(long.some(error => error.ruleId === '@stylistic/max-len'));
});
