# Wallet creation, runtime and storage

::: tip Proposed Contract
`createWalletClient(WalletOptions)` initializes a dedicated worker and opens/migrates one wallet database. It does not import a mnemonic or start synchronization.
:::

## Explicit configuration

Always supply `network`, `runtime`, `storage`, `confirmations` and `observation`. Optional `light` enables network scanning; omission means offline. Optional `broadcaster` enables submission; omission means no submission route even with `light`. Optional `transactionPolicy` enables planning/send; its confirmation settings must match query accounting. Optional `proving` supplies local proof assets; a UFVK cannot substitute for proving authority.

Runtime configuration supplies a baseline `WasmArtifact` with `manifestUrl` and expected `manifestSha256`, plus baseline or prefer-threaded selection. Each separately pinned canonical `ArtifactManifest` authenticates contract/ABI/schema revisions, build/dependency-graph identity, runtime mode and the complete executable asset set through typed `ArtifactFile` URLs, SHA-256 digests, lengths and kinds/media types. The loader verifies the manifest first, checks mode/versions, then verifies every executable asset before import/worker start and before authority/storage. H1 negotiation uses those verified identities. See [H1.1](host-contract.md#h1-1-negotiation-before-authority) for canonical encoding, credential-free URLs, confined relative asset paths and verified-byte execution.

<<< ./examples/runtime.ts

Set memory, queued byte/job, scan-batch and PCZT bounds explicitly. These are admission limits, not measured performance recommendations.

## Storage ownership

- `node-filesystem` uses an application path through a worker-local filesystem VFS.
- `browser-opfs` uses an application storage name through a dedicated-worker OPFS VFS.
- `memory` is explicitly ephemeral and cannot recover operations after restart.

All three use bundled SQLite **inside the wallet WASM instance**. There is no injected native SQLite connection. One owner serializes reads, scans, account/address changes, proposals, locks and the outbox. A second process/tab must coordinate ownership or receive `STORAGE_BUSY`.

## Open and close

Open acquires ownership, checks database/network/schema compatibility, migrates and recovers interrupted journal state before returning. If migration requires authority absent from `WalletOptions`, report `MIGRATION_REQUIRED`; do not invent a mnemonic-on-open option. Failed durable opening must not silently create memory storage.

`close()` is idempotent: stop admission, finish/stop work at safe boundaries, flush and close storage, detach bindings and invalidate wallet-dependent handles. Injected clients/signers remain caller-owned. Dispose returned memory signers explicitly after their final use. Closing does not undo submitted payments.

::: info Requires Qualification
Both VFS durability paths, migration rollback, single-writer exclusion and crash recovery remain F3/F6 gates. Storage holds sensitive viewing/history data; encrypted-at-rest protection is not established. There is no public backup/export-database API in the declarations.
:::
