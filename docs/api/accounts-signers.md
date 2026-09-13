# Accounts, recovery and signer boundaries

::: tip Proposed Contract
Create wallet records separately from custody. Applications obtain and back up mnemonics with reputable BIP39 tooling; zcash.js only validates supplied mnemonic bytes and derives authority.
:::

## Choose the onboarding path

`accounts.create({ mnemonic })` means a **new account**. It has no birthday argument. After an explicit `wallet.sync()`, creation uses only the wallet database's current locally verified chain/tree state. It makes no hidden network request and never syncs implicitly. Unavailable or stale local state fails `SYNC_REQUIRED` before any account/index/database mutation or signer publication. Zakura transactionally chooses the next seed-relative index. It returns `{ account, signer }`; the memory signer is caller-owned and unattached. Do not use creation to recover an old account.

“Current” is relative to the wallet's latest locally known verified sync target, not a claim about an unqueried remote tip. A usable snapshot has a completed sync target, matching network/height/block hash and complete required pool frontiers committed at that target. It is stale if a newer locally known target is pending, coverage/tree state is incomplete, or a rewind/reorg has invalidated it. Wall-clock passage alone is not a remote-tip check. Explicit sync must establish this state even for an empty wallet; opening a database alone does not. The serialized wallet owner checks freshness and derives the internal `AccountBirthday` from one coherent snapshot (first scan height = prior-state height + 1), then invokes Zakura `create_account` without allowing an intervening scan/rewind to invalidate the snapshot. Missing state never falls back to genesis, an arbitrary checkpoint or a remote birthday lookup.

Mnemonic `accounts.import` requires `accountIndex` plus a validated `Birthday` or `'fullScan'`. Birthday identifies the first scanned block and prior-block tree state; `recoverUntilExclusive` is exclusive. `resolveBirthday` obtains that state from a light client for an explicit first height. Recovery must never silently start at today's tip.

All checksum-valid standard BIP39 word counts (12/15/18/21/24) are accepted. Mnemonic/passphrase inputs are UTF-8 bytes with required normalization. Omitted passphrase means empty; another passphrase derives another seed, not a detectable wrong-password error. Names default to null. Mnemonic creation/import uses all supported pools and accepts no `enabledPools` option. Transaction spend-pool policy and address receiver selection remain independent. UFVK import retains its optional `enabledPools` selection; missing required viewing authority rejects.

<<< ./examples/accounts.ts

## UFVK tracking is not signing

UFVK `accounts.import({ viewingKey, birthday })` returns an `AccountRecord`. Default `viewOnly: false` retains spend-supporting state without storing or producing a signer. `true` chooses tracking-only state that may require reconstruction/rescan before spending. Identical imports may collide; reimport is not an idempotent attachment or a guaranteed upgrade.

`attachSigner` verifies actual account/key correspondence and returns a disposable `SignerBinding` with `ready` or `recovery-required`. Attachment cannot upgrade true view-only tracking. `detachSigner` removes the binding without disposing caller authority. `accounts.remove` requires the literal local-history acknowledgment and rejects unresolved operations/locks; deletion does not erase on-chain funds.

## Standalone viewing authority

`accountFromViewingKey` parses UFVK or UIVK into an opaque descriptor for standalone viewing/address work with explicit enabled pools. `viewing.toIncoming` reduces authority; `viewing.export` requires `acknowledge: 'discloses-viewing-authority'`. Dispose descriptor viewing handles. UIVK cannot determine full spentness and is excluded from wallet import. No raw spending-key export or persistent secret vault exists.

`Signer.getCapabilities`, `getAccount` and `authorize` form the generic adapter boundary. Capability tuples negotiate network/pool/branch/transaction/circuit/PCZT versions, review mode and required field profiles. Account IDs and derivation metadata are routing hints; they never prove key correspondence. See [signing routes](signing.md) for disclosure and return validation.
