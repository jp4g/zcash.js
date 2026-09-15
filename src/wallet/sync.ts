import { ObserverBuffer } from '../observer-buffer.js';
import type { ChainPoint, ErrorInfo, LightClient, ObservationOptions, Op, SyncStatus } from '../types.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { operation } from '../clients/light-chain-reads.js';
import { blockHash } from '../primitives.js';
import type { attachWalletWorker } from './host.js';
import { applyEnhancement } from './enhancement.js';

type Session = ReturnType<typeof attachWalletWorker>;
const reverse = (hash: string) => hash.match(/../g)!.reverse().join('');
const mismatch = () => failure(
  'PROTOCOL_MISMATCH',
  'sync',
  'sync',
  'Sync source changed or returned inconsistent blocks.',
);
const unavailable = () => failure(
  'OBSERVATION_UNAVAILABLE',
  'sync',
  'configure',
  'No light client is configured for wallet sync.',
);
const recovery = () => failure('RECOVERY_REQUIRED', 'sync', 'sync', 'No retained common checkpoint is available.');

type Subscriber = { push(status: SyncStatus): void; finish(error?: unknown): void };

/** Wallet-owned finite and shared continuous sync lifecycle. The enclosing wallet owns and closes the worker. */
export class WalletSync {
  private activity: SyncStatus['activity'] = 'idle';
  private target: ChainPoint | null = null;
  private reached = false;
  private lastError: ErrorInfo | null = null;
  private controller: AbortController | undefined;
  private running: Promise<SyncStatus> | undefined;
  private readonly subscribers = new Set<Subscriber>();
  private watching: Promise<void> | undefined;
  private watchController: AbortController | undefined;
  private readonly observation: ObservationOptions;
  constructor(
    private readonly session: Session,
    private readonly light: LightClient | undefined,
    observation: ObservationOptions,
    private readonly scanBatchSize = 16,
  ) {
    if (!Number.isSafeInteger(scanBatchSize) || scanBatchSize < 1) throw invalidArgument();
    if (!observation || typeof observation !== 'object') throw invalidArgument();
    const poll = Object.getOwnPropertyDescriptor(observation, 'pollIntervalMs');
    const buffer = Object.getOwnPropertyDescriptor(observation, 'maxBufferedUpdates');
    if (!poll || !buffer || !Object.hasOwn(poll, 'value') || !Object.hasOwn(buffer, 'value')
      || !Number.isSafeInteger(poll.value) || poll.value <= 0
      || !Number.isSafeInteger(buffer.value) || buffer.value <= 0) throw invalidArgument();
    this.observation = { pollIntervalMs: poll.value, maxBufferedUpdates: buffer.value };
  }

