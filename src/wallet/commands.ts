import type {
  NativePcztBuildInput,
  NativePcztArtifact,
  NativeProposalInput,
  NativeProposalIntent,
  NativeProposalReview,
  ProposalInventoryInput,
  ProposalInventory,
} from './proposals.js';
import type {
  NativePayment,
  PaymentInventory,
  PaymentInventoryInput,
  PaymentObserve,
  PaymentAttempt,
  PaymentAttemptInput,
  PaymentAttemptFinish,
  NativeFinalized,
  NativeFusedInput,
  NativeFused,
  PaymentReconcile,
} from './payment-journal-types.js';
import type {
  AccountRecord,
  AccountsApi,
  Birthday,
  ConfirmationsPolicy,
  Op,
  ScanState,
  ViewingImport,
  WalletAddressesApi,
  WalletBalance,
} from '../types.js';
import type { HistoryPage, NotePage, UtxoPage, WalletClient, WalletTransaction } from '../types.js';

import type { ErrorInfo } from '../types.js';

import type { InitializedSigners, NativeSignerAuthorization, MnemonicAccountInput, NativeCreatedAccount,
  ScanTarget, ScanPlan, ScanBatch, ScanReceipt, ScanBlock, ScanRewind, ScanCompletion,
  EnhancementRequests, EnhancementApply } from './session.js';
import { copyRecord } from '../clients/owned-plumbing.js';
import { invalidArgument } from '../errors.js';

export interface NativeWalletCalls {
  payment_abandon(args: { operationId: string }): NativePayment;
  payment_get(args: { operationId: string }): NativePayment | null;
  payment_list(args: PaymentInventoryInput): PaymentInventory;
  payment_reconcile(args: PaymentReconcile): NativePayment;
  payment_observe(args: PaymentObserve): NativePayment;
  payment_attempt_begin(args: PaymentAttemptInput): PaymentAttempt | null;
  payment_attempt_finish(args: PaymentAttemptFinish): NativePayment;
  payment_recovery_position(args: { afterSequence: string }): void;
  fused_send(args: NativeFusedInput): NativeFused;
  pczt_finalize(
    args: { operationId: string; artifactId: string; spend: Uint8Array; output: Uint8Array },
  ): NativeFinalized;
  finalized_get(args: { operationId: string }): NativeFused;
  account_viewing_key(args: { accountId: string }): string | null;
  account_remove(args: Parameters<AccountsApi['remove']>[0]): Awaited<ReturnType<AccountsApi['remove']>>;
  account_check_key(args: { accountId: string; viewingKey: string }): 'ready' | 'recovery-required';
  account_import(
    args: Omit<ViewingImport, 'birthday'> & {
      birthday: 'fullScan' | (Omit<Birthday, 'network'> & {
        parameters: Uint8Array; genesis: Uint8Array;
      });
    },
  ): AccountRecord;
  account_list(args: Op | undefined): readonly AccountRecord[];
  account_get(args: Parameters<AccountsApi['get']>[0]): Awaited<ReturnType<AccountsApi['get']>>;
  scan_plan(args: { target: ScanTarget } & Op): ScanPlan;
  scan_ingest_batch(args: ScanBatch & Op): ScanReceipt;
  scan_state(args: Op | undefined): ScanState;
  scan_block_hash(args: { height: number } & Op): ScanBlock;
  scan_rewind(args: ScanRewind & Op): ScanBlock;
  scan_complete(args: ScanCompletion & Op): { readonly revision: string };
  enhancement_requests(args: Op | undefined): EnhancementRequests;
  enhancement_apply(args: EnhancementApply & Op): { revision: string };
  account_balance(args: { accountId: string; confirmations: ConfirmationsPolicy } & Op): WalletBalance;
  account_import_mnemonic_signer(args: MnemonicAccountInput): NativeCreatedAccount;
  account_create_mnemonic_signer(args: MnemonicAccountInput): NativeCreatedAccount;
  pczt_prove(
    args: { operationId: string; artifactId: string; spend: Uint8Array; output: Uint8Array; maximum: number },
  ): NativePcztArtifact;
  pczt_import(args: { operationId: string; bytes: Uint8Array; maximum: number }): NativePcztArtifact;
  pczt_build(args: NativePcztBuildInput): NativePcztArtifact;
  pczt_get_artifact(args: { operationId: string; artifactId?: string }): NativePcztArtifact | null;
  proposal_lookup_intent(args: NativeProposalIntent & { idempotencyKey: string }): NativeProposalReview | null;
  proposal_create(args: NativeProposalInput): NativeProposalReview;
  proposal_get(args: { operationId: string }): NativeProposalReview | null;
  proposal_list(args: ProposalInventoryInput): ProposalInventory;
  signer_bind(args: { token: number; accountId: string }): 'ready' | 'recovery-required';
  signer_unbind(args: { token: number; accountId: string }): void;
  address_current(
    args: Parameters<WalletAddressesApi['current']>[0],
  ): Awaited<ReturnType<WalletAddressesApi['current']>>;
  address_next(args: Parameters<WalletAddressesApi['next']>[0]): Awaited<ReturnType<WalletAddressesApi['next']>>;
  address_list(args: Parameters<WalletAddressesApi['list']>[0]): Awaited<ReturnType<WalletAddressesApi['list']>>;
  address_at(args: Parameters<WalletAddressesApi['at']>[0]): Awaited<ReturnType<WalletAddressesApi['at']>>;
  wallet_notes(args: Parameters<WalletClient['listNotes']>[0]): NotePage;
  wallet_utxos(args: Parameters<WalletClient['listUtxos']>[0]): UtxoPage;
  wallet_history(args: Parameters<WalletClient['getHistory']>[0]): HistoryPage;
  wallet_transaction(args: Parameters<WalletClient['getTransaction']>[0]): WalletTransaction | null;
  close(): void;
}

