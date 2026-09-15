# Accounts and signers

A stored account tracks wallet history. A signer holds authorization capability. Importing viewing data does not grant spending authority, and opening a database does not reattach a signer.

## Recover an existing mnemonic account

```ts
import { accountIndex } from 'zcash.js';
import type { WalletClient } from 'zcash.js';

export async function importAccount(wallet: WalletClient, mnemonic: Uint8Array, index: number) {
  return wallet.accounts.import({
    mnemonic,
    accountIndex: accountIndex(index),
    birthday: 'fullScan',
    name: 'Recovered account',
  });
}
```

Pass UTF-8 mnemonic bytes from your application's BIP39 input flow. The returned `{ account, signer }` contains a database account ID and a memory signer. The signer starts **unattached**. Attach it with `wallet.accounts.attachSigner({ accountId: account.id, signer })`; require `binding.state === 'ready'` before relying on it.

`fullScan` is explicit and can be expensive. A known `Birthday` checkpoint limits recovery work. `resolveBirthday` can resolve a height against a light client; the checkpoint must match the account's network and history.

For a new account, first sync the wallet and check `targetReached`, then call `wallet.accounts.create({ mnemonic })`. Creation uses coherent local chain state and may fail with `SYNC_REQUIRED`. The SDK does not generate or back up the mnemonic for you.

## Recover from a known scan height

Choose a height at or before the account's earliest relevant activity. The helper fetches and validates the preceding tree state; it does not discover when the account was first used.

```ts
import { accountIndex, resolveBirthday } from 'zcash.js';
import type { LightClient, WalletClient } from 'zcash.js';

export async function importAtHeight(
  wallet: WalletClient, light: LightClient, mnemonic: Uint8Array, index: number, firstScanHeight: number,
) {
  const birthday = await resolveBirthday({ light, firstScanHeight });
  return wallet.accounts.import({ mnemonic, accountIndex: accountIndex(index), birthday });
}
```

## Import viewing authority

```ts
import type { WalletClient } from 'zcash.js';

export async function importWatchOnly(wallet: WalletClient, viewingKey: string) {
  return wallet.accounts.import({
    viewingKey, birthday: 'fullScan', viewOnly: true, name: 'Watch only',
  });
}
```

Wallet viewing import uses a full viewing key. Incoming-only viewing is available through standalone [viewing and addresses](receive-addresses.md), not wallet account import. `viewOnly: true` records a tracking-only account; attaching a signer does not upgrade that flag.

## Manage lifetime

`accounts.list()` and `accounts.get({ accountId })` return stored account records. Use their IDs rather than casting arbitrary strings. `accounts.detachSigner` removes a wallet binding; disposing a binding does not dispose the caller's signer. Dispose a returned memory signer when the application is finished with it.

Clear application-owned mnemonic/passphrase byte arrays when no longer needed. Keep these inputs and viewing keys out of logs. Account removal requires `acknowledge: 'deletes-local-history'` and can reject while operations or locks are unresolved; it does not remove funds from the chain.
