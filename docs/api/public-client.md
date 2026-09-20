# Query the public chain

Use a public client when you need chain data without opening a wallet. Construct it as shown in [installation](installation.md).

## Read a transaction

```ts
import { txId } from '@jp4g/zcash.js';
import type { PublicClient } from '@jp4g/zcash.js';

export async function inspectTransaction(client: PublicClient, displayTxid: string) {
  const id = txId(displayTxid);
  const transaction = await client.getTransaction({ txid: id });
  const observation = await client.getTransactionStatus({ txid: id });
  return { transaction, observation };
}
```

A transaction contains owned raw bytes and an observation. Status can be `notSeen`, `mempool`, `mined`, `offMainChain`, or `unknown`. `notSeen` means this source has not found it; it does not prove that no other source has it. Inclusion and confirmation fields can be `null` when the source cannot establish them.

## Watch or wait for confirmation

```ts
import { txId } from '@jp4g/zcash.js';
import type { PublicClient, TransactionObservation } from '@jp4g/zcash.js';

export async function watchTransaction(
  client: PublicClient,
  displayTxid: string,
  signal: AbortSignal,
  render: (state: TransactionObservation) => void,
) {
  for await (const state of client.watchTransaction({ txid: txId(displayTxid), signal })) {
    render(state);
    if (state.state === 'mined' && (state.inclusion?.confirmations ?? 0) >= 3) break;
  }
}

export async function waitForPayment(client: PublicClient, displayTxid: string) {
  return client.waitForTransaction({
    txid: txId(displayTxid), confirmations: 3, timeoutMs: 120_000,
  });
}
```

Breaking a `for await` loop closes the iterator. Keep consuming updates: a full observation buffer rejects instead of silently discarding changes. Reorganizations can change a previous inclusion; do not treat the first `mined` observation as permanent.

## Other reads and raw submission

`getBlock` and `getBlockHeader` accept exactly one of `{ height }` or `{ hash }`. `getUtxos({ addresses })` queries a nonempty list of transparent addresses. Tree state and subtree methods depend on server support.

`broadcastTransaction({ bytes })` submits one already-built transaction. Its outcome is `acknowledged`, `rejected`, or `unknown`. A timeout after dispatch can be `unknown`; acknowledgement is not confirmation. This API has no wallet operation journal. For wallet-created payments, use [send and recovery](send-shield.md) so exact transaction bytes and attempts are retained.
