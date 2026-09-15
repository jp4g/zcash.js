# Installation and first request

## Install the local package

Use Node **22.12 or newer** and ESM. The repository has no published npm release.

From the repository:

```sh
npm ci
npm run build
mkdir -p /tmp/zcash-package
npm pack --ignore-scripts --pack-destination /tmp/zcash-package
```

From your application:

```sh
npm install /tmp/zcash-package/zcash.js-0.0.0.tgz
```

Use an `.mjs` entry point or set `"type": "module"` in your application's `package.json`. TypeScript applications can use named imports from `zcash.js`. The package does not expose a CommonJS `require` entry.

## Read the latest block

This function is a complete first query. Supply your network definition and the URL of its JSON-RPC server; the SDK does not choose a network or provider for you.

```ts
import { createPublicClient, defineNetwork, http } from 'zcash.js';
import type { NetworkDefinition } from 'zcash.js';

export async function latestBlock(definition: NetworkDefinition, rpcUrl: string) {
  const network = await defineNetwork(definition);
  const client = createPublicClient({
    network,
    transport: http(rpcUrl, {
      sourceId: 'app-rpc',
      timeoutMs: 15_000,
      readRetry: { attempts: 1, delayMs: 0 },
      maxResponseBytes: 4 * 1024 * 1024,
    }),
    observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 16 },
  });
  const tip = await client.getTip();
  return client.getBlockHeader({ hash: tip.hash });
}
```

`getTip()` returns a height, display-order block hash, source label, and observation time. Querying the header by that hash keeps the second request tied to the same block if the tip changes. A missing header returns `null`; an unsupported server method rejects.

See [network configuration](networks-amounts.md) for `NetworkDefinition`. Use a server that supports the RPC methods you call. A network mismatch fails rather than silently switching networks.

## Browser applications

Import the same package through your ESM bundler. Queries do not need a wallet database or the separate wallet runtime. Your server must allow the application's origin through CORS. For lightwallet queries, the browser endpoint must provide **gRPC-Web**, not only native gRPC.

Wallet applications additionally need workers and the storage/runtime setup in [platforms](platforms.md).

## Develop the SDK locally

```sh
npm run check
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The last command serves the guide at `http://127.0.0.1:4173/`.
