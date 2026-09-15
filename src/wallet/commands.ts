import type {ErrorInfo, Op, ViewingImport} from '../types.js';
import type {WalletSession, InitializedSigners, NativeSignerAuthorization} from './session.js';
import {copyRecord} from '../clients/owned-plumbing.js';
import {invalidArgument} from '../errors.js';

// Input/result contracts come from the selected method; policy stays beside dispatch.
function command<Owner, F extends (...args: never[]) => unknown>(
  select: (owner: Owner) => F, stage: ErrorInfo['stage'],
  flags: {write?: boolean; secret?: boolean; signer?: boolean; proposal?: boolean} = {},
) { return {select, stage, ...flags}; }

export const walletCommands = {
  payment_abandon: command((s: WalletSession) => s.payments.abandon, 'observation', {write: true}),
  payment_get: command((s: WalletSession) => s.payments.get, 'observation'),
  payment_list: command((s: WalletSession) => s.payments.list, 'observation'),
  payment_reconcile: command((s: WalletSession) => s.payments.reconcile, 'observation', {write: true}),
  payment_observe: command((s: WalletSession) => s.payments.observe, 'observation', {write: true}),
  payment_attempt_begin: command((s: WalletSession) => s.payments.begin, 'submission', {write: true}),
  payment_attempt_finish: command((s: WalletSession) => s.payments.finish, 'submission', {write: true}),
  payment_recovery_position: command((s: WalletSession) => s.payments.position, 'observation', {write: true}),
  fused_send: command((s: WalletSession) => s.fused.send, 'finalization', {write: true}),
  pczt_finalize: command((s: WalletSession) => s.pczt.finalize, 'finalization', {write: true}),
  finalized_get: command((s: WalletSession) => s.pczt.finalized, 'account'),
  account_viewing_key: command((s: WalletSession) => s.accounts.viewingKey, 'account'),
  account_remove: command((s: WalletSession) => s.accounts.remove, 'account', {write: true}),
  account_check_key: command((s: WalletSession) => s.accounts.checkKey, 'account'),
  account_import: command((s: WalletSession) => s.accounts.import, 'account', {write: true}),
  account_list: command((s: WalletSession) => s.accounts.list, 'account'),
  account_get: command((s: WalletSession) => s.accounts.get, 'account'),
  address_current: command((s: WalletSession) => s.addresses.current, 'address'),
  address_next: command((s: WalletSession) => s.addresses.next, 'address', {write: true}),
  address_list: command((s: WalletSession) => s.addresses.list, 'address'),
  address_at: command((s: WalletSession) => s.addresses.at, 'address', {write: true}),
  scan_plan: command((s: WalletSession) => s.scan.plan, 'sync', {write: true}),
  scan_ingest_batch: command((s: WalletSession) => s.scan.ingest, 'sync', {write: true}),
  scan_state: command((s: WalletSession) => s.scan.state, 'sync'),
  scan_block_hash: command((s: WalletSession) => s.scan.block, 'sync'),
  scan_rewind: command((s: WalletSession) => s.scan.rewind, 'sync', {write: true}),
  scan_complete: command((s: WalletSession) => s.scan.complete, 'sync', {write: true}),
  enhancement_requests: command((s: WalletSession) => s.enhancement.requests, 'sync'),
  enhancement_apply: command((s: WalletSession) => s.enhancement.apply, 'sync', {write: true}),
  account_balance: command((s: WalletSession) => s.getBalance.bind(s), 'query'),
  close: command((s: WalletSession) => s.close.bind(s), 'runtime'),
  wallet_notes: command((s: WalletSession) => s.listNotes.bind(s), 'query'),
  wallet_utxos: command((s: WalletSession) => s.listUtxos.bind(s), 'query'),
  wallet_history: command((s: WalletSession) => s.getHistory.bind(s), 'query'),
  wallet_transaction: command((s: WalletSession) => s.getTransaction.bind(s), 'query'),
  account_import_mnemonic_signer: command((s: WalletSession) => s.mnemonic.import, 'account', {write: true, secret: true}),
  account_create_mnemonic_signer: command((s: WalletSession) => s.mnemonic.create, 'account', {write: true, secret: true}),
  pczt_prove: command((s: WalletSession) => s.pczt.prove, 'proving', {write: true}),
  pczt_import: command((s: WalletSession) => s.pczt.import, 'proposal', {write: true}),
  pczt_build: command((s: WalletSession) => s.pczt.build, 'proposal', {write: true}),
  pczt_get_artifact: command((s: WalletSession) => s.pczt.get, 'proposal'),
  proposal_lookup_intent: command((s: WalletSession) => s.proposals.lookup, 'proposal', {proposal: true}),
  proposal_create: command((s: WalletSession) => s.proposals.create, 'proposal', {write: true, proposal: true}),
  proposal_get: command((s: WalletSession) => s.proposals.get, 'proposal', {proposal: true}),
  proposal_list: command((s: WalletSession) => s.proposals.list, 'proposal', {proposal: true}),
  signer_bind: command((s: WalletSession) => s.signers.bind, 'account', {signer: true}),
  signer_unbind: command((s: WalletSession) => s.signers.unbind, 'account', {signer: true}),
};

