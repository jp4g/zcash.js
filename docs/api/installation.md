# Installation and first request

## Install the local package

Use Node **22.12 or newer** and ESM. The prepared version is `0.1.0-rc.1`;
registry availability depends on owner publication. Until then, install the local
tarball below. After publication, pin `npm install @jp4g/zcash.js@0.1.0-rc.1`.

From the repository:

```sh
npm ci
mkdir -p /tmp/zcash-package
npm pack --pack-destination /tmp/zcash-package
```

From your application:

```sh
npm install /tmp/zcash-package/jp4g-zcash.js-0.1.0-rc.1.tgz
```

Use an `.mjs` entry point or set `"type": "module"` in your application's `package.json`. TypeScript applications can use named imports from `@jp4g/zcash.js`. The package does not expose a CommonJS `require` entry.

`npm pack` builds and verifies the included assets before creating the tarball.
Installing it requires no Rust toolchain or separate runtime/proving download.
The tarball includes executable code, TypeScript declarations, lazy runtime and
proving assets, integrity/build inventories, the README/changelog and licenses.
Source tests, private wallets and internal planning documents are excluded.

## Read the latest block

This function is a complete first query. Supply your network definition and the URL of its JSON-RPC server; the SDK does not choose a network or provider for you.

```ts
import { createPublicClient, defineNetwork, http } from '@jp4g/zcash.js';
import type { NetworkDefinition } from '@jp4g/zcash.js';

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

Import the same package through your ESM bundler. Queries do not start the bundled wallet runtime or open a database. Your server must allow the application's origin through CORS. For lightwallet queries, the browser endpoint must provide **gRPC-Web**, not only native gRPC.

Wallet applications additionally need workers and the storage/runtime setup in [platforms](platforms.md).

## Develop the SDK locally

```sh
npm run check
npm run docs:typecheck
npm run docs:build
npm run docs:dev
```

The last command serves the guide at `http://127.0.0.1:4173/`.
