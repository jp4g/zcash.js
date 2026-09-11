import { invalidArgument } from './errors.js';

const ZATOSHIS_PER_ZEC = 100_000_000n;

/** Exact decimal conversion, including negative balance deltas. */
export function parseZec(value: string): bigint {
  // Compare the whole match: JavaScript's $ also matches before a final newline.
  if (typeof value !== 'string' || /^-?[0-9]+(?:\.[0-9]{1,8})?$/.exec(value)?.[0] !== value) {
    throw invalidArgument();
  }
  const negative = value.startsWith('-');
  const [whole = '', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const amount = BigInt(whole) * ZATOSHIS_PER_ZEC + BigInt(fraction.padEnd(8, '0'));
  return negative ? -amount : amount;
}

export function formatZec(zatoshis: bigint): string {
  if (typeof zatoshis !== 'bigint') throw invalidArgument();
  const negative = zatoshis < 0n;
  const magnitude = negative ? -zatoshis : zatoshis;
  const whole = magnitude / ZATOSHIS_PER_ZEC;
  const fraction = (magnitude % ZATOSHIS_PER_ZEC).toString().padStart(8, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
