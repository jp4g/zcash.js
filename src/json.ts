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

/** Native JSON parsing with exact numeric tokens and last-key-wins semantics.
 * Requires reviver context.source. The 64-container limit is checked after parsing.
 */
export function parseJson(input: string): Json {
  function checkDepth(value: Json, depth: number): void {
    if (value === null || typeof value !== 'object' || value instanceof JsonNumber) return;
    if (depth >= 64) throw protocolError();
    if (!Array.isArray(value)) Object.setPrototypeOf(value, null);
    for (const child of Object.values(value)) checkDepth(child, depth + 1);
  }

  try {
    const result: Json = JSON.parse(input, (_key: string, value: unknown, context?: { source: string }) => {
      if (typeof value !== 'number') return value;
      if (typeof context?.source !== 'string') throw protocolError();
      return new JsonNumber(context.source);
    });
    checkDepth(result, 0);
    return result;
  } catch {
    throw protocolError();
  }
}
