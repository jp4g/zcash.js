import { failure } from './errors.js';

/** Internal RFC 8259 numeric token. DTOs must explicitly check unit and range. */
export class JsonNumber {
  constructor(readonly text: string) {
    Object.freeze(this);
  }
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
  function skipWhitespace(): void {
    while (position < input.length && /[ \t\r\n]/.test(input[position]!)) position++;
  }

  function parseString(): string {
    // Find the closing quote; JSON.parse validates and decodes the string token.
    const start = position++;
    while (position < input.length) {
      const char = input[position++];
      if (char === '"') {
        try {
          return JSON.parse(input.slice(start, position)) as string;
        } catch {
          throw protocolError();
        }
      }
      if (char === '\\') position++;
    }
    throw protocolError();
  }

  function parseArray(depth: number): Json[] {
    if (depth >= 64) throw protocolError();
    position++;
    skipWhitespace();
    const result: Json[] = [];
    if (input[position] === ']') {
      position++;
      return result;
    }
    for (;;) {
      result.push(parseValue(depth + 1));
      skipWhitespace();
      const next = input[position++];
      if (next === ']') return result;
      if (next !== ',') throw protocolError();
    }
  }

  function parseObject(depth: number): { [key: string]: Json } {
    if (depth >= 64) throw protocolError();
    position++;
    skipWhitespace();
    const result: { [key: string]: Json } = Object.create(null);
    if (input[position] === '}') {
      position++;
      return result;
    }
    for (;;) {
      skipWhitespace();
      if (input[position] !== '"') throw protocolError();
      const key = parseString();
      if (Object.hasOwn(result, key)) throw protocolError();
      skipWhitespace();
      if (input[position++] !== ':') throw protocolError();
      result[key] = parseValue(depth + 1);
      skipWhitespace();
      const next = input[position++];
      if (next === '}') return result;
      if (next !== ',') throw protocolError();
    }
  }

  function parseValue(depth: number): Json {
    skipWhitespace();
    const char = input[position];
    if (char === '"') return parseString();
    if (char === '[') return parseArray(depth);
    if (char === '{') return parseObject(depth);
    for (const [literal, result] of [['null', null], ['true', true], ['false', false]] as const) {
      if (input.startsWith(literal, position)) {
        position += literal.length;
        return result;
      }
    }
    const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    number.lastIndex = position;
    const match = number.exec(input);
    if (!match) throw protocolError();
    position = number.lastIndex;
    return new JsonNumber(match[0]);
  }

  const result = parseValue(0);
  skipWhitespace();
  if (position !== input.length) throw protocolError();
  return result;
}
