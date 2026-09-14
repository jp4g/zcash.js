# Local signing and external single-step PCZT

::: tip Proposed Contract
There are two execution routes. They share reviewed effects but have different backend constraints. `build/prove/sign/finalize` are PCZT roles only.
:::

## Fused local execution

The opaque USK held by a `MemorySigner` enables Zakura's `create_proposed_transactions` path. It composes authorization, proving, creation and storage and can support actual multi-step dependencies. There is no universal detached local builder or resumable local proof/sign stage exposed by the API. Spending-key bytes never leave through an export method.

Zakura's builder selects wallet-owned change/intermediate addresses during this
fused call. There is no separate pre-signing review pause for those exact internal
addresses. Recipient addresses and requested amounts remain unchanged; native
ownership and dependency checks protect internal outputs. Wallet-owned change
remains subject to ordinary confirmation and maturity rules.

## External authority

A custom signer uses supported **single-step** PCZT. Negotiate capabilities before disclosure: network, pool, branch ID, transaction/circuit/PCZT versions, proof-state prerequisite, required profile fields, size and review mode. Reject multi-step plans with `PCZT_MULTI_STEP_UNSUPPORTED` before handing data to the adapter; retain allocated operation identity.

`wallet.pczt.export` accepts a proposal or associated artifact, retains the full copy and exports a minimal signer view. Serialization is not approval. `wallet.pczt.import` requires a known operation, validates effects and signatures, combines with retained full data and persists a new artifact. It may accept partial authorization; it does not enroll unknown work.

Already-finalized transparent inputs from an external signer are currently unsupported: import may retain them, but wallet finalization rejects them with `METHOD_NOT_SUPPORTED`. External adapters should return partial signatures and leave transparent finalization to the wallet. Support for final scripts is deferred in [#102](https://github.com/jp4g/zcash.js/issues/102); ordinary fused local sending is unaffected.

<<< ./examples/pczt.ts

This example starts from an associated artifact whose proof state has already met the negotiated role prerequisites. The application exchange represents a reviewed device/offline transport; it is not an SDK method. A production adapter must implement `Signer.authorize(SigningRequest)` and match returned request ID, capability revision, review commitment, account keys and authorized inputs.

## Role order and finalization

`build` constructs a single-step PCZT. Its `PcztArtifact.outputs` projects exact
native-built addresses, including change, for review before external signing.
Build-time output associations must match the retained proposal's recipients,
amounts, memos and internal ownership constraints. Returned signer data is checked
against those retained built effects; unresolved proposal addresses are not a
permission to redirect payments. `prove` and `sign` each produce a new associated artifact. Legal ordering depends on qualified pool/version roles and available proving authority; neither sign-first nor prove-first is universal. Violations return `ROLE_PRECONDITION`. `finalize` verifies completeness, extracts/stores exact transaction bytes and creates the outbox, with **no network dispatch**. Call pending/wallet broadcast explicitly afterward.

Standalone `pczt.parse/serialize/inspect/combine/redact` operate on disposable handles with explicit context and bounds. They confer no wallet association. Redaction accepts only qualified versioned profiles. Unknown profile fields reject.

::: info Requires Qualification
Generic adapter seams are in v1; no Ledger device/app/firmware or Ironwood hardware support is claimed. Local assets require pinned digest/length verification before parsing and on cache retrieval. Only parameter/circuit assets go to `loadAsset`, never wallet witnesses. Remote proving remains deferred.
:::