// Signer commands adapt the separate native signer owner.
function command<Owner, F extends (...args: never[]) => unknown>(
  select: (owner: Owner) => F, stage: ErrorInfo['stage'],
  flags: { write?: boolean; secret?: boolean; signer?: boolean; proposal?: boolean } = {},
) {
  return { select, stage, ...flags };
}

type CommandPolicy = {
  stage: ErrorInfo['stage']; write?: boolean; secret?: boolean; signer?: boolean; proposal?: boolean;
};
export const walletCommands: Record<keyof NativeWalletCalls, CommandPolicy> = {
  payment_abandon: { stage: 'observation', write: true },
  payment_get: { stage: 'observation' },
  payment_list: { stage: 'observation' },
  payment_reconcile: { stage: 'observation', write: true },
  payment_observe: { stage: 'observation', write: true },
  payment_attempt_begin: { stage: 'submission', write: true },
  payment_attempt_finish: { stage: 'submission', write: true },
  payment_recovery_position: { stage: 'observation', write: true },
  fused_send: { stage: 'finalization', write: true },
  pczt_finalize: { stage: 'finalization', write: true },
  finalized_get: { stage: 'account' },
  account_viewing_key: { stage: 'account' },
  account_remove: { stage: 'account', write: true },
  account_check_key: { stage: 'account' },
  account_import: { stage: 'account', write: true },
  account_list: { stage: 'account' },
  account_get: { stage: 'account' },
  address_current: { stage: 'address' },
  address_next: { stage: 'address', write: true },
  address_list: { stage: 'address' },
  address_at: { stage: 'address', write: true },
  scan_plan: { stage: 'sync', write: true },
  scan_ingest_batch: { stage: 'sync', write: true },
  scan_state: { stage: 'sync' },
  scan_block_hash: { stage: 'sync' },
  scan_rewind: { stage: 'sync', write: true },
  scan_complete: { stage: 'sync', write: true },
  enhancement_requests: { stage: 'sync' },
  enhancement_apply: { stage: 'sync', write: true },
  account_balance: { stage: 'query' },
  close: { stage: 'runtime' },
  wallet_notes: { stage: 'query' },
  wallet_utxos: { stage: 'query' },
  wallet_history: { stage: 'query' },
  wallet_transaction: { stage: 'query' },
  account_import_mnemonic_signer: { stage: 'account', write: true, secret: true },
  account_create_mnemonic_signer: { stage: 'account', write: true, secret: true },
  pczt_prove: { stage: 'proving', write: true },
  pczt_import: { stage: 'proposal', write: true },
  pczt_build: { stage: 'proposal', write: true },
  pczt_get_artifact: { stage: 'proposal' },
  proposal_lookup_intent: { stage: 'proposal', proposal: true },
  proposal_create: { stage: 'proposal', write: true, proposal: true },
  proposal_get: { stage: 'proposal', proposal: true },
  proposal_list: { stage: 'proposal', proposal: true },
  signer_bind: { stage: 'account', signer: true },
  signer_unbind: { stage: 'account', signer: true },
};

