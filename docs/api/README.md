# Proposed v1 API book

::: warning Partial private implementation
The private SDK now exposes public, light and wallet clients, with scoped synthetic Node filesystem and Firefox OPFS qualification. See [local installation](installation.md) and the [qualification requirements](host-contract.md). This book preserves the frozen [issue #1](https://github.com/jp4g/zcash.js/issues/1) contract; full acceptance remains incomplete, including #97, #98, #102 and healthy threading. No published package is claimed. Embedded examples remain compile-only contracts.
:::

Start with the [end-to-end walkthrough](walkthrough.md), then follow the chapters in sidebar order. A stakeholder should be able to explain who owns the account, what has actually been submitted, and what survives a restart before reviewing the implementation boundary.

## Status and scope

V1 targets **transparent, Sapling and Ironwood**, with one TypeScript product for Node and browsers. Transparent receipt/spending/shielding remains subject to owned scripts, maturity and recovery constraints. Sapling and Ironwood each require scanning, transaction and local proving qualification. Ironwood uses an Orchard receiver encoding; legacy Orchard is not a supported `Pool`. Historical legacy accounting remains visible.

The public client queries chain data, the light client supplies lightwallet data, and the wallet client owns local state. Each constructs independently; optional composition holds those same instances. No default network, endpoint, account, signer, provider failover or project infrastructure is supplied.

Excluded from v1: Sprout and legacy Orchard spending/automatic migration; mnemonic/seed generation; raw spending-key export; persistent secret custody; UIVK wallet import and less-common key imports; concrete Ledger support; remote proving; multisig; remote-wallet RPC. No WebZjs API or snapshot compatibility, full-node consensus validator, release topology or license is established.

## How to read the book

- **Proposed Contract** identifies behavior required of a future implementation.
- **Compile-only contract** identifies examples or declarations; typechecking does not establish runtime support.
- **Unimplemented** identifies missing product work, not every exported SDK method.
- **Requires Qualification** identifies claims that need functional evidence before support can be advertised.

The [declarations](public-api.md) remain the exact signature baseline. [D01–D26](../planning/decision-log.md) govern settled scope; this book preserves them. D26 amends opening to recover all recorded operations without a separately persisted ID, under the [recovery policy](operations.md). Research and historical candidate snippets are secondary evidence, not alternate current APIs. The [host contract](host-contract.md) adds a versioned review boundary. Issue #1 freezes the authenticated `WasmArtifact` manifest declaration and clarifies that zero-birthday account creation uses coherent local database state after explicit sync, failing `SYNC_REQUIRED` before mutation when unavailable/stale.

## Review route

1. [Walk through a wallet lifecycle](walkthrough.md), including interruption and restart.
2. Read [principles](principles.md) and [installation notation](installation.md), then networks, clients, accounts and queries.
3. Review sending, immutable proposals, signer roles and recovery together.
4. Inspect the [full API reference](reference.md) and [Rust/WASM mapping](host-mapping.md).

::: info Requires Qualification
G0–G6 design/implementation-readiness gates and F1–F8 functional gates are not marked complete by this book. TypeScript and site builds establish documentation consistency only. Storage durability, scanner liveness, protocol interoperability, proving and device support remain unvalidated.
:::
