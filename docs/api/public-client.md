# Public client

::: tip Proposed Contract
Use `createPublicClient` with `http` for wallet-independent HTTP JSON-RPC queries and raw broadcast. Construction is lazy; first use validates protocol/network. No wallet or proving assets should load just to query a tip.
:::

<<< ./examples/public.ts

## Read chain data

`getTip`, `getBlock` and `getBlockHeader` expose chain identity and source observations. Block selection accepts height **or** hash. `getTransaction` returns raw bytes and observation, or null after a successful absent lookup. `getTransactionStatus` distinguishes `notSeen`, `mempool`, `mined`, `offMainChain` and `unknown` with nullable inclusion/tip and prior inclusion.

`getUtxos` accepts a nonempty list of transparent addresses. It is a public server view, not a shielded account balance or a wallet spendability verdict. `getTreeState` and bounded `getSubtreeRoots` provide scan inputs. Optional provider methods fail `METHOD_NOT_SUPPORTED`; missing indices and transport failures are not empty results.

## Submit and observe

`broadcastTransaction({ bytes })` attempts submission once and returns a plain `BroadcastReport`. Its txid is derived from the exact bytes and checked against the server response. `acknowledged` means the endpoint acknowledged submission; `rejected` retains a sanitized code; timeout after dispatch is `unknown`. Broadcast is never automatically retried.

`waitForTransaction` resolves checked inclusion at a positive confirmation threshold (default one). `watchTransaction` yields bounded observations and can report a reorg. Depth requires coherent inclusion and tip identity. Neither provides full consensus verification.

`TransportOptions` requires a source label, per-request timeout, read retry policy and response bound. Optional headers are application callbacks; credentials and endpoint URLs must stay out of diagnostics. Observation options set polling and buffer bounds; overflow errors instead of dropping updates silently.