  watchSync(args: Op = {}): AsyncIterableIterator<SyncStatus> {
    let owned: Op;
    try {
      if (!args || ![Object.prototype, null].includes(Object.getPrototypeOf(args))
        || Reflect.ownKeys(args).some(key => key !== 'signal')) throw invalidArgument();
      const field = Object.getOwnPropertyDescriptor(args, 'signal');
      if (field && !Object.hasOwn(field, 'value')) throw invalidArgument();
      owned = field ? { signal: field.value } : {};
    } catch {
      throw invalidArgument();
    }
    const buffer = new ObserverBuffer<SyncStatus>(this.observation.maxBufferedUpdates,
      () => failure('RESOURCE_LIMIT', 'sync', 'configure', 'Sync observation buffer exceeded.'),
      () => failure('RESOURCE_LIMIT', 'sync', 'configure', 'Concurrent sync observation reads are unsupported.'));
    let started = false;
    let pending: ReturnType<typeof operation> | undefined;
    const subscriber: Subscriber = {
      push: (status) => {
        if (buffer.finished) return;
        try {
          buffer.push(structuredClone(status));
        } catch (error) {
          subscriber.finish(error);
        }
      },
      finish: (error) => {
        if (buffer.finished) return;
        buffer.close(error);
        pending?.close();
        this.subscribers.delete(subscriber);
        if (!this.subscribers.size) this.watchController?.abort();
      },
    };
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => buffer.next(async () => {
        if (started) return;
        started = true;
        try {
          // Native host admission checks arguments and caller signal before subscription.
          const initial = await this.getSyncStatus(owned);
          if (!this.light) throw unavailable();
          if (buffer.finished) return;
          pending = operation(
            owned.signal,
            () => subscriber.finish(failure('ABORTED', 'sync', 'none', 'Sync observation aborted.')),
          );
          pending.check();
          this.subscribers.add(subscriber);
          subscriber.push(initial);
          this.startWatching();
        } catch (error) {
          subscriber.finish(error);
          throw error;
        }
      }),
      return: async () => {
        subscriber.finish();
        if (!this.subscribers.size) await this.watching;
        return { done: true, value: undefined };
      },
    };
  }

  private publish(status: SyncStatus) {
    for (const subscriber of this.subscribers) subscriber.push(status);
  }

  private startWatching() {
    if (this.watching || !this.subscribers.size) return;
    const controller = new AbortController();
    this.watchController = controller;
    this.watching = (async () => {
      while (!controller.signal.aborted && this.subscribers.size) {
        try {
          // Waiting on an independently started finite run does not grant cancellation ownership.
          if (this.running) {
            const waiting = operation(controller.signal);
            try {
              await waiting.wait(this.running);
            } finally {
              waiting.close();
            }
          } else await this.sync({ signal: controller.signal });
        } catch (error) {
          if (controller.signal.aborted) break;
          if (!isZcashError(error) || !error.retryable || !['TRANSPORT_ERROR', 'TIMEOUT'].includes(error.code)) {
            for (const subscriber of this.subscribers) subscriber.finish(error);
          }
        }
        if (controller.signal.aborted || !this.subscribers.size) break;
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', finish);
            resolve();
          };
          let remaining = this.observation.pollIntervalMs;
          const tick = () => {
            if (remaining <= 0) {
              finish();
              return;
            }
            const delay = Math.min(remaining, 2_147_483_647);
            remaining -= delay;
            timer = setTimeout(tick, delay);
          };
          let timer: ReturnType<typeof setTimeout>;
          tick();
          controller.signal.addEventListener('abort', finish, { once: true });
        });
      }
    })().finally(() => {
      this.watching = undefined;
      this.watchController = undefined;
      this.startWatching();
    });
  }

  async getSyncStatus(args: Op = {}): Promise<SyncStatus> {
    // Both reads are local. Equal revisions bind their projections to one database state.
    for (let attempt = 0; attempt < 3; attempt++) {
      const scan = await this.session.scan.state(args);
      const pending = await this.session.enhancement.requests(args);
      if (scan.revision !== pending.revision) continue;
      const delayed = pending.requests.filter(
        r => r.kind === 'address' && r.requestAt !== null && r.requestAt > Date.now(),
      ).length;
      return {
        activity: this.activity,
        scan,
        target: this.target,
        targetReached: this.reached,
        enhancement: { actionable: pending.requests.length - delayed, delayed },
        workEstimate: null,
        lastError: this.lastError,
      };
    }
    throw failure('STORAGE_BUSY', 'sync', 'none', 'Wallet changed during the status read.');
  }

  sync(args: { target?: ChainPoint } & Op = {}): Promise<SyncStatus> {
    if (this.running) return Promise.reject(failure('STORAGE_BUSY', 'sync', 'none', 'Wallet sync is already running.'));
    let target: ChainPoint | undefined,
      signal: AbortSignal | undefined;
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
        const height = Object.getOwnPropertyDescriptor(value, 'height'),
          hash = Object.getOwnPropertyDescriptor(value, 'hash');
        if (!height || !hash || !Object.hasOwn(height, 'value') || !Object.hasOwn(hash, 'value')

          || Reflect.ownKeys(value).length !== 2
          || !Number.isInteger(height.value)
          || height.value < 0
          || height.value >= 0xffffffff) throw invalidArgument();
        target = Object.freeze({ height: height.value, hash: blockHash(hash.value) });
      }
    } catch {
      return Promise.reject(invalidArgument());
    }
    this.controller = new AbortController();
    this.running = this.run(target, signal).finally(() => {
      this.running = undefined;
      this.controller = undefined;
    });
    return this.running;
  }

  private async run(target: ChainPoint | undefined, signal: AbortSignal | undefined): Promise<SyncStatus> {
    this.activity = 'running';
    this.reached = false;
    this.lastError = null;
    this.target = target ?? null;
    try {
      // Host admission validates the caller's native signal before composing dependencies.
      await this.session.scan.state(signal === undefined ? {} : { signal });
      if (!this.light) throw unavailable();
      const dependent = signal === undefined
        ? this.controller!.signal
        : AbortSignal.any([signal, this.controller!.signal]);
      if (this.subscribers.size) this.publish(await this.getSyncStatus());
      const point = target ?? await this.light.getTip({ signal: dependent });
      this.target = Object.freeze({ height: point.height, hash: point.hash });
      await syncWallet(this.session, this.light, this.target, dependent, this.scanBatchSize);
      this.reached = true; // Native completion validates coverage, including an empty wallet.
      this.activity = 'idle';
      const status = await this.getSyncStatus();
      this.publish(status);
      return status;
    } catch (caught) {
      const error = isZcashError(caught)
        ? caught
        : failure('RUNTIME_UNAVAILABLE', 'sync', 'reopen', 'Wallet sync failed.');
      this.activity = error.code === 'ABORTED' ? 'stopped' : 'failed';
      if (error.code !== 'ABORTED') {
        this.lastError = Object.freeze({
          code: error.code,
          stage: error.stage,
          recovery: error.recovery,
          retryable: error.retryable,
          message: error.message,
        });
      }
      let status: SyncStatus;
      try {
        status = await this.getSyncStatus();
      } catch {
        throw error;
      }
      this.publish(status);
      if (error.code === 'ABORTED') return status;
      throw failure(error.code, error.stage, error.recovery, error.message, error.retryable, status);
    }
  }

  async stop(): Promise<void> {
    for (const subscriber of this.subscribers) subscriber.finish();
    this.watchController?.abort();
    this.controller?.abort();
    await this.running?.catch(() => { });
    await this.watching;
  }
}

