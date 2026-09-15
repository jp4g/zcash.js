import { bridgeSignal, signalAborted, unsupportedSignalProxy } from '../abort.js';
import { copyRecord } from './owned-plumbing.js';
import type { BlockSelector, HttpTransport, Op, PublicBlock } from '../types.js';
import { readRpc, rpcErrorCode } from '../http.js';
import { failure, invalidArgument } from '../errors.js';
import { JsonNumber, protocolError } from '../json.js';
import { blockHash, txId } from '../primitives.js';
import { getBlockHeader } from './public-chain-reads.js';

function checkSignal(signal?: AbortSignal): void {
  if (signal === undefined) return;
  let aborted: boolean;
  try {
    if (unsupportedSignalProxy(signal)) throw invalidArgument();
    aborted = Reflect.apply(signalAborted, signal, []);
    if (typeof aborted !== 'boolean') throw invalidArgument();
  } catch {
    throw invalidArgument();
  }
  // Actual cancellation wins even over a hostile public getter.
  if (aborted) throw failure('ABORTED', 'transport', 'none', 'Request aborted.');
  try {
    const shadow = Object.getOwnPropertyDescriptor(signal, 'aborted');
    if (shadow && (!Object.hasOwn(shadow, 'value') || typeof shadow.value !== 'boolean')) throw invalidArgument();
  } catch {
    throw invalidArgument();
  }
}

function integer(value: unknown, maximum: number): number {
  if (!(value instanceof JsonNumber) || !/^(?:0|[1-9][0-9]{0,9})$/.test(value.text)) throw protocolError();
  const number = Number(value.text);
  if (!Number.isSafeInteger(number) || number > maximum) throw protocolError();
  return number;
}

/** Internal composition; the owning client must bind the source and validate its network.
 * Checks source/header coherence, not consensus, transaction inclusion or current-chain membership.
 */
export async function getBlock(
  source: { readonly transport: HttpTransport; readonly sourceId: string },
  args: BlockSelector & Op,
): Promise<PublicBlock | null> {
  source = copyRecord(source, ['transport', 'sourceId']);
  args = copyRecord(args, ['height', 'hash', 'signal']);
  const { transport, sourceId } = source;
  const { height, hash: requestedHash, signal: caller } = args;
  if (typeof sourceId !== 'string' || sourceId.trim().length === 0
    || Object.hasOwn(args, 'height') === Object.hasOwn(args, 'hash')) throw invalidArgument();
  let selector: string;
  if (Object.hasOwn(args, 'height')) {
    if (typeof height !== 'number' || !Number.isInteger(height) || height < 0
      || height > 0xffff_ffff) throw invalidArgument();
    selector = String(height);
  } else selector = blockHash(requestedHash!);

  checkSignal(caller);
  const binding = await bridgeSignal(caller);
  const { signal } = binding;
  try {
    checkSignal(caller);
    // readRpc owns the configured byte/deadline bounds and lossless JSON decoding.
    let value;
    try {
      value = await readRpc(transport, 'getblock', [selector, 1], signal);
    } catch (error) {
      if (rpcErrorCode(error) === (requestedHash === undefined ? -8 : -5)) return null;
      throw error;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || value instanceof JsonNumber) throw protocolError();
    const resolvedHeight = integer(value.height, 0xffff_ffff);
    const time = integer(value.time, 0xffff_ffff);
    // Pinned node TrustedPreallocate: MAX_BLOCK_BYTES / MIN_TRANSPARENT_TX_SIZE = 2_000_000 / 54.
    const count = integer(value.nTx, 37_037);
    if (count === 0 || !Array.isArray(value.tx) || value.tx.length !== count) throw protocolError();
    let hash,
      previousHash,
      txids;
    try {
      hash = blockHash(value.hash as string);
      previousHash = blockHash(value.previousblockhash as string);
      txids = value.tx.map(value => txId(value as string));
    } catch {
      throw protocolError();
    }
    if (new Set(txids).size !== count
      || (height !== undefined && resolvedHeight !== height)
      || (requestedHash !== undefined && hash !== requestedHash)) throw protocolError();

    // Snapshot all caller input before callbacks; never look the height up again.
    const header = await getBlockHeader({ transport, sourceId }, { hash, ...(signal === undefined ? {} : { signal }) });
    checkSignal(caller);
    if (header === null || header.point.height !== resolvedHeight || header.point.hash !== hash
      || header.previousHash !== previousHash || header.time !== time) throw protocolError();
    return Object.freeze({
      ...header,
      point: Object.freeze({ ...header.point }),
      raw: header.raw.slice(),
      txids: Object.freeze(txids),
    });
  } catch (error) {
    if (caller !== undefined && Reflect.apply(signalAborted, caller, [])) {
      checkSignal(caller);
    }
    throw error;
  } finally {
    try {
      binding.close();
    } catch { /* Caller mutation must not replace the operation's result or error. */ }
  }
}
