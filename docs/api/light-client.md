# Light client

::: tip Proposed Contract
`createLightClient({ network, transport: grpc(...) })` supplies lightwallet protocol data. Downloading compact blocks does not scan wallet state.
:::

<<< ./examples/light.ts

## Queries and streams

Use `getTip` and `getServerInfo` for source/network/protocol observations. `getTransaction`, `getAddressUtxos`, `getAddressBalance`, `getTreeState` and `getSubtreeRoots` return bounded data. Address balance is transparent-only. It cannot reveal a unified address's private account balance.

`streamCompactBlocks` and `streamAddressTransactions` take inclusive height ranges; `streamMempool` is a separate raw-transaction stream. Subtree requests specify shielded pool, bigint start index and positive bounded limit. Breaking iteration or aborting must release the stream. A partial stream is not complete coverage; there is no automatic stream replay.

`broadcastTransaction` has the same one-attempt report semantics as the public client. Supplying a light client to a wallet does **not** implicitly configure it as broadcaster.

## Transport adapters

`grpc` selects native gRPC on Node and permitted gRPC-Web mechanics in browsers. The application supplies a compatible endpoint; zcash.js operates no gateway. Browser unary balance adaptation and status/trailer normalization belong to the host adapter.

An advanced `CustomLightTransport` supplies `kind`, `sourceId`, pinned `protocolRevision`, `unary` and pull-bounded `stream` over protobuf bytes. Allowed method names are the declared `LightUnaryMethod` and `LightStreamMethod` unions. Payload and iterator bounds apply at the host boundary even for custom adapters.

::: info Requires Qualification
Server method availability, pruning, transparent coverage, Ironwood fields and gRPC-Web streaming/CORS require fixtures and deployment qualification. Decode GetTransaction uint64 sentinels before numeric conversion: zero means mempool and all-ones off-main-chain. Neither is a mined height.
:::
