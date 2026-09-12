import { failure, invalidArgument } from '../errors.js';
import type { AccountRecord, AccountsApi, ConfirmationsPolicy, Op, ViewingImport, WalletAddressesApi, WalletBalance } from '../../docs/api/public-api.js';

/** Accepted, already initialized VIEW owner. Construct and consume in its worker. */
export interface InitializedViews {
  readonly generation: number;
  readonly instance: string;
  call(generation: number, instance: string, operation: string, args: object): unknown;
  close(generation: number, instance: string): void;
}

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
        // Check at dispatch, so queued input cannot bypass the fullScan boundary.
        if (operation === 'account_import') {
          let fullScan = false;
          try { fullScan = Object.getOwnPropertyDescriptor(args, 'birthday')?.value === 'fullScan'; } catch { /* Uninspectable input is invalid. */ }
          if (!fullScan) {
            const error = invalidArgument();
            this.completions.set(error, 'none');
            throw error;
          }
        }
        // The accepted owner supplies the frozen API DTOs, including bigint indices.
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

  readonly accounts: Pick<AccountsApi, 'list' | 'get'> & {
    import(args: ViewingImport & { readonly birthday: 'fullScan' }): Promise<AccountRecord>;
  } = {
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

  /** Native accounting only; scan/revision is supplied by the eventual sync owner. */
  getBalance(args: { accountId: string; confirmations: ConfirmationsPolicy } & Op): Promise<Pick<WalletBalance, 'accountId' | 'amounts'>> {
    return this.invoke('account_balance', args);
  }

  /** Drain accepted calls, close once, and reject new admission immediately.
   * The enclosing host must still destroy the dedicated worker, even on failure.
   */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.owner.close(this.generation, this.instance));
    return this.closing;
  }
}
