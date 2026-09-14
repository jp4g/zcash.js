import { bridgeSignal, signalAborted } from '../abort.js';
import { copyRecord } from './owned-plumbing.js';
import type { HttpTransport, Op, PublicTransaction, TxId, Inclusion, TransactionObservation } from '../../docs/api/public-api.js';
import { readRpc, rpcErrorCode } from '../http.js';
import { failure, invalidArgument } from '../errors.js';
import { JsonNumber, protocolError } from '../json.js';
import { txId, blockHash } from '../primitives.js';
import { getBlock } from './public-block-reads.js';


function checkAbort(signal?: AbortSignal): void {
  if (signal && signalAborted.call(signal)) throw failure('ABORTED', 'transport', 'none', 'Request aborted.');
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (!(value instanceof JsonNumber) || !/^(?:0|-?[1-9][0-9]*)$/.test(value.text)) throw protocolError();
  const number = Number(value.text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw protocolError();
  return number;
}

/** Internal transaction read. Owner establishes source/network and historical context.
 * Only a qualified initial transaction lookup can return absence.
 */
export async function getTransaction(
  source: { readonly transport: HttpTransport; readonly sourceId: string },
  context: { readonly txid: TxId; readonly decodeTransaction: (raw: Uint8Array, height: number | null) => {
    readonly bytes: Uint8Array; readonly txid: Uint8Array; readonly display: string;
  } },
  args: { readonly txid: TxId } & Op,
): Promise<PublicTransaction | null> {
  source = copyRecord(source, ['transport', 'sourceId']);
  context = copyRecord(context, ['txid', 'decodeTransaction']);
  args = copyRecord(args, ['txid', 'signal']);
  const { transport, sourceId } = source;
  const { decodeTransaction } = context;
  const requested = txId(args.txid);
  if (typeof sourceId !== 'string' || !sourceId.trim() || context.txid !== requested
    || typeof decodeTransaction !== 'function') throw invalidArgument();
  const owned = await bridgeSignal(args.signal);
  const { signal } = owned;
  try {
    checkAbort(signal);
    let value;
    try { value = await readRpc(transport, 'getrawtransaction', [requested, 1], signal); }
    catch (error) { if (rpcErrorCode(error) === -5) return null; throw error; }
    checkAbort(signal);
    if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof JsonNumber) throw protocolError();
    let dtoId, hash;
    try {
      dtoId = txId(value.txid as string);
      if (Object.hasOwn(value, 'blockhash')) hash = blockHash(value.blockhash as string);
    } catch { throw protocolError(); }
    const height = Object.hasOwn(value, 'height') ? integer(value.height, -1, 0x7fff_ffff) : undefined;
    const confirmations = Object.hasOwn(value, 'confirmations') ? integer(value.confirmations, 0, Number.MAX_SAFE_INTEGER) : undefined;
    if (typeof value.in_active_chain !== 'boolean' || dtoId !== requested
      || typeof value.hex !== 'string' || !value.hex.length || value.hex.length > 4194304
      || value.hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value.hex)) throw protocolError();
    const raw = Uint8Array.from(value.hex.match(/../g)!, byte => parseInt(byte, 16));
    try {
      checkAbort(signal);
      const decoded = decodeTransaction(raw.slice(), value.in_active_chain && height !== undefined && height >= 0 ? height : null);
      checkAbort(signal);
      if (!(decoded.bytes instanceof Uint8Array) || !(decoded.txid instanceof Uint8Array)
        || decoded.bytes.length !== raw.length || decoded.bytes.some((byte, i) => byte !== raw[i])
        || decoded.txid.length !== 32 || decoded.display !== requested
        || Array.from(decoded.txid).reverse().map(byte => byte.toString(16).padStart(2, '0')).join('') !== requested) throw protocolError();
    } catch { checkAbort(signal); throw protocolError(); }
    let state: TransactionObservation['state'];
    let inclusion: Inclusion | null = null;
    if (!value.in_active_chain && hash === undefined && height === undefined && confirmations === undefined) state = 'mempool';
    else if (!value.in_active_chain && hash !== undefined && height === -1 && confirmations === 0) state = 'offMainChain';
    else if (value.in_active_chain && height !== undefined && height >= 0 && confirmations !== undefined && confirmations > 0) {
      state = 'unknown';
      if (hash !== undefined) {
        const block = await getBlock({ transport, sourceId }, { height, ...(signal === undefined ? {} : { signal }) });
        checkAbort(signal);
        if (block === null) throw protocolError();
        if (block.point.hash === hash) {
          if (block.point.height !== height || !block.txids.includes(requested)) throw protocolError();
          state = 'mined'; inclusion = Object.freeze({ height, blockHash: hash, confirmations: null });
        }
      }
    } else throw protocolError();
    checkAbort(signal);
    const observedAt = new Date().toISOString();
    return Object.freeze({ txid: requested, raw: raw.slice(), sourceId, observedAt,
      observation: Object.freeze({ txid: requested, state, inclusion, tip: null, priorInclusion: null, sourceId, observedAt }) });
  } catch (error) { checkAbort(signal); throw error; }
  finally { try { owned.close(); } catch { /* Cleanup must not replace the outcome. */ } }
}
