# Sync and scan status

::: tip Proposed Contract
`sync()` is a finite run to a verified target, with enhancement included. `watchSync()` shares a continuous runner. `getSyncStatus()` reads local status without network activity.
:::

<<< ./examples/sync.ts

Explicit sync must also establish coherent locally verified chain/tree state for an empty wallet before new-account creation. `accounts.create({ mnemonic })` only consumes that local snapshot; it cannot fetch missing state or sync implicitly. See [creation freshness and `SYNC_REQUIRED`](accounts-signers.md#choose-the-onboarding-path).

## Interpret status honestly

`activity` is idle, running, stopped or failed. `target` identifies the captured chain point. `targetReached` means contiguous committed coverage through that target plus the run's actionable enhancement pass. Required fetch failures reject with retained progress; unsupported target pinning raises `TARGET_PINNING_UNSUPPORTED`. Cancellation returns stopped status at a safe commit boundary.

`scan.fullyScannedHeight` measures contiguous coverage and differs from `maxScannedHeight`. `tipHeight` and `scanComplete` may be null. Revision is an opaque epoch/sequence identity, not height or row number. Catch-up is relative to known tip and account birthday; it is not a proof that all historical data is available.

`enhancement.actionable` and `delayed` represent backend requests for full transactions, statuses and transparent history. New requests can appear as data is scanned. Empty requests do not prove complete history. A server UTXO omission is not evidence of spentness.

::: info Requires Qualification
`workEstimate.scope` is exactly `backend-sapling-orchard-only`. It excludes Ironwood, so it must never become a fabricated overall percentage. A null total or zero denominator is indeterminate. Scanner liveness on baseline and threaded runtimes remains unvalidated.
:::

## Reorgs and observers

Sync reconciles the common ancestor, respects the backend's actual rewind height, updates trees/cache and replays in chain order. Reorgs invalidate relevant proposals/cursors. Missing retained checkpoints/witnesses may require `RECOVERY_REQUIRED`.

Breaking a watch iterator releases that subscription; it does not undo another subscriber's work. Queues and updates are bounded; overflow errors. Observing confirmation and scanning wallet state remain separate activities.
