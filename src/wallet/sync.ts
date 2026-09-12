import type { ChainPoint, LightClient } from '../../docs/api/public-api.js';
import { failure, isZcashError } from '../errors.js';
import type { attachWalletWorker } from './host.js';
import { applyEnhancement } from './enhancement.js';

type Session = ReturnType<typeof attachWalletWorker>;
const reverse = (hash: string) => hash.match(/../g)!.reverse().join('');
const mismatch = () => failure('PROTOCOL_MISMATCH', 'sync', 'sync', 'Sync source changed or returned inconsistent blocks.');
const recovery = () => failure('RECOVERY_REQUIRED', 'sync', 'sync', 'No retained common checkpoint is available.');

/** Internal finite run used by the wallet owner; all scan decisions and writes remain native. */
export async function syncWallet(session: Session, light: LightClient, target: ChainPoint, signal?: AbortSignal) {
  const op = signal === undefined ? {} : { signal };
  const pin = async () => {
    try {
      const tree = await light.getTreeState({ height: target.height, ...op });
      if (tree.point.hash !== target.hash) throw mismatch();
    } catch (error) {
      if (isZcashError(error) && error.code === 'METHOD_NOT_SUPPORTED')
        throw failure('TARGET_PINNING_UNSUPPORTED', 'sync', 'configure', 'Source cannot pin the sync target.');
      throw error;
    }
  };
  await pin();
  const state = await session.scan.state(op);
  let height = Math.min(state.maxScannedHeight ?? 0, target.height);
  let fork = false;
  for (; height > 0; height--) {
    const local = await session.scan.block({ height, ...op });
    if (local.point === null) { if (fork) throw recovery(); break; }
    const remote = await light.getTreeState({ height, ...op });
    if (remote.point.hash === reverse(local.point.hash)) {
      if (fork) await session.scan.rewind({ revision: local.revision, requestedPoint: local.point, ...op });
      break;
    }
    fork = true;
  }
  if (fork && height === 0) throw recovery();
  const nativeTarget = { height: target.height, hash: reverse(target.hash) };
  for (;;) {
    const plan = await session.scan.plan({ target: nativeTarget, ...op });
    const range = plan.ranges.find(range => range.start <= target.height);
    if (!range) break;
    const end = Math.min(range.endExclusive - 1, target.height, range.start + 15);
    const prior = await light.getTreeState({ height: range.start - 1, ...op });
    if (range.priorState.hash !== null && prior.point.hash !== reverse(range.priorState.hash)) throw mismatch();
    const blocks: Uint8Array[] = [];
    let bytes = 0;
    for await (const block of light.streamCompactBlocks({ fromHeight: range.start, toHeight: end, ...op })) {
      if (block.point.height !== range.start + blocks.length) throw mismatch();
      if (block.encoded.length > 2 * 1024 * 1024)
        throw failure('RESOURCE_LIMIT', 'sync', 'configure', 'Compact block exceeds native scan batch limit.');
      if (bytes + block.encoded.length > 2 * 1024 * 1024) break;
      blocks.push(block.encoded); bytes += block.encoded.length;
    }
    if (!blocks.length) throw mismatch();
    await session.scan.ingest({ revision: plan.revision, target: nativeTarget, priorTreeState: prior.encoded, blocks, ...op });
  }
  // Upstream polling requests may remain after a successful status update. Visit each once per run.
  const visited = new Set<string>();
  for (;;) {
    const pending = await session.enhancement.requests(op);
    const request = pending.requests.find(value => !visited.has(JSON.stringify(value))
      && !(value.kind === 'address' && value.requestAt !== null && value.requestAt > Date.now()));
    if (!request) break;
    visited.add(JSON.stringify(request));
    await applyEnhancement(session, light, pending.revision, request, signal);
  }
  await pin();
  return session.scan.state(op);
}
