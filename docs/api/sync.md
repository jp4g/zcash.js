# Synchronize a wallet

Sync downloads and scans data for the wallet's accounts. It is explicit: opening a wallet or consuming a light-client stream does not start a general scan.

```ts
import type { WalletClient } from 'zcash.js';

export async function syncWallet(wallet: WalletClient, signal: AbortSignal) {
  const status = await wallet.sync({ signal });
  if (!status.targetReached) return { ready: false, status };
  return { ready: true, status };
}
```

Without a target, the wallet captures a finite target from its light source. You can pass `{ target: { height, hash } }` for a specific chain point. Check `targetReached` before treating a scan as complete. Cancellation can return a stopped status; a resolved promise alone is not a completion claim.

## Follow scan progress

```ts
import type { SyncStatus, WalletClient } from 'zcash.js';

export async function followSync(
  wallet: WalletClient, signal: AbortSignal, render: (status: SyncStatus) => void,
) {
  for await (const status of wallet.watchSync({ signal })) {
    render(status);
    if (status.targetReached) break;
  }
}
```

`watchSync` starts lazily on the first read. Subscribers share background sync; keep consuming to avoid buffer overflow. Returning the last subscriber stops its background watcher. It does not cancel a separately started finite `sync()` operation.

`getSyncStatus()` reads local status without starting network work. Use `scan.fullyScannedHeight`, `scan.scanComplete`, and enhancement progress rather than treating `maxScannedHeight` as complete coverage. A source error, reorganization, or unresolved transaction enhancement can leave useful partial progress.

Only one finite sync runs at a time. For a UI, keep a controller for the active task, cancel it when the user leaves, and close any iterator you create manually.
