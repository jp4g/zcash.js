import type { AccountRecord, AccountsApi, ConfirmationsPolicy, Op, ScanState, ViewingImport, WalletAddressesApi, WalletBalance, ZcashError } from '../../docs/api/public-api.js';
import type { HistoryPage, NotePage, UtxoPage, WalletClient, WalletTransaction } from '../../docs/api/public-api.js';
import { failure, invalidArgument, isZcashError } from '../errors.js';
import { ownBytes, snapshot as fields } from '../clients/owned-plumbing.js';
import { networkBinding } from '../network.js';
import type { ScanTarget, ScanPlan, ScanBatch, ScanReceipt, ScanBlock, ScanRewind, ScanCompletion, Completion } from './session.js';
import type { EnhancementRequests, EnhancementApply } from './session.js';
import type { WalletCommand, WalletReply } from './worker.js';
import { walletErrorCodes } from './worker.js';

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
const signalOf = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal')!.get!;
const any = AbortSignal.any.bind(AbortSignal);
const node = typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
const abortError = () => failure('ABORTED', 'runtime', 'none', 'Wallet operation aborted.');
const closedError = () => failure('CLOSED', 'runtime', 'none', 'Wallet is closed.');
const crashedError = () => failure('WORKER_CRASHED', 'runtime', 'reopen', 'Wallet worker failed.');
const limitError = () => failure('RESOURCE_LIMIT', 'runtime', 'configure', 'Wallet queue limit exceeded.');

/** Follow native cancellation, including suppressed/synthetic caller events. */
async function watch(signal: AbortSignal | undefined, cancel: () => void): Promise<() => void> {
  if (signal === undefined) return () => {};
  if (node) {
    const util = 'node:util', events = 'node:events';
    if ((await import(util)).types.isProxy(signal)) throw invalidArgument();
    const { addAbortListener } = await import(events);
    const view: AbortSignal = signalOf.call(new AbortController());
    Object.defineProperties(view, {
      aborted: { get: () => aborted.call(signal) },
      addEventListener: { value: (type: string, listener: EventListener, options: AddEventListenerOptions) =>
        add.call(signal, type, listener, { ...options, once: false }) },
      removeEventListener: { value: remove.bind(signal) },
    });
    const subscription = addAbortListener(view, () => { if (aborted.call(signal)) cancel(); });
    if (aborted.call(signal)) cancel();
    return () => subscription[(Symbol as SymbolConstructor & { readonly dispose: symbol }).dispose]();
  }
  const dependent = any([signal]);
  add.call(dependent, 'abort', cancel);
  if (aborted.call(dependent)) cancel();
  return () => remove.call(dependent, 'abort', cancel);
}

