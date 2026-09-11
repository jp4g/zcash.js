import { failure } from './errors.js';

/** Internal RFC 8259 numeric token. DTOs must explicitly check unit and range. */
export class JsonNumber {
  constructor(readonly text: string) { Object.freeze(this); }
}
export type Json = null | boolean | string | JsonNumber | Json[] | { [key: string]: Json };

export function protocolError() {
  return failure('PROTOCOL_MISMATCH', 'transport', 'configure', 'Invalid JSON-RPC response.');
}

/** Bounded by the transport byte limit and a fixed 64-container nesting limit.
 * Numbers never pass through IEEE-754. Duplicate object keys reject.
 */
export function parseJson(input: string): Json {
  let position = 0;
  function whitespace(): void {
    while (position < input.length && /[ \t\r\n]/.test(input[position]!)) position++;
  }
  function string(): string {
    const start = position++;
    while (position < input.length) {
      const char = input[position++];
      if (char === '"') {
        try { return JSON.parse(input.slice(start, position)) as string; }
        catch { throw protocolError(); }
      }
      if (char === '\\') position++;
    }
    throw protocolError();
  }
  function value(depth: number): Json {
    whitespace();
    const char = input[position];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      if (depth >= 64) throw protocolError();
      position++;
      whitespace();
      if (char === '[') {
        const result: Json[] = [];
        if (input[position] === ']') { position++; return result; }
        for (;;) {
          result.push(value(depth + 1));
          whitespace();
          const next = input[position++];
          if (next === ']') return result;
          if (next !== ',') throw protocolError();
        }
      }
      const result: { [key: string]: Json } = Object.create(null);
      if (input[position] === '}') { position++; return result; }
      for (;;) {
        whitespace();
        if (input[position] !== '"') throw protocolError();
        const key = string();
        if (Object.hasOwn(result, key)) throw protocolError();
        whitespace();
        if (input[position++] !== ':') throw protocolError();
        result[key] = value(depth + 1);
        whitespace();
        const next = input[position++];
        if (next === '}') return result;
        if (next !== ',') throw protocolError();
      }
    }
    for (const [literal, result] of [['null', null], ['true', true], ['false', false]] as const) {
      if (input.startsWith(literal, position)) { position += literal.length; return result; }
    }
    const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    number.lastIndex = position;
    const match = number.exec(input);
    if (!match) throw protocolError();
    position = number.lastIndex;
    return new JsonNumber(match[0]);
  }
  const result = value(0);
  whitespace();
  if (position !== input.length) throw protocolError();
  return result;
}
