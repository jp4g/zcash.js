import type { ErrorCode, ErrorInfo } from '../types.js';
import { failure, isZcashError } from '../errors.js';
import { WalletSession } from './session.js';
import type { Completion, InitializedViews, InitializedSigners } from './session.js';

import {commands, walletCommands, signerCommands, mnemonicCommand} from './commands.js';
import type {WalletCommand} from './commands.js';
export type {WalletCommand} from './commands.js';
export {mnemonicCommand} from './commands.js';
export interface WalletReply {
  readonly id: number;
  readonly completion: Completion;
  readonly invalid: boolean;
  readonly outcome: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: ErrorInfo };
}
/** Only SDK-owned plain structured-clone secret buffers reach this cleanup. */
export function clearMnemonic(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const args = value as Record<string, unknown>;
  for (const key of ['mnemonic', 'passphrase']) if (args?.[key] instanceof Uint8Array) args[key].fill(0);
}

const nativeCodes: Record<string, ErrorCode> = {
  NOT_FINALIZED:'NOT_FINALIZED',PAYMENT_BLOCKED:'PAYMENT_BLOCKED',TRANSACTION_EXPIRED:'TRANSACTION_EXPIRED',SUBMISSION_REJECTED:'SUBMISSION_REJECTED',SUBMISSION_UNKNOWN:'SUBMISSION_UNKNOWN',
  PROVING_MATERIAL_REQUIRED:'PROVING_MATERIAL_REQUIRED', PROOF_FAILED:'PROOF_FAILED', ASSET_INTEGRITY:'ASSET_INTEGRITY', ASSET_UNAVAILABLE:'ASSET_UNAVAILABLE',
  NOTHING_TO_SHIELD: 'NOTHING_TO_SHIELD', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS', FEE_LIMIT_EXCEEDED: 'FEE_LIMIT_EXCEEDED', STALE_PROPOSAL: 'STALE_PROPOSAL', INPUT_LOCKED: 'INPUT_LOCKED',
  PCZT_MULTI_STEP_UNSUPPORTED: 'PCZT_MULTI_STEP_UNSUPPORTED',
  OPERATION_NOT_FOUND: 'OPERATION_NOT_FOUND', INVALID_PCZT: 'INVALID_PCZT', ROLE_PRECONDITION: 'ROLE_PRECONDITION',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION', UNSUPPORTED_POOL: 'UNSUPPORTED_POOL', PCZT_ASSOCIATION_MISMATCH: 'PCZT_ASSOCIATION_MISMATCH',
  RESOURCE_LIMIT: 'RESOURCE_LIMIT', STALE_REVISION: 'CURSOR_STALE', CURSOR_STALE: 'CURSOR_STALE',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  INVALID_MNEMONIC: 'INVALID_MNEMONIC', ENTROPY_UNAVAILABLE: 'ENTROPY_UNAVAILABLE', SIGNER_MISMATCH: 'ACCOUNT_KEY_MISMATCH',
  ACCOUNT_INDEX_EXHAUSTED: 'RESOURCE_LIMIT',
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
  const definition = commands[command];
  if (definition.proposal && code === 'CURSOR_STALE') code = 'STALE_PROPOSAL';
  const invalid = code === undefined || code === 'STALE_HANDLE' && !definition.signer;
  code ??= 'RUNTIME_UNAVAILABLE';
  const storage = ['STORAGE_ERROR', 'STORAGE_BUSY', 'MIGRATION_REQUIRED'].includes(code);
  const sync = definition.stage === 'sync';
  const stage: ErrorInfo['stage'] = invalid ? 'runtime' : storage ? 'storage' : code === 'INVALID_ARGUMENT' ? 'validation'
    : definition.stage;
  const recovery: ErrorInfo['recovery'] = code === 'RESOURCE_LIMIT' ? 'configure' : invalid || storage ? 'reopen' : code === 'SYNC_REQUIRED' || sync && ['CURSOR_STALE', 'PROTOCOL_MISMATCH'].includes(code) ? 'sync'
    : code === 'STALE_PROPOSAL' ? 'review-new-proposal' : code === 'ABORTED' || code === 'CLOSED' ? 'none' : 'correct-input';
  return { error: { code, stage, recovery, retryable: false, message: 'Wallet operation failed.' }, invalid };
}

/** Called only after the packaged worker initializes its actual Rust storage owner. */
export function installWalletWorker(owner: InitializedViews | undefined, port: MessagePort, ownerInvalid: () => boolean = () => false, signers?: InitializedSigners): void {
  const session = owner ? new WalletSession(owner) : undefined;
  const calls: Partial<Record<WalletCommand, (...args: never[]) => unknown>> = {};
  if (session) {
    for (const [name, definition] of Object.entries(walletCommands))
      calls[name as keyof typeof walletCommands] = definition.select(session);
  } else {
    for (const [name, definition] of Object.entries(signerCommands))
      calls[name as keyof typeof signerCommands] = definition.select(signers!);
  }
  let lastId = 0, closed = false;
  port.onmessage = async ({ data: raw }: MessageEvent<unknown>) => {
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
    let command: WalletCommand = 'close';
    try {
      if (!data || typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= lastId
        || typeof data.command !== 'string' || !Object.hasOwn(calls, data.command) || typeof data.args !== 'object' || data.args === null
        || Array.isArray(data.args) || Object.keys(data).sort().join(',') !== 'args,command,id') {
        throw failure('INVALID_ARGUMENT', 'validation', 'correct-input', 'Invalid wallet request.');
      }
      lastId = data.id; command = data.command as WalletCommand;
      if (closed) throw failure('CLOSED', 'runtime', 'none', 'Wallet session is closed.');
      if (command === 'close') closed = true;
      // Session methods own command-specific validation; the router admits only the envelope.
      const value: unknown = await Reflect.apply(calls[command]!, calls, [data.args]);
      port.postMessage({ id: data.id, completion: commands[command].write ? 'committed' : 'none',
        invalid: false, outcome: { ok: true, value } } satisfies WalletReply);
    } catch (error) {
      const info = errorInfo(error, command);
      info.invalid ||= ownerInvalid();
      if (info.invalid) closed = true;
      const completion = session ? typeof error === 'object' && error !== null ? session.completion(error) ?? 'unknown' : 'unknown' : info.invalid ? 'unknown' : 'none';
      port.postMessage({ id: data?.id, completion, invalid: info.invalid, outcome: { ok: false, error: info.error } });
    } finally {
      if (mnemonicCommand(data?.command)) clearMnemonic(data?.args);
    }
  };
  port.start();
}
