# Open a wallet

A wallet owns a local database and a worker. It does not generate a mnemonic, choose a server, or automatically attach a signer.

## Supply the runtime and storage

Wallet execution needs a compatible runtime package in addition to the SDK tarball. Supply its manifest URL and authenticated SHA-256 digest as a `WasmArtifact`. The loader verifies the manifest and executable assets before running them. A random digest, or a digest of a different runtime, will fail.

The repository's test WASM fixtures are not an installable wallet runtime package. Obtain the matching runtime and network parameters for your deployment before attempting this chapter. Use the baseline runtime first; threaded setup has additional requirements described in [platforms](platforms.md).

```ts
import { createWalletClient } from 'zcash.js';
import type { LightClient, LocalProvingOptions, Network, WalletStorage, WasmArtifact } from 'zcash.js';

export async function openWallet(
  network: Network,
  light: LightClient,
  storage: WalletStorage,
  baseline: WasmArtifact,
  proving?: LocalProvingOptions,
) {
  const confirmations = { trusted: 3, untrusted: 3, allowZeroConfirmationShielding: false };
  return createWalletClient({
    network, light, broadcaster: light, storage, confirmations,
    observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 16 },
    recovery: { mode: 'offline' },
    runtime: {
      baseline,
      threading: { mode: 'baseline' },
      maxMemoryBytes: 1024 * 1024 * 1024,
      maxQueuedBytes: 128 * 1024 * 1024,
      maxQueuedJobs: 8,
      scanBatchSize: 16,
      maxPcztBytes: 4 * 1024 * 1024,
    },
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

These limits are example budgets, not measured minimums or performance recommendations. Match your runtime, workload, and device capacity. The transaction policy deliberately allows owned transparent inputs; choose pools and change behavior appropriate to your application. Its confirmation policy must match the wallet's query policy.

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
- `proving` supplies local proof material. Without it, reads still work, but a flow needing proofs can fail with `PROVING_MATERIAL_REQUIRED`.
- `recovery: { mode: 'offline' }` reconciles recorded operations locally without startup network work. It does not disable later explicit `sync` or `send` calls.

For proving, provide reviewed `AssetRequirement` entries and a `loadAsset({ requirement, signal })` callback returning their bytes. The SDK checks lengths and digests and supports memory or persistent asset caching. Proof assets are separate from the executable runtime manifest. There is no remote proving service supplied by the SDK.

Always await `wallet.close()` after use. Returned signers remain caller-owned and need their own `dispose()`. See the [walkthrough](walkthrough.md) for complete cleanup.
