import type { NativePcztBuildInput, NativePcztArtifact, NativeProposalInput, NativeProposalIntent, NativeProposalReview, ProposalInventoryInput, ProposalInventory } from './proposals.js';
import { failure } from '../errors.js';
import type { AccountRecord, AccountsApi, Birthday, ConfirmationsPolicy, Op, ScanState, ViewingImport, WalletAddressesApi, WalletBalance } from '../../docs/api/public-api.js';
import type { HistoryPage, NotePage, UtxoPage, WalletClient, WalletTransaction } from '../../docs/api/public-api.js';

/** Accepted, already initialized VIEW owner. Construct and consume in its worker. */
export interface InitializedViews {
  readonly generation: number;
  readonly instance: string;
  call(generation: number, instance: string, operation: string, args: object, seed?: Uint8Array, mnemonic?: Uint8Array, passphrase?: Uint8Array): unknown;
  bindSigner?(token: number, accountId: string): 'ready' | 'recovery-required';
  unbindSigner?(token: number, accountId: string): void;
  close(generation: number, instance: string): void;
}
export interface NativeSignerDescription { readonly parameters: string; readonly genesis: string; readonly accountIndex: number; readonly viewingKey: string }
export interface NativeSignerCapabilities extends Omit<import('../../docs/api/public-api.js').SignerCapabilities, 'networks'> { readonly parameters: string; readonly genesis: string }
export interface NativeSignerAuthorization { readonly token: number; readonly format: string; readonly parameters: Uint8Array; readonly genesis: Uint8Array; readonly height: number; readonly branch: number; readonly bytes: Uint8Array; readonly maximum: number }
export interface InitializedSigners {
  describe(token: number): NativeSignerDescription;
  release(token: number): void;
  capabilities(token: number): NativeSignerCapabilities;
  authorize(token: number, format: string, parameters: Uint8Array, genesis: Uint8Array, height: number, branch: number, bytes: Uint8Array, maximum: number): Uint8Array;
}
export interface MnemonicAccountInput {
  readonly mnemonic: Uint8Array; readonly passphrase?: Uint8Array;
  readonly accountIndex?: number; readonly birthday?: unknown; readonly name?: string;
  readonly enabledPools?: readonly string[];
}
export interface NativeCreatedAccount { readonly account: AccountRecord; readonly signerToken: number }

/** Private scanner points use protocol-order hash hex; public points use display order. */
export interface ScanTarget { readonly height: number; readonly hash: string }
export interface ScanPlan {
  readonly revision: string; readonly target: ScanTarget;
  readonly ranges: readonly { readonly start: number; readonly endExclusive: number; readonly priority: string;
    readonly priorState: { readonly height: number; readonly hash: string | null } }[];
}
export interface ScanBatch {
  readonly revision: string; readonly target: ScanTarget;
  readonly priorTreeState: Uint8Array; readonly blocks: readonly Uint8Array[];
}
export interface ScanReceipt { readonly revision: string; readonly start: number; readonly endExclusive: number; readonly blocks: number }
export interface ScanBlock { readonly revision: string; readonly point: ScanTarget | null }
export interface ScanRewind { readonly revision: string; readonly requestedPoint: ScanTarget }
export interface ScanCompletion { readonly revision: string; readonly target: ScanTarget; readonly treeState: Uint8Array }
export type EnhancementRequest = { readonly kind: 'enhancement' | 'status'; readonly txid: string }
  | { readonly kind: 'address'; readonly address: string; readonly start: number; readonly endExclusive: number | null;
    readonly requestAt: number | null; readonly txStatus: 'mined' | 'mempool' | 'all'; readonly outputStatus: 'unspent' | 'all' };
export interface EnhancementRequests { readonly revision: string; readonly requests: readonly EnhancementRequest[] }
export type EnhancementResult = { readonly transactions: readonly { readonly bytes: Uint8Array; readonly minedHeight: number | null }[]; readonly asOfHeight?: number; readonly complete?: boolean }
  | { readonly status: 'notRecognized' | 'notInMainChain' }
  | { readonly status: 'mined'; readonly height: number };
export interface EnhancementApply { readonly revision: string; readonly request: EnhancementRequest; readonly result: EnhancementResult }

export type Completion = 'none' | 'committed' | 'unknown';

/** Internal composition only; not a WalletClient or a public factory.
 * Native failures remain native until the public error/recovery boundary exists.
 */
export class WalletSession {
  private tail: Promise<unknown> = Promise.resolve();
  private closing: Promise<void> | undefined;
  private readonly completions = new WeakMap<object, Completion>();
  private readonly generation: number;
  private readonly instance: string;

  constructor(private readonly owner: InitializedViews) {
    this.generation = owner.generation;
    this.instance = owner.instance;
  }

  /** Worker-local completion receipt; never retry a rejected write automatically. */
  completion(error: object): Completion | undefined {
    return this.completions.get(error);
  }

