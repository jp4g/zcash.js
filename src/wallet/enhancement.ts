import type { LightClient, PublicTransaction, TxId } from '../../docs/api/public-api.js';
import { failure } from '../errors.js';
import type { attachWalletWorker } from './host.js';
import type { EnhancementRequest, EnhancementResult } from './session.js';

type Session = ReturnType<typeof attachWalletWorker>;
const unsupported = () => failure('METHOD_NOT_SUPPORTED', 'sync', 'configure', 'Enhancement request needs unsupported source evidence.');
const protocol = () => failure('PROTOCOL_MISMATCH', 'sync', 'sync', 'Enhancement response does not match the requested range.');
const limit = () => failure('RESOURCE_LIMIT', 'sync', 'configure', 'Enhancement transaction exceeds batch limit.');

/** One backend request. Only successful stream exhaustion completes address coverage. */
export async function applyEnhancement(session: Session, light: LightClient, revision: string,
  request: EnhancementRequest, signal?: AbortSignal): Promise<void> {
  const op = signal === undefined ? {} : { signal };
  const apply = async (result: EnhancementResult) => {
    revision = (await session.enhancement.apply({ revision, request, result, ...op })).revision;
  };
  if (request.kind !== 'address') {
    const transaction = await light.getTransaction({ txid: request.txid as TxId, ...op });
    if (transaction === null) { await apply({ status: 'notRecognized' }); return; }
    if (transaction.txid !== request.txid) throw protocol();
    const mined = transaction.observation.state === 'mined' ? transaction.observation.inclusion?.height : null;
    if (transaction.observation.state === 'mined' && mined === undefined) throw protocol();
    if (request.kind === 'enhancement') {
      if (transaction.raw.length > 2 * 1024 * 1024) throw limit();
      await apply({ transactions: [{ bytes: transaction.raw, minedHeight: mined ?? null }] });
    } else if (mined !== null && mined !== undefined) await apply({ status: 'mined', height: mined });
    else if (['mempool', 'offMainChain'].includes(transaction.observation.state)) await apply({ status: 'notInMainChain' });
    else throw protocol();
    return;
  }
  if (request.txStatus !== 'mined' || request.outputStatus !== 'all' || request.endExclusive === null) throw unsupported();
  const asOfHeight = request.endExclusive - 1;
  let batch: { bytes: Uint8Array; minedHeight: number }[] = [], bytes = 0;
  const flush = async (complete: boolean) => {
    await apply({ transactions: batch, asOfHeight, complete });
    batch = []; bytes = 0;
  };
  for await (const transaction of light.streamAddressTransactions({ address: request.address,
    fromHeight: request.start, toHeight: asOfHeight, ...op })) {
    const height = minedHeight(transaction);
    if (height < request.start || height >= request.endExclusive) throw protocol();
    if (transaction.raw.length > 2 * 1024 * 1024) throw limit();
    if (batch.length === 16 || bytes + transaction.raw.length > 2 * 1024 * 1024) await flush(false);
    batch.push({ bytes: transaction.raw, minedHeight: height }); bytes += transaction.raw.length;
  }
  await flush(true);
}

function minedHeight(transaction: PublicTransaction): number {
  const height = transaction.observation.inclusion?.height;
  if (transaction.observation.state !== 'mined' || height === undefined || !Number.isInteger(height) || height < 0) throw protocol();
  return height;
}
