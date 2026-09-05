# Ordinary send and shield

::: tip Proposed Contract
A send needs a synchronized spend-capable account, explicit transaction policy, local proving material where required, a matching supplied/attached signer and an explicit broadcaster.
:::

<<< ./examples/payments.ts

## Send intent

Use one `to`/`amount`/optional `memo`, or a nonempty `payments` array, never both. Always select `accountId`. Optional `maxFee` is an application ceiling; omission does not waive the standard fee. An idempotency key identifies one canonical intent within a wallet/network, not a transaction ID.

`TransactionPolicy` specifies spend pools, owned transparent permission, shielded change pool, ZIP317 standard fees, confirmation rules, expiry offset or disabled expiry, lock lifetime, shielding threshold and freshness. `require-synced` rejects insufficient freshness; `catch-up` permits bounded sync under the explicit timeout. Query and transaction confirmations must match.

Rust selects inputs and computes change/fees. Unsupported scripts, maturity, pool/context, missing authority, insufficient funds, freshness and fee limits fail explicitly. The API has no send-max helper, arbitrary caller-selected input list or custom fee algorithm.

## Shield owned transparent funds

`shield` sends eligible owned transparent funds to a shielded pool. Omitted `fromAddresses` selects eligible owned addresses, omitted `toPool` uses configured change pool, and omitted `threshold` uses the configured shielding threshold. `NOTHING_TO_SHIELD` is distinct from a successful empty payment. Shielding does not erase prior transparent history or bypass maturity/confirmation rules.

## Return point

`send` and `shield` return `PendingPayment` after creation/storage and the first ordered submission pass, including unknown or rejected attempts. They do not wait for mining. Inspect per-step state; call `wait` for checked inclusion of every required transaction. An exception after operation allocation can retain the operation ID and partial state.

For prior review use [immutable proposals](proposals.md). For interruptions use [operation recovery](operations.md); repeating the same amount is not a recovery strategy.
