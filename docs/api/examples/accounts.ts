import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
declare const wallet: Contract.WalletClient;
declare const mnemonic: Contract.SecretInput; // supplied by application BIP39 tooling
declare const birthday: Contract.Birthday;
declare const recoveredIndex: number;
declare const ufvk: string; // synthetic test fixture, never a real key

// Alternative onboarding paths for distinct fixture accounts, not duplicate imports.
export async function recoverMnemonic() {
  return wallet.accounts.import({
    mnemonic, accountIndex: sdk.accountIndex(recoveredIndex), birthday,
  }); // caller owns and must dispose the returned signer
}
export async function importViewing() {
  return wallet.accounts.import({ viewingKey: ufvk, birthday, viewOnly: false });
}
export async function createNew() {
  const synced = await wallet.sync(); // explicit network work, including for an empty wallet
  if (!synced.targetReached) return; // stopped before establishing current local state
  return wallet.accounts.create({ mnemonic }); // local state only; may fail SYNC_REQUIRED
}
