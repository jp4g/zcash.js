import type { ErrorCode, ErrorInfo } from '../../docs/api/public-api.js';
import { failure, isZcashError } from '../errors.js';
import { WalletSession } from './session.js';
import type { Completion, InitializedViews } from './session.js';

export type WalletCommand = 'account_import' | 'account_list' | 'account_get' | 'account_balance'
  | 'wallet_history' | 'wallet_transaction'
  | 'enhancement_requests' | 'enhancement_apply'
  | 'scan_state' | 'scan_block_hash' | 'scan_rewind' | 'scan_complete' | 'scan_plan' | 'scan_ingest_batch' | 'address_current' | 'address_next' | 'address_list' | 'address_at' | 'close';
export interface WalletReply {
  readonly id: number;
  readonly completion: Completion;
  readonly invalid: boolean;
  readonly outcome: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: ErrorInfo };
}
export const walletWrites = new Set<WalletCommand>(['account_import', 'address_next', 'address_at', 'scan_plan', 'scan_ingest_batch', 'scan_rewind', 'scan_complete', 'enhancement_apply']);

const nativeCodes: Record<string, ErrorCode> = {
  RESOURCE_LIMIT: 'RESOURCE_LIMIT', STALE_REVISION: 'CURSOR_STALE', CURSOR_STALE: 'CURSOR_STALE',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  METHOD_NOT_SUPPORTED: 'METHOD_NOT_SUPPORTED',
  CHAIN_MISMATCH: 'PROTOCOL_MISMATCH', SCAN_FAILED: 'PROTOCOL_MISMATCH',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT', INVALID_VIEWING_KEY: 'INVALID_ARGUMENT',
  INVALID_BIRTHDAY: 'INVALID_ARGUMENT', INCOHERENT_BIRTHDAY: 'NETWORK_MISMATCH',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH', ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_COLLISION: 'ACCOUNT_COLLISION', INCOMING_ONLY_WALLET_UNSUPPORTED: 'INCOMING_ONLY_WALLET_UNSUPPORTED',
  RECEIVER_UNAVAILABLE: 'RECEIVER_UNAVAILABLE', ADDRESS_UNAVAILABLE: 'RECEIVER_UNAVAILABLE',
  ADDRESS_INDEX_REUSE: 'ADDRESS_ALREADY_EXPOSED', ADDRESS_GAP_LIMIT: 'DISCOVERY_RANGE_UNSAFE',
  SYNC_REQUIRED: 'SYNC_REQUIRED', STORAGE_ERROR: 'STORAGE_ERROR', STORAGE_BUSY: 'STORAGE_BUSY',
  STORAGE_CLOSE_FAILED: 'STORAGE_ERROR', INVALID_ACCOUNT_METADATA: 'STORAGE_ERROR',
  INVALID_STORED_ADDRESS: 'STORAGE_ERROR', VIEWING_SCHEMA_REQUIRED: 'MIGRATION_REQUIRED',
  POOL_UNAVAILABLE: 'UNSUPPORTED_POOL', UNSUPPORTED_VIEWING_COMPONENT: 'UNSUPPORTED_POOL',
  UNSUPPORTED_POOL_PROJECTION: 'UNSUPPORTED_POOL', UNSUPPORTED_ADDRESS_FORMAT: 'INVALID_ARGUMENT',
  STALE_HANDLE: 'STALE_HANDLE', ABORTED: 'ABORTED', CLOSED: 'CLOSED',
};
export const walletErrorCodes: ReadonlySet<string> = new Set([...Object.values(nativeCodes), 'RUNTIME_UNAVAILABLE']);

function errorInfo(error: unknown, command: WalletCommand): { error: ErrorInfo; invalid: boolean } {
  let code: ErrorCode | undefined;
  if (isZcashError(error)) code = error.code;
  else {
    let name: unknown = error;
    try { if (typeof error === 'object' && error !== null) name = Object.getOwnPropertyDescriptor(error, 'message')?.value; }
    catch { /* Foreign access failures reveal no text. */ }
    if (typeof name === 'string' && Object.hasOwn(nativeCodes, name)) code = nativeCodes[name];
  }
  const invalid = code === undefined || code === 'STALE_HANDLE';
  code ??= 'RUNTIME_UNAVAILABLE';
  const storage = ['STORAGE_ERROR', 'STORAGE_BUSY', 'MIGRATION_REQUIRED'].includes(code);
  const sync = command.startsWith('scan_') || command.startsWith('enhancement_');
  const stage: ErrorInfo['stage'] = invalid ? 'runtime' : storage ? 'storage' : code === 'INVALID_ARGUMENT' ? 'validation'
    : sync ? 'sync' : command === 'account_balance' || command.startsWith('wallet_') ? 'query' : command.startsWith('address_') ? 'address' : command === 'close' ? 'runtime' : 'account';
  const recovery: ErrorInfo['recovery'] = code === 'RESOURCE_LIMIT' ? 'configure' : invalid || storage ? 'reopen' : code === 'SYNC_REQUIRED' || sync && ['CURSOR_STALE', 'PROTOCOL_MISMATCH'].includes(code) ? 'sync'
    : code === 'ABORTED' || code === 'CLOSED' ? 'none' : 'correct-input';
  return { error: { code, stage, recovery, retryable: false, message: 'Wallet operation failed.' }, invalid };
}

/** Called only after the packaged worker initializes its actual Rust storage owner. */
export function installWalletWorker(owner: InitializedViews, port: MessagePort): void {
  const session = new WalletSession(owner);
  const calls = {
    account_import: session.accounts.import, account_list: session.accounts.list, account_get: session.accounts.get,
    address_current: session.addresses.current, address_next: session.addresses.next,
    address_list: session.addresses.list, address_at: session.addresses.at,
    scan_plan: session.scan.plan, scan_ingest_batch: session.scan.ingest,
    scan_state: session.scan.state, scan_block_hash: session.scan.block, scan_rewind: session.scan.rewind,
    scan_complete: session.scan.complete,
    enhancement_requests: session.enhancement.requests, enhancement_apply: session.enhancement.apply,
    account_balance: session.getBalance.bind(session), close: () => session.close(),
    wallet_history: session.getHistory.bind(session), wallet_transaction: session.getTransaction.bind(session),
  };
  let lastId = 0, closed = false;
  port.onmessage = async ({ data }) => {
    let command: WalletCommand = 'close';
    try {
      if (!data || !Number.isSafeInteger(data.id) || data.id <= lastId
        || !Object.hasOwn(calls, data.command) || typeof data.args !== 'object' || data.args === null
        || Array.isArray(data.args) || Object.keys(data).sort().join(',') !== 'args,command,id') {
        throw failure('INVALID_ARGUMENT', 'validation', 'correct-input', 'Invalid wallet request.');
      }
      lastId = data.id; command = data.command;
      if (closed) throw failure('CLOSED', 'runtime', 'none', 'Wallet session is closed.');
      if (command === 'close') closed = true;
      const value = await (calls[command] as (args: object) => Promise<unknown>)(data.args);
      port.postMessage({ id: data.id, completion: walletWrites.has(command) ? 'committed' : 'none',
        invalid: false, outcome: { ok: true, value } } satisfies WalletReply);
    } catch (error) {
      const info = errorInfo(error, command);
      if (info.invalid) closed = true;
      const completion = typeof error === 'object' && error !== null ? session.completion(error) ?? 'unknown' : 'unknown';
      port.postMessage({ id: data?.id, completion, invalid: info.invalid, outcome: { ok: false, error: info.error } } satisfies WalletReply);
    }
  };
  port.start();
}
