# Wallet creation, runtime and storage

::: tip Proposed Contract
`createWalletClient(WalletOptions)` initializes a dedicated worker and opens/migrates one wallet database. It automatically reconciles all database operations, without importing a mnemonic or starting general synchronization.
:::

## Explicit configuration

Always supply `network`, `runtime`, `storage`, `confirmations` and `observation`. Optional `light` enables explicit scanning and the default bounded startup observation pass; omission means local-only recovery. Optional `broadcaster` enables submission; omission means no submission route even with `light`. Optional `transactionPolicy` enables planning/send; its confirmation settings must match query accounting. Optional `proving` supplies local proof assets; a UFVK cannot substitute for proving authority. Optional `recovery` selects offline or bounded online opening and explicit opt-in exact-byte rebroadcast. It never enables unfinished signing/proving work. See the [recovery policy and completion report](operations.md#startup-network-policy-and-completion).

Runtime configuration supplies a baseline `WasmArtifact` with `manifestUrl` and expected `manifestSha256`, plus baseline or prefer-threaded selection. Each separately pinned canonical `ArtifactManifest` authenticates contract/ABI/schema revisions, build/dependency-graph identity, runtime mode and the complete executable asset set through typed `ArtifactFile` URLs, SHA-256 digests, lengths and kinds/media types. The loader verifies the manifest first, checks mode/versions, then verifies every executable asset before import/worker start and before authority/storage. H1 negotiation uses those verified identities. See [H1.1](host-contract.md#h1-1-negotiation-before-authority) for canonical encoding, credential-free URLs, confined relative asset paths and verified-byte execution.

<<< ./examples/runtime.ts

Set memory, queued byte/job, scan-batch and PCZT bounds explicitly. These are admission limits, not measured performance recommendations.

## Storage ownership

- `node-filesystem` uses an application path through a worker-local filesystem VFS.
- `browser-opfs` uses an application storage name through a dedicated-worker OPFS VFS.
- `memory` is explicitly ephemeral and cannot recover operations after restart.

All three use bundled SQLite **inside the wallet WASM instance**. There is no injected native SQLite connection. One owner serializes reads, scans, account/address changes, proposals, locks and the outbox. A second process/tab must coordinate ownership or receive `STORAGE_BUSY`.

## Open and close

Open acquires ownership, checks database/network/schema compatibility, migrates and reconciles every operation using bounded internal pagination before returning. The optional finite network pass follows local completion; network/dispatch timeout or failure returns a usable local wallet with sanitized `wallet.recovery.lastError`. Observation is incomplete only while observation candidates remain deferred; a later broadcaster failure preserves completed observation counts/status. Local integrity/recovery failure rejects instead of hiding records. No separately saved operation ID is required. If migration requires authority absent from `WalletOptions`, report `MIGRATION_REQUIRED`; do not invent a mnemonic-on-open option. Failed durable opening must not silently create memory storage.

`close()` is idempotent: stop admission, finish/stop work at safe boundaries, flush and close storage, detach bindings and invalidate wallet-dependent handles. Injected clients/signers remain caller-owned. Dispose returned memory signers explicitly after their final use. Closing does not undo submitted payments.

::: info Requires Qualification
Both VFS durability paths have scoped [Node/Firefox qualification](../planning/wallet-payments-qualification.md), including [current OPFS fault recovery](installation.md#current-opfs-fault-recovery-116). Storage holds sensitive viewing/history data; encrypted-at-rest protection is not established.
:::

## Backup and restore scope

The public API has no database backup, export or restore operation. The restore clauses in the recovery matrix apply to a supported explicit restore workflow; none is offered by this version. They do not require adding a new API or treating an ordinary reopen as a restore test. Mnemonic account import and rescan recover account authority/history, not a previous database's operation records or retry budgets.

An application-controlled filesystem/OPFS copy or rollback is outside SDK restore guarantees. Opening the same bytes cannot reveal that they came from an older snapshot or another copy. Stored consent and counters may therefore be replayed; there is no cross-copy retry-budget or automatic invalidation guarantee. Applications handling such copies should start with offline recovery and review the saved state. Offline opening prevents recovery network activity; it does not erase or renew consent.
