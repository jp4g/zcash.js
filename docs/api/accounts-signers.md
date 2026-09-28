# Accounts and signers

A stored account tracks wallet history. A signer holds authorization capability. Importing viewing data does not grant spending authority, and opening a database does not reattach a signer.

## Recover an existing mnemonic account

```ts
import { accountIndex } from '@jp4g/zcash.js';
import type { WalletClient } from '@jp4g/zcash.js';

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

## Create a new mnemonic account

Install the same BIP39 implementation used by the runnable testnet example:

```sh
npm install @scure/bip39@2.4.0
```

Use its [mnemonic generator](https://github.com/paulmillr/scure-bip39#usage),
which uses a cryptographically secure random source. Do not supply your own
entropy or use `Math.random()`. Run this once for a new account, not on reopening:

```js
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export async function createNewAccount(wallet, confirmBackup) {
  const synced = await wallet.sync();
  if (!synced.targetReached) throw Error('Sync stopped before reaching its target');
  const phrase = generateMnemonic(wordlist, 256); // 24 English words
  // Your private UI displays the phrase and confirms the user backed it up.
  if (!await confirmBackup(phrase)) throw Error('Mnemonic backup was not confirmed');
  const mnemonic = new TextEncoder().encode(phrase);
  try {
    return await wallet.accounts.create({ mnemonic });
  } finally {
    mnemonic.fill(0);
  }
}
```

`confirmBackup` is an application callback returning a boolean after the user's
backup decision. Never log the phrase or put it in analytics. The SDK takes UTF-8
phrase bytes, not the output of `mnemonicToSeed`. Clearing the byte array does not
erase the immutable JavaScript string or copies held by the UI; release those
references when finished. Persisting a wallet database does not back up its
mnemonic.

The returned `{ account, signer }` has the same ownership as the import example:
attach the signer explicitly, and dispose both the binding and signer when done.
Continue with [receive addresses](receive-addresses.md); creating an account does
not fund it. Use [recovery](#recover-an-existing-mnemonic-account) for an existing
phrase instead of generating a replacement.

## Recover from a known scan height

Choose a height at or before the account's earliest relevant activity. The helper fetches and validates the preceding tree state; it does not discover when the account was first used.

```ts
import { accountIndex, resolveBirthday } from '@jp4g/zcash.js';
import type { LightClient, WalletClient } from '@jp4g/zcash.js';

export async function importAtHeight(
  wallet: WalletClient, light: LightClient, mnemonic: Uint8Array, index: number, firstScanHeight: number,
) {
  const birthday = await resolveBirthday({ light, firstScanHeight });
  return wallet.accounts.import({ mnemonic, accountIndex: accountIndex(index), birthday });
}
```

## Import viewing authority

```ts
import type { WalletClient } from '@jp4g/zcash.js';

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
