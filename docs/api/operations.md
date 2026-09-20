# Payment operations and restart recovery

A payment is a recorded operation, potentially containing multiple transaction steps. The database retains its state, exact finalized bytes, and submission attempts. A `PendingPayment` is a handle for interacting with that recorded operation.

## Reopen and discover work

Reopen the same database with the same network/runtime configuration. Wallet opening reconciles recorded operations; your application does not need a separate file of operation IDs to discover them.

```ts
import type { PaymentState, WalletClient } from '@jp4g/zcash.js';

export async function discoverPayments(wallet: WalletClient) {
  const operations: PaymentState[] = [];
  let cursor: string | undefined;
  do {
    const page = await wallet.operations.list({ limit: 200, ...(cursor ? { cursor } : {}) });
    operations.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { recovery: wallet.recovery, operations };
}

export async function resumePayment(wallet: WalletClient, operationId: string) {
  const pending = await wallet.operations.resume({ operationId });
  return pending.snapshot();
}
```

`resume` rehydrates behavior; it does not sign or broadcast. Inspect the snapshot before deciding whether to wait, request authorization, or explicitly broadcast retained bytes. An operation ID identifies recorded work, not permission to create a different transaction.

## Choose startup network behavior

| Policy | On open |
| --- | --- |
| `{ mode: 'offline' }` | Reconcile locally; no recovery network pass |
| `{ mode: 'online', timeoutMs: 15000 }` | Reconcile locally, then observe within a bounded pass |
| Online with `rebroadcast` | Additionally allow policy-limited retry of previously dispatched exact bytes |

Omitting the policy selects online recovery with a 15-second deadline when `light` is present, otherwise offline. Online recovery needs a light client; rebroadcast additionally needs a broadcaster.

```ts
import type { RecoveryPolicy } from '@jp4g/zcash.js';

export const recovery: RecoveryPolicy = {
  mode: 'online',
  timeoutMs: 15_000,
  rebroadcast: {
    mode: 'previously-dispatched',
    maxAttempts: 2,
    minIntervalMs: 30_000,
  },
};
```

Automatic recovery does not grant first-dispatch consent, resume unfinished signing/proving, or turn an unbuilt proposal into a payment. Local recovery failure rejects opening. A failed or incomplete network pass can leave a usable local wallet; inspect `wallet.recovery.lastError` and its deferred-operation count.

## Unknown submission and cancellation

A source can accept a transaction while its response is lost. `unknown` is neither success nor rejection. Continue observing the recorded transaction or explicitly retry its retained bytes after reviewing state. Creating a fresh spend can produce a duplicate payment.

Independent source reads can briefly report a mined transaction ahead of their
latest-tip view. The wallet does not accept this as confirmation or absence.
Each observation makes at most three coherent-read attempts, spaced by 250 ms;
`events()` and `wait()` continue at the configured polling interval if the tip
still lags. The last coherent state is retained. Caller cancellation, wallet
closure and the `wait()` timeout remain effective; without a timeout, waiting
can continue until cancelled. Malformed evidence, source identity changes and
stable conflicting hashes still fail. No broadcast occurs in this polling path.

`pending.events()` observes changing state. `pending.wait({ confirmations, timeoutMs, signal })` observes every required step. Aborting or timing out a wait does not cancel a transaction, erase its attempts, or release its locks.

Memory storage has no restart recovery. Copying or rolling back database files is outside the SDK's backup/restore API; there is no public database backup/restore method. A mnemonic recovers account authority and scan history, not a lost database's operation journal.
