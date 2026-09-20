# Query and stream lightwallet data

`createLightClient` combines the network codecs with a lightwallet transport. `grpc` selects native gRPC on Node and gRPC-Web in browsers. The endpoint must serve the corresponding protocol.

```ts
import { createLightClient, grpc } from '@jp4g/zcash.js';
import type { Network } from '@jp4g/zcash.js';

export function connectLight(network: Network, endpoint: string) {
  return createLightClient({
    network,
    transport: grpc(endpoint, {
      sourceId: 'app-light',
      timeoutMs: 15_000,
      readRetry: { attempts: 1, delayMs: 0 },
      maxResponseBytes: 4 * 1024 * 1024,
    }),
  });
}
```

Creation is lazy; the first use performs the handshake. Server identity and network evidence must match your configured network.

## Stream a finite block range

```ts
import type { LightClient } from '@jp4g/zcash.js';

export async function readBlocks(
  light: LightClient, fromHeight: number, toHeight: number, signal: AbortSignal,
) {
  const points = [];
  for await (const block of light.streamCompactBlocks({ fromHeight, toHeight, signal })) {
    points.push(block.point);
  }
  return points;
}
```

Both range endpoints are inclusive. This example retains only block points; processing a stream does not scan a wallet. Use `wallet.sync()` for local account scanning.

Other methods include `getTip`, `getServerInfo`, `getTransaction`, `getTreeState`, `getSubtreeRoots`, `getAddressUtxos`, `getAddressBalance`, `streamAddressTransactions`, and `streamMempool`. A transparent address balance is an exact bigint but is not a shielded wallet balance.

Use an `AbortController` to stop a long stream, or break a `for await` loop. Do not pull the same iterator concurrently.

Reported transport and protocol failures reject. Some backends can hide failures behind empty replies, which the SDK cannot distinguish from valid empty results. Check your provider's behavior before treating an empty result as complete.

For an application-owned byte transport, `CustomLightTransport` accepts bounded protobuf messages at the supported protocol revision. The Node-only `zcash.js/grpc-node` entry exports `createGrpcNodeTransport`; ordinary applications can use `grpc` without importing that lower-level adapter.