/** Internal finite run used by the wallet owner; all scan decisions and writes remain native. */
export async function syncWallet(
  session: Session,
  light: LightClient,
  target: ChainPoint,
  signal?: AbortSignal,
  scanBatchSize = 16,
) {
  if (!Number.isSafeInteger(scanBatchSize) || scanBatchSize < 1) throw invalidArgument();
  const batchSize = Math.min(scanBatchSize, 16); // Native/control-message ceiling remains authoritative.
  const op = signal === undefined ? {} : { signal };
  const pin = async () => {
    try {
      const tree = await light.getTreeState({ height: target.height, ...op });
      if (tree.point.hash !== target.hash) throw mismatch();
      return tree;
    } catch (error) {
      if (isZcashError(error) && error.code === 'METHOD_NOT_SUPPORTED') {
        throw failure(
          'TARGET_PINNING_UNSUPPORTED',
          'sync',
          'configure',
          'Source cannot pin the sync target.',
        );
      }
      throw error;
    }
  };
  await pin();
  const state = await session.scan.state(op);
  let height = Math.min(state.maxScannedHeight ?? 0, target.height);
  let fork = false;
  for (; height > 0; height--) {
    const local = await session.scan.block({ height, ...op });
    if (local.point === null) {
      if (fork) throw recovery();
      break;
    }
    const remote = await light.getTreeState({ height, ...op });
    if (remote.point.hash === reverse(local.point.hash)) {
      if (fork) await session.scan.rewind({ revision: local.revision, requestedPoint: local.point, ...op });
      break;
    }
    fork = true;
  }
  if (fork && height === 0) throw recovery();
  const nativeTarget = { height: target.height, hash: reverse(target.hash) };
  for (; ;) {
    const plan = await session.scan.plan({ target: nativeTarget, ...op });
    const range = plan.ranges.find(range => range.start <= target.height);
    if (!range) break;
    const end = Math.min(range.endExclusive - 1, target.height, range.start + batchSize - 1);
    const prior = await light.getTreeState({ height: range.start - 1, ...op });
    if (range.priorState.hash !== null && prior.point.hash !== reverse(range.priorState.hash)) throw mismatch();
    const blocks: Uint8Array[] = [];
    let bytes = 0;
    for await (const block of light.streamCompactBlocks({ fromHeight: range.start, toHeight: end, ...op })) {
      if (block.point.height !== range.start + blocks.length) throw mismatch();
      if (block.encoded.length > 2 * 1024 * 1024) {
        throw failure(
          'RESOURCE_LIMIT',
          'sync',
          'configure',
          'Compact block exceeds native scan batch limit.',
        );
      }
      if (bytes + block.encoded.length > 2 * 1024 * 1024) break;
      blocks.push(block.encoded);
      bytes += block.encoded.length;
    }
    if (!blocks.length) throw mismatch();
    await session.scan.ingest({
      revision: plan.revision,
      target: nativeTarget,
      priorTreeState: prior.encoded,
      blocks,
      ...op,
    });
  }
  // Upstream polling requests may remain after a successful status update. Visit each once per run.
  const visited = new Set<string>();
  for (; ;) {
    const pending = await session.enhancement.requests(op);
    const request = pending.requests.find(value => !visited.has(JSON.stringify(value))
      && !(value.kind === 'address' && value.requestAt !== null && value.requestAt > Date.now()));
    if (!request) break;
    if (visited.size >= 1024) {
      throw failure(
        'RESOURCE_LIMIT',
        'sync',
        'sync',
        'Sync enhancement pass exceeded its request limit.',
      );
    }
    visited.add(JSON.stringify(request));
    await applyEnhancement(session, light, pending.revision, request, signal);
  }
  const tree = await pin();
  const current = await session.scan.state(op);
  await session.scan.complete({ revision: current.revision, target: nativeTarget, treeState: tree.encoded, ...op });
  return session.scan.state(op);
}
