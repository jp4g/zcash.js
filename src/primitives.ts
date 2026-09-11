import type { AccountIndex, BlockHash, DiversifierIndex, TxId } from '../docs/api/public-api.js';
import { invalidArgument } from './errors.js';

export function accountIndex(value: number): AccountIndex {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fff_ffff) throw invalidArgument();
  return value as AccountIndex;
}

export function diversifierIndex(value: bigint): DiversifierIndex {
  if (typeof value !== 'bigint' || value < 0n || value >= (1n << 88n)) throw invalidArgument();
  return value as DiversifierIndex;
}

function displayHash(value: string): void {
  if (typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]+$/.test(value)) {
    throw invalidArgument();
  }
}

export function txId(value: string): TxId {
  displayHash(value);
  return value as TxId;
}

export function blockHash(value: string): BlockHash {
  displayHash(value);
  return value as BlockHash;
}
