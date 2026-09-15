# Send and shield funds

Before sending, sync the account, attach a ready signer (or pass one explicitly), configure a transaction policy and proving assets, and provide a broadcaster. The account must actually be funded.

## Send a payment

```ts
import { parseZec } from 'zcash.js';
import type { AccountRecord, WalletClient } from 'zcash.js';

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

For interactive approval, use [reviewed proposals](proposals.md) so the user approves the exact proposal before execution.

## Shield transparent funds

```ts
import { parseZec } from 'zcash.js';
import type { AccountRecord, WalletClient } from 'zcash.js';

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
