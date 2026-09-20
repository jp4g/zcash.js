# Open a wallet

A wallet owns a local database and a worker. It does not generate a mnemonic, choose a server, or automatically attach a signer.

## Choose the network and storage

The package includes its compatible baseline wallet engine and worker assets. Omit `runtime` to use them with the default budgets. The loader verifies the bundled manifest and executable assets before running them. Opening a Node wallet reads installed package files; browser applications serve the assets emitted by their bundler.

An explicit `runtime.baseline` remains an advanced override for a compatible authenticated runtime. Threaded setup has additional requirements described in [platforms](platforms.md). Neither test fixtures nor arbitrary same-profile WASM builds are runtime overrides.

```ts
import { createWalletClient } from '@jp4g/zcash.js';
import type { LightClient, LocalProvingOptions, Network, WalletStorage } from '@jp4g/zcash.js';

export async function openWallet(
  network: Network,
  light: LightClient,
  storage: WalletStorage,
  proving?: LocalProvingOptions,
) {
  const confirmations = { trusted: 3, untrusted: 3, allowZeroConfirmationShielding: false };
  return createWalletClient({
    network, light, broadcaster: light, storage, confirmations,
    observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 16 },
    recovery: { mode: 'offline' },
    transactionPolicy: {
      spendPools: ['transparent', 'sapling', 'ironwood'],
      transparent: 'allow-owned', changePool: 'sapling',
      feeRule: 'zip317-standard', confirmations,
      expiry: { kind: 'offset', blocks: 40 },
      lockExpiryBlocks: 20, shieldingThreshold: 100_000n,
      freshness: { mode: 'require-synced', maxLagBlocks: 0 },
    },
    ...(proving ? { proving } : {}),
  });
}
```

Runtime budgets can be overridden individually through `runtime`; defaults are limits, not measured memory usage or device recommendations. The transaction policy deliberately allows owned transparent inputs; choose pools and change behavior appropriate to your application. Its confirmation policy must match the wallet's query policy.

Choose storage explicitly:

| Environment | Storage |
| --- | --- |
| Node | `{ kind: 'node-filesystem', path: '/absolute/path/wallet.sqlite' }` |
| Browser | `{ kind: 'browser-opfs', name: 'my-wallet' }` |
| Disposable session | `{ kind: 'memory' }` |

Memory storage cannot recover operations after restart. Only one owner should open a database at a time; conflicting ownership can fail with `STORAGE_BUSY`.

## Understand the options

- `light` supplies scanning and startup observation. Opening is not a general sync.
- `broadcaster` supplies submission. Providing only `light` does not enable broadcasting.
- `transactionPolicy` enables proposals and send/shield planning.
- `proving` optionally overrides the bundled local proof material and caching policy. By default the included Sapling parameters load on demand into a wallet-owned memory cache.
- `recovery: { mode: 'offline' }` reconciles recorded operations locally without startup network work. It does not disable later explicit `sync` or `send` calls.

For custom proving-asset storage, provide reviewed `AssetRequirement` entries and a `loadAsset({ requirement, signal })` callback returning their bytes. The SDK checks lengths and digests and supports memory or persistent asset caching. Proof assets are separate from the executable runtime manifest, but included in the package. There is no remote proving service supplied by the SDK.

Always await `wallet.close()` after use. Returned signers remain caller-owned and need their own `dispose()`. See the [walkthrough](walkthrough.md) for complete cleanup.
