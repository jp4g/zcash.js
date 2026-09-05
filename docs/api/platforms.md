# Node and browser behavior

::: tip Proposed Contract
One TypeScript interface uses WASM-first runtimes on both platforms. Heavy work belongs off the application event loop; cryptographic parallelism is separate from database ownership.
:::

## Node

A dedicated `worker_threads` owner runs baseline WASM with bundled SQLite and a filesystem VFS. Public HTTP JSON-RPC and native lightwallet gRPC remain host transports. Shared Rayon workers require separate bootstrap qualification; choosing a Node binding-generator target does not establish thread readiness. Native/N-API acceleration is deferred to [issue #11](../planning/future-issues.md#issue-11-wasm-performance-and-possible-native-acceleration).

## Browser

A dedicated worker owns OPFS synchronous storage integration. The application must supply compatible gRPC-Web endpoints and resolve worker/module/parameter assets under its CSP, CORS, MIME and origin rules. Browser fetch is not native gRPC. OPFS may be unavailable, quota-limited or evicted; reject durable opening explicitly instead of substituting memory.

Threaded selection needs a distinct artifact, secure context, suitable isolation, SharedArrayBuffer/thread support and successful worker bootstrap. Typical embedding headers are COOP `same-origin` and COEP `require-corp` or supported `credentialless`, with compatible cross-origin assets and permissions. The SDK cannot set application-page headers.

## Selection and failures

`threading.mode: 'baseline'` chooses non-shared code. `prefer-threaded` checks prerequisites before loading incompatible code, then awaits pool readiness with the configured timeout. Missing prerequisites select baseline; partial failed bootstrap is cleaned up before a **fresh** baseline instance. Sanitized diagnostics report baseline/threaded/fallback and reason. No fallback replays a failed wallet mutation or changes storage/provider/security policy.

::: info Requires Qualification
Baseline scanner liveness is a source-derived risk: backend Rayon/flume scheduling may still require an explicit serial integration seam. Merely putting WASM in a worker does not fix it. Baseline and threaded scanning, both VFS modes, Node module formats, SSR/query-only loading and real bundler asset resolution remain F1–F8 gates. No supported browser/version matrix, WASI runtime or performance claim is established.
:::

Separate baseline/shared artifacts each require a pinned canonical manifest binding the complete executable graph and mode. Verify all module/glue/WASM/worker/bootstrap bytes before any import or worker start, under the [H1.1 URL and loading policy](host-contract.md#h1-1-negotiation-before-authority). Query-only and SSR imports must not eagerly touch workers, SAB or proving assets. Proving is bounded to one admitted proof with configured queues and memory; measured budgets remain future work. Review the [host contract](host-contract.md) for lifecycle details.