  private invoke<T>(operation: string, args: object = {}): Promise<T> {
    if (this.closing) {
      const error = failure('CLOSED', 'runtime', 'none', 'Wallet session is closed.');
      this.completions.set(error, 'none');
      return Promise.reject(error);
    }
    const result = this.tail.then(() => {
      try {
        // The accepted owner supplies the frozen API DTOs, including bigint indices.
        if (operation === 'signer_bind' || operation === 'signer_unbind') {
          const input = args as { token: number; accountId: string };
          const method = operation === 'signer_bind' ? this.owner.bindSigner : this.owner.unbindSigner;
          if (!method) throw failure('METHOD_NOT_SUPPORTED', 'account', 'configure', 'Native signer binding unavailable.');
          return Reflect.apply(method, this.owner, [input.token, input.accountId]) as T;
        }
        if (operation === 'account_import_mnemonic_signer' || operation === 'account_create_mnemonic_signer') {
          const { mnemonic, passphrase, ...input } = args as MnemonicAccountInput;
          return this.owner.call(this.generation, this.instance, operation, input, undefined, mnemonic, passphrase) as T;
        }
        return this.owner.call(this.generation, this.instance, operation, args) as T;
      } catch (error) {
        if (typeof error === 'object' && error !== null && !this.completions.has(error)) {
          let commit: unknown;
          try { commit = Object.getOwnPropertyDescriptor(error, 'commit')?.value; } catch { /* Preserve the original rejection. */ }
          this.completions.set(error, commit === 'none' || commit === 'committed' ? commit : 'unknown');
        }
        throw error;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  readonly pczt = {
    build: (args: NativePcztBuildInput) => this.invoke<NativePcztArtifact>('pczt_build',args),
    get: (args: { operationId: string }) => this.invoke<NativePcztArtifact | null>('pczt_get_artifact',args),
  };

  readonly proposals = {
    lookup: (args: NativeProposalIntent & {idempotencyKey:string}) => this.invoke<NativeProposalReview|null>('proposal_lookup_intent',args),
    create: (args: NativeProposalInput) => this.invoke<NativeProposalReview>('proposal_create',args),
    get: (args: { operationId: string }) => this.invoke<NativeProposalReview | null>('proposal_get',args),
    list: (args: ProposalInventoryInput) => this.invoke<ProposalInventory>('proposal_list',args),
  };

  readonly mnemonic = {
    create: (args: MnemonicAccountInput) => this.invoke<NativeCreatedAccount>('account_create_mnemonic_signer', args),
    import: (args: MnemonicAccountInput) => this.invoke<NativeCreatedAccount>('account_import_mnemonic_signer', args),
  };
  readonly signers = {
    bind: (args: { token: number; accountId: string }) => this.invoke<'ready' | 'recovery-required'>('signer_bind', args),
    unbind: (args: { token: number; accountId: string }) => this.invoke<void>('signer_unbind', args),
  };

  readonly accounts: Pick<AccountsApi, 'list' | 'get' | 'remove'> & {
    checkKey(args: {accountId: string; viewingKey: string}): Promise<'ready' | 'recovery-required'>;
    import(args: Omit<ViewingImport, 'birthday'> & { readonly birthday: 'fullScan' | Omit<Birthday, 'network'> & { readonly parameters: Uint8Array; readonly genesis: Uint8Array } }): Promise<AccountRecord>;
  } = {
    remove: args => this.invoke('account_remove', args),
    checkKey: args => this.invoke('account_check_key', args),
    import: args => this.invoke('account_import', args),
    list: args => this.invoke('account_list', args),
    get: args => this.invoke('account_get', args),
  };

  readonly addresses: WalletAddressesApi = {
    current: args => this.invoke('address_current', args),
    next: args => this.invoke('address_next', args),
    list: args => this.invoke('address_list', args),
    at: args => this.invoke('address_at', args),
  };

  /** Amounts and scan revision come from one native database snapshot. */
  getBalance(args: { accountId: string; confirmations: ConfirmationsPolicy } & Op): Promise<WalletBalance> {
    return this.invoke('account_balance', args);
  }

  listNotes(args: Parameters<WalletClient['listNotes']>[0]): Promise<NotePage> {
    return this.invoke('wallet_notes', args);
  }

  listUtxos(args: Parameters<WalletClient['listUtxos']>[0]): Promise<UtxoPage> {
    return this.invoke('wallet_utxos', args);
  }

  getHistory(args: Parameters<WalletClient['getHistory']>[0]): Promise<HistoryPage> {
    return this.invoke('wallet_history', args);
  }

  getTransaction(args: Parameters<WalletClient['getTransaction']>[0]): Promise<WalletTransaction | null> {
    return this.invoke('wallet_transaction', args);
  }

  readonly scan = {
    state: (args?: Op) => this.invoke<ScanState>('scan_state', args),
    block: (args: { height: number } & Op) => this.invoke<ScanBlock>('scan_block_hash', args),
    rewind: (args: ScanRewind & Op) => this.invoke<ScanBlock>('scan_rewind', args),
    complete: (args: ScanCompletion & Op) => this.invoke<{ readonly revision: string }>('scan_complete', args),
    plan: (args: { target: ScanTarget } & Op) => this.invoke<ScanPlan>('scan_plan', args),
    ingest: (args: ScanBatch & Op) => this.invoke<ScanReceipt>('scan_ingest_batch', args),
  };

  readonly enhancement = {
    requests: (args?: Op) => this.invoke<EnhancementRequests>('enhancement_requests', args),
    apply: (args: EnhancementApply & Op) => this.invoke<{ revision: string }>('enhancement_apply', args),
  };

  /** Drain accepted calls, close once, and reject new admission immediately.
   * The enclosing host must still destroy the dedicated worker, even on failure.
   */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.owner.close(this.generation, this.instance));
    return this.closing;
  }
}
