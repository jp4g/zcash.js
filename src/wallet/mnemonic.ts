import type { Op } from '../../docs/api/public-api.js';
import { failure, isZcashError } from '../errors.js';
import { snapshot } from '../clients/owned-plumbing.js';
import type { openWalletRuntime } from '../runtime/wallet.js';
import type { MnemonicAccountInput, NativeCreatedAccount, NativeSignerAuthorization } from './session.js';

type Wallet = Awaited<ReturnType<typeof openWalletRuntime>>;

/** Private composition until real native authorization completes MemorySigner. */
export async function createMnemonicAccount(wallet: Wallet, kind: 'create' | 'import', args: MnemonicAccountInput & Op) {
  // This lease precedes even dispatch admission; a committed account can outlive its wallet.
  const releaseOwner = wallet.owner.retain();
  const releaseToken = async (token: number) => {
    try { await wallet.owner.signers.release({token}); }
    catch (error) {
      // A known stale token is already gone; any other failed cleanup must end its owner.
      if (!isZcashError(error) || error.code !== 'STALE_HANDLE') await wallet.owner.invalidate().catch(() => {});
      throw error;
    }
  };
  let created: NativeCreatedAccount;
  try {
    created = await wallet.session.mnemonic[kind](args);
  } catch (error) {
    const receipt = error && typeof error === 'object' ? wallet.session.completion(error) : undefined;
    try {
      if (receipt?.completion === 'committed' && receipt.value) {
        const value = receipt.value as NativeCreatedAccount;
        await releaseToken(value.signerToken);
      }
    } catch { /* Cleanup either released the token or invalidated its owner; preserve the receipt. */ }
    finally { await releaseOwner().catch(() => {}); }
    // The host keeps the committed account receipt; no undelivered signer remains live.
    throw error;
  }
  const token = created.signerToken;
  let disposing: Promise<void> | undefined;
  const check = () => { if (disposing) throw failure('CLOSED','account','none','Signer authority is disposed.'); wallet.owner.check(); };
  const sameOwner = (other: Wallet) => {
    check();
    if (other.owner.identity !== wallet.owner.identity) throw failure('SIGNER_CAPABILITY_MISMATCH','account','configure','Signer belongs to another native owner.');
  };
  const authority = Object.freeze({
    check,
    capabilities(args: Op = {}) { check(); return wallet.owner.signers.capabilities({...snapshot(args,['signal']),token}); },
    authorize(args: Omit<NativeSignerAuthorization, 'token'> & Op) { check(); return wallet.owner.signers.authorize({...snapshot(args,['format','parameters','genesis','height','branch','bytes','maximum','signal']),token}); },
    describe(args: Op = {}) { check(); return wallet.owner.signers.describe({...snapshot(args,['signal']),token}); },
    bind(other: Wallet, accountId: string, args: Op = {}) { sameOwner(other); return other.session.signers.bind({...snapshot(args,['signal']),token,accountId}); },
    unbind(other: Wallet, accountId: string) { sameOwner(other); return other.session.signers.unbind({token,accountId}); },
    dispose() { return disposing ??= releaseToken(token).finally(releaseOwner); },
  });
  return Object.freeze({account:created.account,authority});
}
