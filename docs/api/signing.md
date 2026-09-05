# Local signing and external single-step PCZT

::: tip Proposed Contract
There are two execution routes. They share reviewed effects but have different backend constraints. `build/prove/sign/finalize` are PCZT roles only.
:::

## Fused local execution

The opaque USK held by a `MemorySigner` enables Zakura's `create_proposed_transactions` path. It composes authorization, proving, creation and storage and can support actual multi-step dependencies. There is no universal detached local builder or resumable local proof/sign stage exposed by the API. Spending-key bytes never leave through an export method.

## External authority

A custom signer uses supported **single-step** PCZT. Negotiate capabilities before disclosure: network, pool, branch ID, transaction/circuit/PCZT versions, proof-state prerequisite, required profile fields, size and review mode. Reject multi-step plans with `PCZT_MULTI_STEP_UNSUPPORTED` before handing data to the adapter; retain allocated operation identity.

`wallet.pczt.export` accepts a proposal or associated artifact, retains the full copy and exports a minimal signer view. Serialization is not approval. `wallet.pczt.import` requires a known operation, validates effects and signatures, combines with retained full data and persists a new artifact. It may accept partial authorization; it does not enroll unknown work.

<<< ./examples/pczt.ts

This example starts from an associated artifact whose proof state has already met the negotiated role prerequisites. The application exchange represents a reviewed device/offline transport; it is not an SDK method. A production adapter must implement `Signer.authorize(SigningRequest)` and match returned request ID, capability revision, review commitment, account keys and authorized inputs.

## Role order and finalization

`build` constructs a single-step PCZT. `prove` and `sign` each produce a new associated artifact. Legal ordering depends on qualified pool/version roles and available proving authority; neither sign-first nor prove-first is universal. Violations return `ROLE_PRECONDITION`. `finalize` verifies completeness, extracts/stores exact transaction bytes and creates the outbox, with **no network dispatch**. Call pending/wallet broadcast explicitly afterward.

Standalone `pczt.parse/serialize/inspect/combine/redact` operate on disposable handles with explicit context and bounds. They confer no wallet association. Redaction accepts only qualified versioned profiles. Unknown profile fields reject.

::: info Requires Qualification
Generic adapter seams are in v1; no Ledger device/app/firmware or Ironwood hardware support is claimed. Local assets require pinned digest/length verification before parsing and on cache retrieval. Only parameter/circuit assets go to `loadAsset`, never wallet witnesses. Remote proving remains deferred.
:::
