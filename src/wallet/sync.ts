import type { ChainPoint, ErrorInfo, LightClient, Op, SyncStatus } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { blockHash } from '../primitives.js';
import type { attachWalletWorker } from './host.js';
import { applyEnhancement } from './enhancement.js';

type Session = ReturnType<typeof attachWalletWorker>;
const reverse = (hash: string) => hash.match(/../g)!.reverse().join('');
const mismatch = () => failure('PROTOCOL_MISMATCH', 'sync', 'sync', 'Sync source changed or returned inconsistent blocks.');
const recovery = () => failure('RECOVERY_REQUIRED', 'sync', 'sync', 'No retained common checkpoint is available.');

/** Wallet-owned finite sync lifecycle. The enclosing wallet owns and closes the worker. */
export class WalletSync {
  private activity: SyncStatus['activity'] = 'idle';
  private target: ChainPoint | null = null;
  private reached = false;
  private lastError: ErrorInfo | null = null;
  private controller: AbortController | undefined;
  private running: Promise<SyncStatus> | undefined;
  constructor(private readonly session: Session, private readonly light: LightClient) {}

  async getSyncStatus(args: Op = {}): Promise<SyncStatus> {
    // Both reads are local. Equal revisions bind their projections to one database state.
    for (let attempt = 0; attempt < 3; attempt++) {
      const scan = await this.session.scan.state(args);
      const pending = await this.session.enhancement.requests(args);
      if (scan.revision !== pending.revision) continue;
      const delayed = pending.requests.filter(r => r.kind === 'address' && r.requestAt !== null && r.requestAt > Date.now()).length;
      return { activity: this.activity, scan, target: this.target, targetReached: this.reached,
        enhancement: { actionable: pending.requests.length - delayed, delayed }, workEstimate: null, lastError: this.lastError };
    }
    throw failure('STORAGE_BUSY', 'sync', 'none', 'Wallet changed during the status read.');
  }

  sync(args: { target?: ChainPoint } & Op = {}): Promise<SyncStatus> {
    if (this.running) return Promise.reject(failure('STORAGE_BUSY', 'sync', 'none', 'Wallet sync is already running.'));
    let target: ChainPoint | undefined, signal: AbortSignal | undefined;
    try {
      if (!args || ![Object.prototype, null].includes(Object.getPrototypeOf(args))) throw invalidArgument();
      const input: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(args)) {
        if (key !== 'target' && key !== 'signal') throw invalidArgument();
        const field = Object.getOwnPropertyDescriptor(args, key)!;
        if (!Object.hasOwn(field, 'value')) throw invalidArgument();
        input[key] = field.value;
      }
      signal = input.signal as AbortSignal | undefined;
      if (input.target !== undefined) {
        const value = input.target as ChainPoint;
        const height = Object.getOwnPropertyDescriptor(value, 'height'), hash = Object.getOwnPropertyDescriptor(value, 'hash');
        if (!height || !hash || !Object.hasOwn(height, 'value') || !Object.hasOwn(hash, 'value')
          || Reflect.ownKeys(value).length !== 2 || !Number.isInteger(height.value) || height.value < 0 || height.value >= 0xffffffff) throw invalidArgument();
        target = Object.freeze({ height: height.value, hash: blockHash(hash.value) });
      }
    } catch { return Promise.reject(invalidArgument()); }
    this.controller = new AbortController();
    this.running = this.run(target, signal).finally(() => { this.running = undefined; this.controller = undefined; });
    return this.running;
  }

  private async run(target: ChainPoint | undefined, signal: AbortSignal | undefined): Promise<SyncStatus> {
    this.activity = 'running'; this.reached = false; this.lastError = null; this.target = target ?? null;
    try {
      // Host admission validates the caller's native signal before composing dependencies.
      await this.session.scan.state(signal === undefined ? {} : { signal });
      const dependent = signal === undefined ? this.controller!.signal : AbortSignal.any([signal, this.controller!.signal]);
      const point = target ?? await this.light.getTip({ signal: dependent });
      this.target = Object.freeze({ height: point.height, hash: point.hash });
      const scan = await syncWallet(this.session, this.light, this.target, dependent);
      this.reached = scan.fullyScannedHeight !== null && scan.fullyScannedHeight >= this.target.height;
      this.activity = 'idle';
      return await this.getSyncStatus();
    } catch (caught) {
      const error = isZcashError(caught) ? caught : failure('RUNTIME_UNAVAILABLE', 'sync', 'reopen', 'Wallet sync failed.');
      this.activity = error.code === 'ABORTED' ? 'stopped' : 'failed';
      if (error.code !== 'ABORTED') this.lastError = Object.freeze({ code: error.code, stage: error.stage, recovery: error.recovery, retryable: error.retryable, message: error.message });
      let status: SyncStatus;
      try { status = await this.getSyncStatus(); } catch { throw error; }
      if (error.code === 'ABORTED') return status;
      throw failure(error.code, error.stage, error.recovery, error.message, error.retryable, status);
    }
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    await this.running?.catch(() => {});
  }
}

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
