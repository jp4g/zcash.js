# Errors, cancellation and disposal

::: tip Proposed Contract
Use `isZcashError` to narrow errors. `retryable` is a diagnostic hint, never permission to repeat a spend or trigger another signer prompt.
:::

<<< ./examples/errors.ts

## Read the error contract

`ErrorInfo` includes stable code, stage, retryability, recovery direction and sanitized message. `ZcashError` may retain operation ID, latest payment state, sync status or transaction observation. Those attachments are sensitive and must never be automatically logged.

Validation/account/address failures direct input correction. Network/protocol/capability failures require configuration or qualification. Freshness errors require sync; stale review requires a newly reviewed proposal after reconciling earlier work. Submission ambiguity directs exact-byte reconciliation. Storage/runtime faults may require reopen or restore. The complete `ErrorCode`, stage and recovery unions are in the [declaration reference](public-api.md).

A rejected broadcast report is normally an outcome record, while known blocked/terminal payment observation may throw. A successful absent query differs from transport failure. Catching every error and returning null would destroy these distinctions.

## Cancellation boundaries

Omitted `signal` means no caller cancellation. Aborting a fetch or queued job releases its resources where supported. Scan cancellation returns stopped status at a safe commit boundary. Running crypto is cooperative and may finish before cancellation is acknowledged; a worker message cannot interrupt an occupied synchronous export. Do not terminate the wallet worker as an ordinary cancel action.

After committed work, return/preserve its state rather than claiming rollback. Wait timeout/abort ends observation, never an on-chain transaction or its locks. Breaking an iterator releases the subscription/stream; it does not cancel unrelated shared work. Buffer overflow raises an error rather than dropping updates.

## Ownership and teardown

Call `wallet.close()` in `finally`. Dispose caller-owned `MemorySigner`, `SignerBinding`, `ViewKeyHandle` and standalone `PcztHandle` resources explicitly. Public close/dispose are idempotent; stale/wrong-instance handle use fails. Proposal/associated artifact lifetimes follow the wallet; there is no public dispose method on them. Public/light clients have no declared `close` or `dispose` method.

Wallet close detaches, flushes and invalidates its resources; injected clients and signers remain caller-owned. On worker failure, invalidate the affected domain and reopen durable state. Opening reconciles all operations; it never replays construction/signing. Only explicit startup policy plus stored consent can permit bounded identical-byte retries. Startup network failures appear in `wallet.recovery` while local recovery failures reject opening. Finalizers are leak backstops, not lifecycle correctness.