function signerToken(value: unknown): number {
  const { token } = copyRecord(value, ['token']);
  if (typeof token !== 'number') throw invalidArgument();
  return token;
}
function signerAuthorization(value: unknown): import('./session.js').NativeSignerAuthorization {
  const dto = copyRecord(value, ['token', 'format', 'parameters', 'genesis', 'height', 'branch', 'bytes', 'maximum']);
  if (typeof dto.token !== 'number' || typeof dto.format !== 'string'

    || !(dto.parameters instanceof Uint8Array)
    || !(dto.genesis instanceof Uint8Array)
    || !(dto.bytes instanceof Uint8Array)

    || typeof dto.height !== 'number'
    || typeof dto.branch !== 'number'
    || typeof dto.maximum !== 'number') throw invalidArgument();
  return {
    token: dto.token,
    format: dto.format,
    parameters: dto.parameters,
    genesis: dto.genesis,
    height: dto.height,
    branch: dto.branch,
    bytes: dto.bytes,
    maximum: dto.maximum,
  };
}

export const signerCommands = {

  signer_capabilities: command(
    (s: InitializedSigners) => (args: { token: number }) => s.capabilities(signerToken(args)),
    'account',
    { signer: true },
  ),
  signer_authorize: command((s: InitializedSigners) => (args: NativeSignerAuthorization) => {
    const dto = signerAuthorization(args);
    return s.authorize(
      dto.token,
      dto.format,
      dto.parameters,
      dto.genesis,
      dto.height,
      dto.branch,
      dto.bytes,
      dto.maximum,
    );
  }, 'authorization', { signer: true }),
  signer_describe: command(
    (s: InitializedSigners) => (args: { token: number }) => s.describe(signerToken(args)),
    'account',
    { signer: true },
  ),
  signer_release: command(
    (s: InitializedSigners) => (args: { token: number }) => s.release(signerToken(args)),
    'account',
    { signer: true },
  ),
  close: command(() => () => { }, 'runtime'),
};
export const commands = { ...walletCommands, ...signerCommands };
export type WalletCommand = keyof typeof commands;
type Method<C extends WalletCommand> = C extends keyof NativeWalletCalls ? NativeWalletCalls[C]
  : C extends keyof typeof signerCommands ? ReturnType<typeof signerCommands[C]['select']> : never;
type WireInput<C extends WalletCommand> = Parameters<Method<C>> extends [] ? object : Parameters<Method<C>>[0];
export type WalletInput<C extends WalletCommand> = C extends 'account_import' ? ViewingImport
  : C extends 'pczt_prove' | 'pczt_import' ? Omit<WireInput<C>, 'maximum'> & Op
    : (WireInput<C> & Op) | (undefined extends WireInput<C> ? undefined : never);
export type WalletResult<C extends WalletCommand> = Awaited<ReturnType<Method<C>>>;
export const mnemonicCommand = (value: unknown): boolean => typeof value === 'string'
  && Object.hasOwn(commands, value) && commands[value as WalletCommand].secret === true;
