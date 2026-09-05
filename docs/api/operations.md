# Pending payments and operation recovery

::: tip Proposed Contract
An operation exists before zero, one or many txids. Durable storage commits immutable transaction bytes before dispatch. Recovery reuses those bytes and retains every attempt.
:::

## Read payment state

`PendingPayment.snapshot()` is local. `events` yields bounded `PaymentState` updates. State contains operation/account IDs, revision, durable/ephemeral mode, missing material, and per-step dependencies, txid, exact-byte SHA-256, attempts, inclusion, observation, expiry and blocking steps.

The phase labels `proposed`, `awaitingAuthorization`, `building`, `ready`, `observing`, `needsAttention`, `complete` are journal presentation, not a fixed proof/sign pipeline. Submission, mining, expiry and scan state are separate. An acknowledged attempt is not mined; unknown inclusion is not mempool presence.

## Dispatch and ambiguity

Commit `attempt-start` before dispatch, then append its result. A crash between that commit and a durable result is unknown, even if the request never reached the server. Timeout after dispatch cannot establish failure. Parents dispatch before children; rejected/ambiguous parents block dependent dispatch pending reconciliation.

`broadcast()` reconciles first, skips canonically mined steps by default and sends only the immutable stored bytes. No reselection, new proof/signature, fee/expiry edit or implicit provider switch is allowed on retry. A txid alone is insufficient to identify authorization bytes; the exact-byte digest is retained too.

## Wait and resume

`wait` defaults to one positive confirmation and no timeout. Zero confirmations rejects; use `snapshot` for immediate state. Every required step must have coherent inclusion at the threshold. Reorg normally continues observation. Timeout/abort retains state and locks; a known blocked/terminal outcome throws a typed error with partial outcomes. A previously resolved result remains historical evidence.

<<< ./examples/recovery.ts

`operations.list` is wallet-wide unless filtered by account; paginate and let the application identify the intended operation. `get` returns state or null. `resume` only rehydrates behavior: no proposal, signer prompt, signing or broadcast. Missing finalized bytes produce `NOT_FINALIZED` for wait/broadcast; inspect `missing` and explicitly continue a supported role, or surface recovery work. There is no public proposal-restore method to invent in an example.

Same idempotency key plus same canonical intent finds existing work; a different intent yields `IDEMPOTENCY_CONFLICT`. A lost send response without a key requires journal inspection, not repeating the amount. Signers, closures and heap handles are never persisted. Reopening the same durable database does not require a signer to observe/rebroadcast stored finalized bytes.

::: warning Unimplemented
The operation/artifact/outbox journal is new Rust integration work. Atomic composition and crash recovery need F6 proof. Explicit memory storage reports `ephemeral` and cannot promise restart recovery.
:::
