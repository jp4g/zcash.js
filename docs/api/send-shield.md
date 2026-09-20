# Send and shield funds

Before sending, sync the account, attach a ready signer (or pass one explicitly), configure a transaction policy and proving assets, and provide a broadcaster. The account must actually be funded.

## Send a payment

```ts
import { parseZec } from '@jp4g/zcash.js';
import type { AccountRecord, WalletClient } from '@jp4g/zcash.js';

export async function sendPayment(
  wallet: WalletClient, account: AccountRecord, recipient: string, requestId: string,
) {
  const pending = await wallet.send({
    accountId: account.id,
    to: recipient,
    amount: parseZec('0.00125'),
    idempotencyKey: requestId,
  });
  return pending.wait({ confirmations: 3, timeoutMs: 120_000 });
}
```

Assign a stable application request ID to one intended payment. Reuse that ID when recovering the same intent; generate a new ID only for a genuinely new payment. Conflicting reuse fails with `IDEMPOTENCY_CONFLICT`.

`send` plans, executes, and dispatches, then returns a `PendingPayment`. It does not mean the transaction is mined. `wait` returns confirmation for every required transaction step, or rejects with a timeout/error and any available payment state.

With a light client configured, explicit submission refreshes the wallet scan if
the observed chain tip has advanced during proving. It joins an existing scan
or starts one, then obtains fresh payment evidence before native submission
admission. This preserves the finalized transaction bytes; it does not rebuild,
re-sign, or retry a network submission. After three unsuccessful refreshes,
continued tip movement returns `SYNC_REQUIRED`; recover the same operation.
Automatic startup recovery does not initiate this scan refresh.

Keep `watchSync()` running and consume its statuses while waiting for confirmation.
The payment observer retries a changing chain view up to three times, then returns
retryable `OBSERVATION_UNAVAILABLE`. Stable inconsistent evidence remains
`PROTOCOL_MISMATCH`.

For interactive approval, use [reviewed proposals](proposals.md) so the user approves the exact proposal before execution.

## Shield transparent funds

```ts
import { parseZec } from '@jp4g/zcash.js';
import type { AccountRecord, WalletClient } from '@jp4g/zcash.js';

export async function shield(wallet: WalletClient, account: AccountRecord, requestId: string) {
  const pending = await wallet.shield({
    accountId: account.id,
    toPool: 'sapling',
    threshold: parseZec('0.001'),
    idempotencyKey: requestId,
  });
  return pending.snapshot();
}
```

Shielding selects eligible owned transparent funds under your policy. It can fail with `NOTHING_TO_SHIELD`; do not turn that into a successful zero-value payment. Policy and destination pools must match the capabilities of your network/runtime.

## If a send is interrupted

An abort stops local waiting where possible; it cannot undo a committed transaction or a network submission. Inspect `error.operationId` and `error.paymentState`, then use [operations and recovery](operations.md). Do not create a replacement payment merely because the first call timed out.