/** Copy supported control values without invoking caller getters or cloning unbounded inputs. */
function snapshot(args: object, maximum: number, command: WalletCommand) {
  let size = 0;
  let signal: AbortSignal | undefined;
  // Reserve both the queued owned input and its structured-clone transfer copy.
  const charge = (n: number) => { size += 2 * n; if (size > maximum) throw limitError(); };
  const copy = (value: unknown, depth: number): unknown => {
    charge(8);
    if (depth > 5) throw invalidArgument();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') { if (value < 0n || value >= (1n << 88n)) throw invalidArgument(); charge(16); return value; }
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value === 'string') { charge(value.length * 2); return value; }
    if (typeof value !== 'object' || value === null) throw invalidArgument();
    if (ArrayBuffer.isView(value)) {
      const owned = ownBytes(value as Uint8Array, invalidArgument, limitError);
      charge(owned.byteLength); return owned;
    }
    if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) throw invalidArgument();
    if (Array.isArray(value) && value.length > 16) throw invalidArgument();
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (typeof key !== 'string') throw invalidArgument();
      charge(key.length * 2 + 8);
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, 'value')) throw invalidArgument();
      if (depth === 0 && key === 'signal') {
        signal = property.value;
        if (signal !== undefined) {
          try { if (typeof aborted.call(signal) !== 'boolean') throw invalidArgument(); }
          catch { throw invalidArgument(); }
        }
      } else Object.defineProperty(result, key, { value: copy(property.value, depth + 1), enumerable: true });
    }
    return result;
  };
  let value: unknown;
  try {
    if (command === 'account_import') {
      const input = fields(args as ViewingImport, ['viewingKey', 'birthday', 'name', 'viewOnly', 'enabledPools', 'signal']);
      if (input.birthday !== 'fullScan') {
        const birthday = fields(input.birthday, ['network', 'firstScanHeight', 'priorTreeState', 'recoverUntilExclusive', 'source']);
        const { definition } = networkBinding(birthday.network);
        const { network: _network, ...checkpoint } = birthday;
        args = { ...input, birthday: { ...checkpoint, parameters: definition.parameters.bytes,
          genesis: Uint8Array.from(definition.genesisHash.match(/../g)!.reverse(), byte => parseInt(byte, 16)) } };
      } else args = input;
    }
    value = copy(args, 0);
  }
  catch (error) { if (isZcashError(error)) throw error; throw invalidArgument(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArgument();
  return { args: value, size, signal };
}

export interface WalletCompletion {
  readonly completion: Completion;
  /** Private reconciliation value after cancelled successful native work. Never diagnostic data. */
  readonly value?: unknown;
}

/** One admitted queue budget shared by every wallet port in a native owner. */
export interface WalletQueueBudget {
  jobs: number; bytes: number; active: boolean; wake: Set<() => void>; crash?: () => void;
}

/** Packaging supplies an initialized private port, worker destruction, and calls crashed() on worker loss. */
export function attachWalletWorker(port: MessagePort, destroy: () => Promise<void>,
  limits: { maxQueuedJobs: number; maxQueuedBytes: number }, shared?: WalletQueueBudget) {
  const { maxQueuedJobs, maxQueuedBytes } = limits;
  if (![maxQueuedJobs, maxQueuedBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw invalidArgument();
  type Job = { id: number; command: WalletCommand; args: object; size: number; ready: boolean; cancelled: boolean;
    cleanup: () => void; resolve: (value: unknown) => void; reject: (error: unknown) => void };
  const queue: Job[] = [], receipts = new WeakMap<object, WalletCompletion>();
  let active: Job | undefined, bytes = 0, nextId = 0, stopped = false;
  let closing: Promise<void> | undefined, destroyed: Promise<void> | undefined;
  const dispose = () => destroyed ??= Promise.resolve().then(destroy).finally(() => { shared?.wake.delete(pump); port.onmessage = null; port.onmessageerror = null; port.close(); });
  const reject = (job: Job, error: ZcashError, receipt: WalletCompletion) => {
    receipts.set(error, Object.freeze(receipt)); job.reject(error);
  };
  const release = (job: Job) => { bytes -= job.size;
    if (shared) {
      if (job.command !== 'close') { shared.jobs--; shared.bytes -= job.size; }
      if (active === job) shared.active = false;
      queueMicrotask(() => { for (const wake of shared.wake) wake(); });
    }
    try { job.cleanup(); } catch { /* Do not replace completion. */ } };
  const crashed = () => {
    if (stopped) return;
    stopped = true; shared?.crash?.();
    if (active) { release(active); reject(active, crashedError(), { completion: 'unknown' }); active = undefined; }
    for (const job of queue.splice(0)) { release(job); reject(job, crashedError(), { completion: 'none' }); }
    void dispose().catch(() => {});
  };
  const pump = () => {
    if (active || stopped || shared?.active) return;
    const job = queue[0];
    if (!job?.ready) return;
    queue.shift(); active = job; if (shared) shared.active = true;
    try { port.postMessage({ id: job.id, command: job.command, args: job.args }); }
    catch { crashed(); }
  };
  const call = <T>(command: WalletCommand, args: object = {}, close = false): Promise<T> => {
    if (stopped || (closing && !close)) {
      const error = closedError(); receipts.set(error, { completion: 'none' }); return Promise.reject(error);
    }
    let input: ReturnType<typeof snapshot>;
    try {
      // One fixed close control is reserved even when the work queue is full.
      input = close ? { args: {}, size: 0, signal: undefined } : snapshot(args, maxQueuedBytes, command);
      if (input.signal && aborted.call(input.signal)) throw abortError();
      if (!close && (queue.length + (active ? 1 : 0) >= maxQueuedJobs || input.size > maxQueuedBytes - bytes)) throw limitError();
      if (!close && shared && (shared.jobs >= maxQueuedJobs || input.size > maxQueuedBytes - shared.bytes)) throw limitError();
      if (nextId >= Number.MAX_SAFE_INTEGER) throw limitError();
    } catch (error) {
      if (error && typeof error === 'object') receipts.set(error, { completion: 'none' });
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, rejectPromise) => {
      const job: Job = { id: ++nextId, command, args: input.args, size: input.size, ready: false, cancelled: false,
        cleanup: () => {}, resolve: value => resolve(value as T), reject: rejectPromise };
      queue.push(job); bytes += job.size;
      if (shared && !close) { shared.jobs++; shared.bytes += job.size; }
      void watch(input.signal, () => {
        job.cancelled = true;
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); release(job); reject(job, abortError(), { completion: 'none' }); pump(); }
      }).then(cleanup => {
        job.cleanup = cleanup;
        if (!queue.includes(job) && active !== job) { try { cleanup(); } catch { /* Already settled. */ } return; }
        job.ready = true; pump();
      }, () => {
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); release(job); reject(job, invalidArgument(), { completion: 'none' }); pump(); }
      });
    });
  };
  port.onmessage = ({ data }: MessageEvent<WalletReply>) => {
    const job = active;
    if (!job || !data || data.id !== job.id || !['none', 'committed', 'unknown'].includes(data.completion)
      || typeof data.invalid !== 'boolean' || typeof data.outcome?.ok !== 'boolean') { crashed(); return; }
    if (!data.outcome.ok) {
      const e = data.outcome.error;
      if (!e || !walletErrorCodes.has(e.code) || e.retryable !== false || typeof e.message !== 'string'
        || !['validation', 'storage', 'runtime', 'account', 'address', 'query', 'sync'].includes(e.stage)
        || !['reopen', 'sync', 'none', 'correct-input', 'configure'].includes(e.recovery)) { crashed(); return; }
    } else if (data.invalid) { crashed(); return; }
    release(job); active = undefined;
    if (job.cancelled && data.outcome.ok) {
      reject(job, abortError(), { completion: data.completion, value: data.outcome.value });
    } else if (data.outcome.ok) job.resolve(data.outcome.value);
    else {
      const e = data.outcome.error;
      reject(job, failure(e.code, e.stage, e.recovery, 'Wallet operation failed.', false), { completion: data.completion });
    }
    if (data.invalid) crashed(); else pump();
  };
  port.onmessageerror = crashed;
  shared?.wake.add(pump);
  port.start();
  return {
    accounts: {
      import: (args: ViewingImport) => call<AccountRecord>('account_import', args),
      list: (args?: Op) => call<readonly AccountRecord[]>('account_list', args),
      get: (args: Parameters<AccountsApi['get']>[0]) => call<AccountRecord | null>('account_get', args),
    },
    addresses: {
      current: (args: Parameters<WalletAddressesApi['current']>[0]) => call<string | null>('address_current', args),
      next: (args: Parameters<WalletAddressesApi['next']>[0]) => call<Awaited<ReturnType<WalletAddressesApi['next']>>>('address_next', args),
      list: (args: Parameters<WalletAddressesApi['list']>[0]) => call<Awaited<ReturnType<WalletAddressesApi['list']>>>('address_list', args),
      at: (args: Parameters<WalletAddressesApi['at']>[0]) => call<Awaited<ReturnType<WalletAddressesApi['at']>>>('address_at', args),
    },
    getBalance: (args: { accountId: string; confirmations: ConfirmationsPolicy } & Op) => call<WalletBalance>('account_balance', args),
    listNotes: (args: Parameters<WalletClient['listNotes']>[0]) => call<NotePage>('wallet_notes', args),
    listUtxos: (args: Parameters<WalletClient['listUtxos']>[0]) => call<UtxoPage>('wallet_utxos', args),
    getHistory: (args: Parameters<WalletClient['getHistory']>[0]) => call<HistoryPage>('wallet_history', args),
    getTransaction: (args: Parameters<WalletClient['getTransaction']>[0]) => call<WalletTransaction | null>('wallet_transaction', args),
    scan: {
      state: (args?: Op) => call<ScanState>('scan_state', args),
      block: (args: { height: number } & Op) => call<ScanBlock>('scan_block_hash', args),
      rewind: (args: ScanRewind & Op) => call<ScanBlock>('scan_rewind', args),
      complete: (args: ScanCompletion & Op) => call<{ readonly revision: string }>('scan_complete', args),
      plan: (args: { target: ScanTarget } & Op) => call<ScanPlan>('scan_plan', args),
      ingest: (args: ScanBatch & Op) => call<ScanReceipt>('scan_ingest_batch', args),
    },
    enhancement: {
      requests: (args?: Op) => call<EnhancementRequests>('enhancement_requests', args),
      apply: (args: EnhancementApply & Op) => call<{ revision: string }>('enhancement_apply', args),
    },
    completion: (error: object) => receipts.get(error),
    crashed,
    close(): Promise<void> {
      closing ??= call<void>('close', {}, true).then(async () => { stopped = true; await dispose(); }, async error => {
        stopped = true;
        try { await dispose(); } catch { /* Preserve the storage close failure. */ }
        throw error;
      });
      return closing;
    },
  };
}