function signerToken(value: unknown): number {
  const { token } = copyRecord(value, ['token']);
  if (typeof token !== 'number') throw invalidArgument();
  return token;
}
function signerAuthorization(value: unknown): import('./session.js').NativeSignerAuthorization {
  const dto = copyRecord(value, ['token', 'format', 'parameters', 'genesis', 'height', 'branch', 'bytes', 'maximum']);
  if (typeof dto.token !== 'number' || typeof dto.format !== 'string'
    || !(dto.parameters instanceof Uint8Array) || !(dto.genesis instanceof Uint8Array) || !(dto.bytes instanceof Uint8Array)
    || typeof dto.height !== 'number' || typeof dto.branch !== 'number' || typeof dto.maximum !== 'number') throw invalidArgument();
  return { token: dto.token, format: dto.format, parameters: dto.parameters, genesis: dto.genesis,
    height: dto.height, branch: dto.branch, bytes: dto.bytes, maximum: dto.maximum };
}

export const signerCommands = {
  signer_capabilities: command((s: InitializedSigners) => (args: {token: number}) => s.capabilities(signerToken(args)), 'account', {signer: true}),
  signer_authorize: command((s: InitializedSigners) => (args: NativeSignerAuthorization) => {
    const dto = signerAuthorization(args);
    return s.authorize(dto.token, dto.format, dto.parameters, dto.genesis, dto.height, dto.branch, dto.bytes, dto.maximum);
  }, 'authorization', {signer: true}),
  signer_describe: command((s: InitializedSigners) => (args: {token: number}) => s.describe(signerToken(args)), 'account', {signer: true}),
  signer_release: command((s: InitializedSigners) => (args: {token: number}) => s.release(signerToken(args)), 'account', {signer: true}),
  close: command(() => () => {}, 'runtime'),
};
export const commands = {...walletCommands, ...signerCommands};
export type WalletCommand = keyof typeof commands;
type Method<C extends WalletCommand> = ReturnType<typeof commands[C]['select']>;
type WireInput<C extends WalletCommand> = Parameters<Method<C>> extends [] ? object : Parameters<Method<C>>[0];
export type WalletInput<C extends WalletCommand> = C extends 'account_import' ? ViewingImport
  : C extends 'pczt_prove' | 'pczt_import' ? Omit<WireInput<C>, 'maximum'> & Op
  : (WireInput<C> & Op) | (undefined extends WireInput<C> ? undefined : never);
export type WalletResult<C extends WalletCommand> = Awaited<ReturnType<Method<C>>>;
export const mnemonicCommand = (value: unknown): boolean => typeof value === 'string'
  && Object.hasOwn(commands, value) && commands[value as WalletCommand].secret === true;
